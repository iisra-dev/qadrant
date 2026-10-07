<script lang="ts">
	import { onMount } from 'svelte';
	import { pushState } from '$app/navigation';
	import { page } from '$app/state';
	import { clock } from '$lib/app/clock.svelte';
	import { media } from '$lib/app/media.svelte';
	import { agendaForDay } from '$lib/domain/agenda';
	import { nextToday } from '$lib/domain/scheduler';
	import { formatDuration, formatTime } from '$lib/domain/format';
	import { sameDay } from '$lib/domain/dates';
	import { speechMode } from '$lib/app/speech';
	import TaskDetail from '$lib/task/TaskDetail.svelte';
	import { capture } from '$lib/app/capture.svelte';
	import { repos } from '$lib/db/repositories';
	import { formatLongDate } from '$lib/domain/format';
	import { groupByQuadrant, isOverdue, matrixTasks, staleEliminate } from '$lib/domain/matrix';
	import { QUADRANTS, type Quadrant, type Task } from '$lib/domain/types';
	import { allTasks, openTasks, people } from '$lib/stores';
	import { arrivals } from '$lib/sync/activity.svelte';
	import { i18n } from '$lib/i18n/index.svelte';
	import { AgendaBlock, AiDot, Button, Drawer, Icon, QuadrantCard, quadrantVars, Sheet, SyncIndicator, TaskRow, UndoToast } from '$lib/ui';

	// Open tasks plus those done in the last 24 hours, struck through (docs/01).
	const groups = $derived(groupByQuadrant(matrixTasks($openTasks, $allTasks, clock.now), clock.now));
	const openCount = (quadrant: Quadrant) => groups[quadrant].filter((task) => task.status === 'open').length;
	const openEliminate = $derived(groups.eliminate.filter((task) => task.status === 'open'));
	const today = $derived(formatLongDate(clock.now, i18n.lang));
	const summary = $derived(QUADRANTS.filter((quadrant) => openCount(quadrant) > 0));

	function personName(id: string | undefined): string | undefined {
		return id ? $people.find((person) => person.id === id)?.name : undefined;
	}

	const todayAgenda = $derived(agendaForDay($openTasks, clock.now));
	const next = $derived(nextToday($openTasks, clock.now));
	const stale = $derived(staleEliminate($openTasks, clock.now));

	// Undo notice for archiving.
	let toast = $state<{ id: number; message: string; undo: () => Promise<void> } | null>(null);
	let toastId = 0;

	function offerUndo(message: string, undo: () => Promise<void>) {
		toast = { id: ++toastId, message, undo };
	}

	// Ticking strikes the task through; unticking opens it again, so no undo notice is needed.
	async function complete(task: Task) {
		await repos.tasks.complete(task.id);
	}

	async function archiveIds(ids: string[]) {
		await repos.tasks.archive(ids);
		offerUndo(i18n.m.matrix.archived(ids.length), async () => {
			for (const id of ids) await repos.tasks.reopen(id);
		});
	}

	async function archiveStale() {
		await archiveIds(stale.map((task) => task.id));
	}

	async function undo() {
		const current = toast;
		toast = null;
		await current?.undo();
	}

	/** Today's time of a task, shown at the end of its row. */
	function timeToday(task: Task): string | undefined {
		if (!task.scheduledAt) return undefined;
		const start = new Date(task.scheduledAt);
		return sameDay(start, clock.now) ? formatTime(start) : undefined;
	}

	// A microphone only if the browser can dictate at all; the sheet asks before sending audio out (docs/01).
	let canDictate = $state(false);
	onMount(() => {
		void speechMode(i18n.lang).then((mode) => (canDictate = mode !== 'none'));
	});

	// On web the detail opens as a side panel with shallow routing (docs/02).
	function openDetail(event: MouseEvent, id: string) {
		if (!media.web || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
		event.preventDefault();
		pushState(`/task/${id}`, { taskId: id });
	}

	let confirmArchive = $state(false);

	async function archiveAll() {
		confirmArchive = false;
		await archiveIds(openEliminate.map((task) => task.id));
	}
</script>

<svelte:head>
	<title>{i18n.m.common.pageTitle(i18n.m.matrix.title)}</title>
</svelte:head>

{#snippet eliminateFooter()}
	{#if stale.length > 0}
		<p class="suggest"><AiDot />{i18n.m.matrix.stale(stale.length)}</p>
		<button class="archive" type="button" onclick={archiveStale}>
			{i18n.m.matrix.archiveStale(stale.length)}
		</button>
	{/if}
	<button class="archive" type="button" onclick={() => (confirmArchive = true)}>
		{i18n.m.matrix.archiveAll(openEliminate.length)}
	</button>
{/snippet}

{#snippet nextCard()}
	{#if next}
		<!-- The first thing to do today, before any list (docs/01, "Matriz"). -->
		<a class="next" href="/agenda">
			<span class="next-time">
				<span>{formatTime(next.start)}</span>
				<span class="next-duration">{formatDuration(next.task.durationMin ?? 30)}</span>
			</span>
			<span class="next-body">
				<span class="next-label"><AiDot />{i18n.m.matrix.nextLabel}</span>
				<span class="next-title">{next.task.title}</span>
			</span>
			<span class="next-chevron"><Icon name="next" size={20} /></span>
		</a>
	{/if}
{/snippet}

<div class="page" class:wide={media.wide}>
<div class="matrix">
	<header>
		<span class="date">{today.charAt(0).toUpperCase() + today.slice(1)}<SyncIndicator /></span>
		<h1>{i18n.m.matrix.title}</h1>
		{#if !media.web && summary.length > 0}
			<!-- One line of pills: only quadrants with something to do; each jumps to its list. -->
			<nav class="summary" aria-label={i18n.m.matrix.quadrants}>
				{#each summary as quadrant (quadrant)}
					<a href={`#quadrant-${quadrant}`} style={quadrantVars(quadrant)}>
						{i18n.m.quadrants[quadrant].name}<span class="pill-count">{openCount(quadrant)}</span>
					</a>
				{/each}
			</nav>
		{/if}
	</header>
	{#if !media.wide}{@render nextCard()}{/if}

	<div class="grid">
		{#each QUADRANTS as quadrant (quadrant)}
			<QuadrantCard {quadrant} items={groups[quadrant]} count={openCount(quadrant)} showCount={media.web} limit={media.web ? 6 : 3} footer={quadrant === 'eliminate' && openEliminate.length > 0 ? eliminateFooter : undefined}>
				{#snippet row(item)}
					{@const task = item as Task}
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<div onclick={(event) => {
						if ((event.target as HTMLElement).closest('a')) openDetail(event, task.id);
					}}>
					<TaskRow
						title={task.title}
						href={`/task/${task.id}`}
						detail={quadrant === 'delegate' ? personName(task.delegatedTo) : undefined}
						meta={timeToday(task)}
						overdue={isOverdue(task, clock.now)}
						done={task.status === 'done'}
						landed={task.id === capture.landed || arrivals.has(task.id)}
						oncomplete={() => complete(task)}
						onreopen={() => repos.tasks.reopen(task.id)}
					/>
					</div>
				{/snippet}
			</QuadrantCard>
		{/each}
	</div>

	{#if !media.web}
		<!-- Capture within thumb reach, above the tabs. -->
		<div class="capture-bar">
			<button class="capture" type="button" onclick={() => capture.show()}>
				<Icon name="plus" size={20} />{i18n.m.matrix.capture}
			</button>
			{#if canDictate}
				<button class="dictate" type="button" aria-label={i18n.m.nav.dictate} onclick={() => capture.show('', { dictate: true })}>
					<Icon name="mic" />
				</button>
			{/if}
		</div>
	{/if}
</div>

{#if media.wide}
	<aside aria-labelledby="today-agenda">
		{@render nextCard()}
		<h2 id="today-agenda">{i18n.m.matrix.todayAgenda}</h2>
		{#each todayAgenda as task (task.id)}
			<AgendaBlock
				time={formatTime(new Date(task.scheduledAt!))}
				title={task.title}
				meta={`${i18n.m.quadrants[task.quadrant].name} · ${formatDuration(task.durationMin ?? 30)}`}
				href={`/task/${task.id}`}
				quadrant={task.quadrant}
				minutes={task.durationMin ?? 30}
			/>
		{:else}
			<p class="empty">{i18n.m.matrix.nothingTimed}</p>
		{/each}
	</aside>
{/if}
</div>

<Drawer open={Boolean(page.state.taskId)} label={i18n.m.matrix.detailPanel} onclose={() => history.back()}>
	{#if page.state.taskId}
		<TaskDetail id={page.state.taskId} onclose={() => history.back()} />
	{/if}
</Drawer>

<Sheet open={confirmArchive} label={i18n.m.matrix.archiveSheet} onclose={() => (confirmArchive = false)}>
	<h2 class="confirm-title">{i18n.m.matrix.archiveAsk(openEliminate.length)}</h2>
	<p class="confirm-text">{i18n.m.matrix.archiveText}</p>
	<Button size="lg" block onclick={archiveAll}>{i18n.m.matrix.archive}</Button>
	<Button variant="secondary" size="lg" block onclick={() => (confirmArchive = false)}>{i18n.m.common.cancel}</Button>
</Sheet>

{#if toast}
	{#key toast.id}
		<UndoToast message={toast.message} onundo={undo} ondismiss={() => (toast = null)} />
	{/key}
{/if}

<style>
	.page {
		flex-grow: 1;
		width: 100%;
		max-width: 1280px;
		margin: 0 auto;
		display: flex;
	}
	.page.wide {
		gap: var(--space-6);
		padding: 0 var(--space-6);
	}
	.matrix {
		flex-grow: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		padding: var(--space-5) var(--space-4) 0;
	}
	header {
		padding: 0 var(--space-1);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.date {
		font-size: 13px;
		color: var(--text-muted);
	}
	h1 {
		margin: 0;
		font-size: 34px;
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.1;
	}
	/* Summary pills: one line that scrolls sideways, cut at the edge to hint there is more. */
	.summary {
		display: flex;
		gap: var(--space-2);
		margin: var(--space-3) calc(-1 * var(--space-5)) 0;
		padding: 0 var(--space-5);
		overflow-x: auto;
		scrollbar-width: none;
	}
	.summary::-webkit-scrollbar {
		display: none;
	}
	.summary a {
		flex-shrink: 0;
		min-height: var(--touch);
		padding: 0 var(--space-4);
		border-radius: var(--radius-pill);
		background: var(--q-bg);
		color: var(--q-ink);
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 15px;
		font-weight: 600;
		white-space: nowrap;
		text-decoration: none;
	}
	.pill-count {
		font-family: var(--font-mono);
		font-weight: 500;
	}
	.next {
		display: flex;
		align-items: center;
		gap: 14px;
		min-height: 72px;
		padding: 14px var(--space-4);
		box-sizing: border-box;
		border-radius: var(--radius-card);
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--text);
		text-decoration: none;
	}
	.next-time {
		min-width: 52px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		font-family: var(--font-mono);
		font-size: 18px;
		font-weight: 500;
	}
	.next-duration {
		font-family: var(--font-body);
		font-size: 12px;
		font-weight: 400;
		color: var(--text-muted);
	}
	.next-body {
		flex-grow: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.next-label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		font-weight: 600;
		color: var(--text-muted);
	}
	.next-title {
		font-family: var(--font-display);
		font-size: 20px;
		font-weight: 600;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}
	.next-chevron {
		flex-shrink: 0;
		color: var(--text-muted);
		display: flex;
	}
	/* Phone: one column, full-width rows that let long titles wrap (docs/05, "Responsive"). */
	.grid {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		padding-bottom: var(--space-4);
	}
	.suggest {
		margin: 0;
		font-size: 13px;
		line-height: 1.4;
	}
	.archive {
		min-height: var(--touch);
		padding: 0 14px;
		border: 1px solid var(--border-control);
		border-radius: var(--radius-control);
		background: var(--surface-muted);
		font: inherit;
		font-size: 15px;
		font-weight: 600;
		color: inherit;
		cursor: pointer;
	}
	.capture-bar {
		position: sticky;
		bottom: calc(64px + env(safe-area-inset-bottom));
		margin: 0 calc(-1 * var(--space-4));
		padding: var(--space-6) var(--space-4) var(--space-3);
		display: flex;
		gap: var(--space-2);
		/* Scroll edge: the list fades out behind the capture instead of being cut. */
		background: linear-gradient(to bottom, transparent, var(--bg) 45%);
		pointer-events: none;
	}
	.capture-bar > * {
		pointer-events: auto;
	}
	.capture {
		flex-grow: 1;
		min-height: 56px;
		border: 1px solid var(--capture-border);
		border-radius: 28px;
		background: var(--capture-bg);
		color: var(--capture-text);
		display: flex;
		align-items: center;
		gap: var(--space-2-5);
		padding: 0 var(--space-5);
		font: inherit;
		font-size: 17px;
		font-weight: 500;
		box-shadow: 0 6px 20px rgb(9 9 11 / 0.18);
		cursor: pointer;
	}
	.dictate {
		width: 56px;
		height: 56px;
		flex-shrink: 0;
		border-radius: 28px;
		border: 1px solid var(--border-control);
		background: var(--surface);
		color: var(--text);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	aside {
		flex: 0 0 340px;
		padding: var(--space-6) 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	aside h2 {
		margin: var(--space-4) 0 var(--space-2);
		font-size: 20px;
		font-weight: 600;
	}
	.empty {
		margin: 0;
		font-size: 14px;
		color: var(--text-muted);
	}
	/* Tablet and up: the 2 x 2 matrix; from 1024 px the next task heads the agenda column. */
	@media (min-width: 768px) {
		.matrix {
			padding: var(--space-6) var(--space-6) 0;
		}
		.page.wide .matrix {
			padding: var(--space-6) 0 0;
		}
		.grid {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			align-items: start;
			gap: var(--space-4);
			padding-bottom: var(--space-6);
		}
	}
	.confirm-title {
		margin: 0;
		font-size: 22px;
	}
	.confirm-text {
		margin: 0;
		color: var(--text-muted);
		font-size: 14px;
	}
</style>
