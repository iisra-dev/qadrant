<script lang="ts">
	import { pushState } from '$app/navigation';
	import { page } from '$app/state';
	import { clock } from '$lib/app/clock.svelte';
	import { media } from '$lib/app/media.svelte';
	import { agendaForDay } from '$lib/domain/agenda';
	import { nextToday } from '$lib/domain/scheduler';
	import { formatDuration, formatTime } from '$lib/domain/format';
	import TaskDetail from '$lib/task/TaskDetail.svelte';
	import { capture } from '$lib/app/capture.svelte';
	import { repos } from '$lib/db/repositories';
	import { formatLongDate } from '$lib/domain/format';
	import { groupByQuadrant, isOverdue, staleEliminate } from '$lib/domain/matrix';
	import { QUADRANTS, type Task } from '$lib/domain/types';
	import { openTasks, people } from '$lib/stores';
	import { AgendaBlock, AiDot, Button, Drawer, Icon, Pill, QuadrantCard, QUADRANT_META, Sheet, TaskRow } from '$lib/ui';
	import ArchiveToast from './ArchiveToast.svelte';

	const groups = $derived(groupByQuadrant($openTasks, clock.now));
	const today = $derived(formatLongDate(clock.now));

	function personName(id: string | undefined): string | undefined {
		return id ? $people.find((person) => person.id === id)?.name : undefined;
	}

	const todayAgenda = $derived(agendaForDay($openTasks, clock.now));
	const next = $derived(nextToday($openTasks, clock.now));
	const stale = $derived(staleEliminate($openTasks, clock.now));

	async function archiveStale() {
		const ids = stale.map((task) => task.id);
		await repos.tasks.archive(ids);
		archived = ids;
	}

	// On web the detail opens as a side panel with shallow routing (docs/02).
	function openDetail(event: MouseEvent, id: string) {
		if (!media.web || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
		event.preventDefault();
		pushState(`/task/${id}`, { taskId: id });
	}

	let confirmArchive = $state(false);
	let archived = $state<string[]>([]);

	async function archiveAll() {
		const ids = groups.eliminate.map((task) => task.id);
		confirmArchive = false;
		await repos.tasks.archive(ids);
		archived = ids;
	}

	async function undoArchive() {
		const ids = archived;
		archived = [];
		for (const id of ids) await repos.tasks.reopen(id);
	}
</script>

<svelte:head>
	<title>Hoy · Qadrant</title>
</svelte:head>

<div class="page" class:wide={media.wide}>
<div class="matrix">
	<header>
		<span class="date">{today.charAt(0).toUpperCase() + today.slice(1)}</span>
		<h1>Hoy</h1>
		{#if next}
			<div class="next">
				<Pill href="/agenda" ai>Siguiente: {next.task.title} · {formatTime(next.start)}</Pill>
			</div>
		{/if}
	</header>

	<div class="grid">
		{#each QUADRANTS as quadrant (quadrant)}
			<QuadrantCard {quadrant} items={groups[quadrant]} limit={media.web ? 6 : 3}>
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
						overdue={isOverdue(task, clock.now)}
						oncomplete={() => repos.tasks.complete(task.id)}
					/>
					</div>
				{/snippet}
				{#snippet footer()}
					{#if quadrant === 'eliminate' && stale.length > 0}
						<div class="suggest">
							<p><AiDot />{stale.length === 1 ? 'Una lleva' : `${stale.length} llevan`} 14 días sin tocarse.</p>
							<button class="archive" type="button" onclick={archiveStale}>
								{stale.length === 1 ? 'Archivarla' : 'Archivarlas'}
							</button>
						</div>
					{/if}
					{#if quadrant === 'eliminate' && groups.eliminate.length > 0}
						<button class="archive" type="button" onclick={() => (confirmArchive = true)}>Archivar</button>
					{/if}
				{/snippet}
			</QuadrantCard>
		{/each}
	</div>

	{#if !media.web}
		<button class="capture" type="button" onclick={() => capture.show()}>
			<span>¿Qué tienes en mente?</span>
			<span class="capture-icon" aria-hidden="true"><Icon name="mic" size={18} /></span>
		</button>
	{/if}
</div>

{#if media.wide}
	<aside aria-labelledby="today-agenda">
		<h2 id="today-agenda">Agenda de hoy</h2>
		{#each todayAgenda as task (task.id)}
			<AgendaBlock
				time={formatTime(new Date(task.scheduledAt!))}
				title={task.title}
				meta={`${QUADRANT_META[task.quadrant].name} · ${formatDuration(task.durationMin ?? 30)}`}
				href={`/task/${task.id}`}
				quadrant={task.quadrant}
				minutes={task.durationMin ?? 30}
			/>
		{:else}
			<p class="empty">Nada con hora hoy.</p>
		{/each}
	</aside>
{/if}
</div>

<Drawer open={Boolean(page.state.taskId)} label="Detalle de tarea" onclose={() => history.back()}>
	{#if page.state.taskId}
		<TaskDetail id={page.state.taskId} onclose={() => history.back()} />
	{/if}
</Drawer>

<Sheet open={confirmArchive} label="Archivar tareas" onclose={() => (confirmArchive = false)}>
	<h2 class="confirm-title">¿Archivar {groups.eliminate.length === 1 ? 'la tarea' : `las ${groups.eliminate.length} tareas`} de Eliminar?</h2>
	<p class="confirm-text">Dejarán de verse en la Matriz. Podrás deshacerlo durante unos segundos.</p>
	<Button size="lg" block onclick={archiveAll}>Archivar</Button>
	<Button variant="secondary" size="lg" block onclick={() => (confirmArchive = false)}>Cancelar</Button>
</Sheet>

{#if archived.length}
	<ArchiveToast count={archived.length} onundo={undoArchive} ondismiss={() => (archived = [])} />
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
	aside {
		flex: 0 0 340px;
		padding: var(--space-6) 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	aside h2 {
		margin: 0 0 var(--space-2);
		font-size: 20px;
		font-weight: 700;
	}
	.empty {
		margin: 0;
		font-size: 14px;
		color: var(--text-muted);
	}
	@media (min-width: 768px) {
		h1 {
			font-size: 36px;
		}
		.grid {
			grid-auto-rows: minmax(260px, auto);
			gap: 14px;
			padding-bottom: var(--space-6);
		}
	}
	.matrix {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		max-width: 1200px;
		width: 100%;
		margin: 0 auto;
	}
	header {
		padding: var(--space-6) var(--space-5) var(--space-3);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.next {
		margin-top: var(--space-2);
		display: flex;
	}
	.date {
		font-size: 13px;
		color: var(--text-muted);
	}
	h1 {
		margin: 0;
		font-size: 32px;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.grid {
		flex-grow: 1;
		padding: 0 var(--space-4);
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		grid-auto-rows: minmax(200px, auto);
		gap: var(--space-2-5);
	}
	.suggest {
		margin-top: var(--space-1);
	}
	.suggest p {
		margin: 0;
		font-size: 12px;
		line-height: 1.4;
	}
	.archive {
		align-self: flex-start;
		min-height: var(--touch);
		border: 0;
		background: transparent;
		padding: 0;
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		color: inherit;
		text-decoration: underline;
		cursor: pointer;
	}
	.capture {
		position: sticky;
		bottom: 76px;
		margin: var(--space-3) var(--space-4);
		min-height: 56px;
		border: 0;
		border-radius: 28px;
		background: var(--cta-bg);
		color: var(--cta-text);
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 var(--space-2) 0 var(--space-5);
		font: inherit;
		font-size: 15px;
		cursor: pointer;
	}
	.capture-icon {
		width: 40px;
		height: 40px;
		border-radius: 20px;
		background: var(--cta-text);
		color: var(--cta-bg);
		display: flex;
		align-items: center;
		justify-content: center;
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
