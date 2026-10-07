<script lang="ts">
	import { clock } from '$lib/app/clock.svelte';
	import { media } from '$lib/app/media.svelte';
	import { currentSettings } from '$lib/app/context';
	import { agendaForDay, agendaItems, eventsForDay, waitingOnOthers, weekDays, withoutSlot } from '$lib/domain/agenda';
	import { addDays, isoWeekday, sameDay, startOfDay } from '$lib/domain/dates';
	import { formatDayMonth, formatDuration, formatLongDate, formatTime, weekdayShort } from '$lib/domain/format';
	import { allTasks, calendarEvents, people, settings } from '$lib/stores';
	import { weeklyReview } from '$lib/domain/review';
	import { QUADRANTS } from '$lib/domain/types';
	import WeekView from './WeekView.svelte';
	import { openTasks } from '$lib/stores';
	import { taskActions } from '$lib/tasks/actions';
	import { i18n } from '$lib/i18n/index.svelte';
	import { AgendaBlock, IconButton } from '$lib/ui';

	// Web: week view by default, working week (docs/01); mobile: day view only.
	let view = $state<'day' | 'week'>('week');
	const week = $derived(media.web && view === 'week');
	// From 1024 px the week keeps "No slot yet" and "Waiting on others" in a column beside it (docs/01).
	const side = $derived(week && media.wide);
	let weekOffset = $state(0);
	const days = $derived(weekDays(clock.now, weekOffset, ($settings ?? currentSettings()).workDays));
	const weekLabel = $derived(
		days.length ? `${formatDayMonth(days[0], i18n.lang)} – ${formatDayMonth(days.at(-1)!, i18n.lang)}` : ''
	);
	const weekTitle = $derived(
		weekOffset === 0
			? i18n.m.agenda.thisWeek
			: weekOffset === 1
				? i18n.m.agenda.nextWeekTitle
				: weekOffset === -1
					? i18n.m.agenda.lastWeek
					: i18n.m.agenda.weekTitle
	);

	let offset = $state(0);
	const day = $derived(addDays(startOfDay(clock.now), offset));
	const items = $derived(agendaItems(agendaForDay($openTasks, day)));
	const dayEvents = $derived(eventsForDay($calendarEvents, day));
	type Row = { kind: 'task'; item: (typeof items)[number] } | { kind: 'event'; event: (typeof dayEvents.timed)[number] };
	const rows = $derived(
		[
			...items.map((item): Row => ({ kind: 'task', item })),
			...dayEvents.timed.map((event): Row => ({ kind: 'event', event }))
		].sort((a, b) => rowStart(a) - rowStart(b))
	);
	function rowStart(row: Row): number {
		return row.kind === 'task' ? row.item.start.getTime() : new Date(row.event.start).getTime();
	}
	function minutesBetween(start: string, end: string): number {
		return Math.max(15, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000));
	}
	const pending = $derived(withoutSlot($openTasks));
	const waiting = $derived(waitingOnOthers($openTasks));
	// Weekly review (docs/01): only when there is something to look at.
	const review = $derived(weeklyReview($allTasks, clock.now));

	function personName(id: string | undefined): string | undefined {
		return id ? $people.find((p) => p.id === id)?.name : undefined;
	}

	/** "Check Mon" within a week, "Check Oct 20" later, "Check today"/"Check now" when due. */
	function followUpLabel(iso: string | undefined): string {
		if (!iso) return i18n.m.agenda.noFollowUp;
		const date = new Date(iso);
		const today = startOfDay(clock.now).getTime();
		const days = Math.round((startOfDay(date).getTime() - today) / 86_400_000);
		if (days < 0) return i18n.m.agenda.checkNow;
		if (days === 0) return i18n.m.agenda.checkToday;
		if (days < 7) return i18n.m.agenda.checkOn(weekdayShort(date, i18n.lang));
		return i18n.m.agenda.checkOn(formatDayMonth(date, i18n.lang));
	}
	const label = $derived(formatLongDate(day, i18n.lang));
	const isToday = $derived(sameDay(day, clock.now));

	// Day view: the week of the selected day as a strip in thumb reach (docs/01, "Agenda").
	const strip = $derived(weekDays(day, 0, [1, 2, 3, 4, 5, 6, 7]));
	const workDays = $derived(($settings ?? currentSettings()).workDays);
	function pick(date: Date) {
		offset = Math.round((startOfDay(date).getTime() - startOfDay(clock.now).getTime()) / 86_400_000);
	}
	// Where the "Now" line goes among today's blocks: before the first one that starts later.
	const nowIndex = $derived(isToday ? rows.findIndex((row) => rowStart(row) > clock.now.getTime()) : -2);

	let message = $state('');
	let busy = $state(false);

	async function findSlots() {
		busy = true;
		try {
			const { placed, unplaced } = await taskActions.findSlots(currentSettings());
			message =
				placed === 0 ? i18n.m.agenda.noGaps : i18n.m.agenda.placed(placed, unplaced);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{i18n.m.common.pageTitle(i18n.m.agenda.title)}</title>
</svelte:head>

<div class="agenda" class:wide={week}>
	<header>
		<div class="titles">
			{#if week}
				<span class="date" aria-live="polite">{weekLabel}</span>
				<h1>{weekTitle}</h1>
			{:else}
				<span class="date" aria-live="polite">{label.charAt(0).toUpperCase() + label.slice(1)}</span>
				<h1>{i18n.m.agenda.title}</h1>
			{/if}
		</div>
		<div class="nav">
			{#if media.web}
				<div class="views" role="group" aria-label={i18n.m.agenda.view}>
					<button type="button" aria-pressed={view === 'day'} onclick={() => (view = 'day')}>{i18n.m.agenda.day}</button>
					<button type="button" aria-pressed={view === 'week'} onclick={() => (view = 'week')}>{i18n.m.agenda.week}</button>
				</div>
			{/if}
			{#if week}
				<IconButton label={i18n.m.agenda.prevWeek} icon="prev" onclick={() => weekOffset--} />
				{#if weekOffset !== 0}
					<button class="today" type="button" onclick={() => (weekOffset = 0)}>{i18n.m.common.today}</button>
				{/if}
				<IconButton label={i18n.m.agenda.nextWeek} icon="next" onclick={() => weekOffset++} />
			{:else}
				<IconButton label={i18n.m.agenda.prevDay} icon="prev" onclick={() => offset--} />
				{#if !isToday}
					<button class="today" type="button" onclick={() => (offset = 0)}>{i18n.m.common.today}</button>
				{/if}
				<IconButton label={i18n.m.agenda.nextDay} icon="next" onclick={() => offset++} />
			{/if}
		</div>
	</header>

	{#if week}
		<div class="week" class:side>
			<WeekView {days} tasks={$openTasks} events={$calendarEvents} now={clock.now} workHours={($settings ?? currentSettings()).workHours} />
			{#if side}
				<aside>
					{@render pendingSection()}
					{@render waitingSection()}
				</aside>
			{/if}
		</div>
	{:else}
	<div class="strip" role="group" aria-label={i18n.m.agenda.days}>
		{#each strip as date (date.getTime())}
			<button
				type="button"
				aria-pressed={sameDay(date, day)}
				aria-current={sameDay(date, clock.now) ? 'date' : undefined}
				aria-label={formatLongDate(date, i18n.lang)}
				class:off={!workDays.includes(isoWeekday(date))}
				onclick={() => pick(date)}
			>
				<span class="strip-day">{weekdayShort(date, i18n.lang)}</span>
				<span class="strip-date">{date.getDate()}</span>
			</button>
		{/each}
	</div>
	<div class="blocks">
		{#each dayEvents.allDay as event (event.id)}
			<div class="all-day"><span class="all-day-label">{i18n.m.common.allDay}</span>{event.title}</div>
		{/each}
		{#each rows as row, index (row.kind === 'task' ? row.item.tasks[0].id : row.event.id)}
			{#if index === nowIndex}{@render nowLine()}{/if}
			{#if row.kind === 'task'}
				{@const item = row.item}
				<AgendaBlock
					time={formatTime(item.start)}
					title={item.tasks.map((t) => t.title).join(' · ')}
					meta={`${i18n.m.quadrants[item.tasks[0].quadrant].name} · ${formatDuration(item.minutes)}`}
					href={`/task/${item.tasks[0].id}`}
					quadrant={item.tasks[0].quadrant}
					focus={item.focus}
					minutes={item.minutes}
				/>
			{:else}
				{@const minutes = minutesBetween(row.event.start, row.event.end)}
				<AgendaBlock
					time={formatTime(new Date(row.event.start))}
					title={row.event.title}
					meta={i18n.m.agenda.calendarMeta(formatDuration(minutes))}
					{minutes}
				/>
			{/if}
		{:else}
			<p class="empty">{i18n.m.agenda.empty}</p>
		{/each}
		{#if nowIndex === -1 && rows.length}{@render nowLine()}{/if}
	</div>
	{/if}

{#snippet nowLine()}
	<div class="now">
		<span class="now-time">{formatTime(clock.now)}</span>
		<span class="now-line" aria-hidden="true"></span>
		<span class="now-label">{i18n.m.agenda.now}</span>
	</div>
{/snippet}

{#snippet waitingSection()}
	{#if waiting.length}
		<section class="waiting" aria-labelledby="waiting-title">
			<h2 id="waiting-title">{i18n.m.agenda.waiting}</h2>
			{#each waiting as task (task.id)}
				{@const name = personName(task.delegatedTo)}
				<a href={`/task/${task.id}`}>
					<span class="initial" aria-hidden="true">{(name ?? '?').charAt(0).toUpperCase()}</span>
					<span class="what">{name ? `${name} · ` : ''}{task.title}</span>
					<span class="when">{followUpLabel(task.followUpAt)}</span>
				</a>
			{/each}
		</section>
	{/if}
{/snippet}

{#snippet pendingSection()}
	<section class="pending" aria-labelledby="no-slot">
		<h2 id="no-slot">{i18n.m.agenda.noSlot}</h2>
		{#if pending.length}
			<ul>
				{#each pending as task (task.id)}
					<li><a href={`/task/${task.id}`}>{task.title}<span>{` · ${i18n.m.quadrants[task.quadrant].name}`}</span></a></li>
				{/each}
			</ul>
			<button class="find" type="button" onclick={findSlots} disabled={busy}>{i18n.m.agenda.findSlots}</button>
		{:else}
			<p class="empty">{i18n.m.agenda.allScheduled}</p>
		{/if}
		<p class="note" role="status">{message}</p>
	</section>
{/snippet}

	{#if !side}
		{@render waitingSection()}
		{@render pendingSection()}
	{/if}

	{#if review.totalMinutes || review.stale.length}
		<section class="review" aria-labelledby="review-title">
			<h2 id="review-title">{i18n.m.agenda.review}</h2>
			{#if review.totalMinutes}
				<h3 id="review-hours">{i18n.m.agenda.reviewHours}</h3>
				<dl aria-labelledby="review-hours">
					{#each QUADRANTS as quadrant (quadrant)}
						<div class="hours q-{quadrant}">
							<dt>{i18n.m.quadrants[quadrant].name}</dt>
							<dd>{review.minutes[quadrant] ? formatDuration(review.minutes[quadrant]) : '–'}</dd>
						</div>
					{/each}
				</dl>
			{/if}
			{#if review.stale.length}
				<h3 id="review-stale">{i18n.m.agenda.reviewStale}</h3>
				<ul aria-labelledby="review-stale">
					{#each review.stale as { task, weeks } (task.id)}
						<li><a href={`/task/${task.id}`}>{task.title}<span>{` · ${i18n.m.agenda.weeks(weeks)}`}</span></a></li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>

<style>
	.agenda {
		flex-grow: 1;
		width: 100%;
		max-width: 720px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
	}
	header {
		padding: var(--space-5) var(--space-3) var(--space-3) var(--space-5);
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
	}
	.agenda.wide {
		max-width: 1280px;
	}
	.week {
		padding: var(--space-1) var(--space-4) var(--space-3);
	}
	.week.side {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 300px;
		gap: var(--space-5);
		align-items: start;
	}
	aside {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}
	aside .pending,
	aside .waiting {
		margin: 0;
	}
	aside .waiting a {
		min-height: var(--touch);
		padding: var(--space-2) var(--space-3);
	}
	aside .what {
		font-size: 13px;
	}
	.views {
		display: flex;
		margin-right: var(--space-2);
		border: 1px solid var(--border-control);
		border-radius: 26px;
		padding: 3px;
		background: var(--surface);
	}
	.views button {
		min-height: var(--touch);
		padding: 0 14px;
		border: 0;
		border-radius: 22px;
		background: transparent;
		font: inherit;
		font-size: 13px;
		cursor: pointer;
	}
	.views button[aria-pressed='true'] {
		background: var(--cta-bg);
		color: var(--cta-text);
		font-weight: 600;
	}
	.titles {
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
		font-size: 32px;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	h2 {
		margin: 0;
		font-size: 20px;
		font-weight: 700;
	}
	.nav {
		display: flex;
		align-items: center;
	}
	.today {
		min-height: var(--touch);
		padding: 0 var(--space-3);
		border: 0;
		background: transparent;
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}
	.strip {
		padding: 0 var(--space-4) var(--space-3);
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: var(--space-1);
	}
	.strip button {
		min-height: 56px;
		min-width: 0;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-block);
		background: var(--surface);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		font: inherit;
		cursor: pointer;
	}
	.strip button.off {
		color: var(--text-muted);
	}
	.strip button[aria-current='date'] {
		border-color: var(--text);
	}
	.strip button[aria-pressed='true'] {
		background: var(--cta-bg);
		border-color: var(--cta-bg);
		color: var(--cta-text);
	}
	.strip-day {
		font-size: 12px;
	}
	.strip-date {
		font-family: var(--font-mono);
		font-size: 16px;
		font-weight: 500;
	}
	.now {
		display: flex;
		align-items: center;
		gap: var(--space-2-5);
	}
	.now-time {
		width: 44px;
		flex-shrink: 0;
		font-family: var(--font-mono);
		font-size: 12px;
		font-weight: 500;
	}
	.now-line {
		flex-grow: 1;
		height: 2px;
		border-radius: 1px;
		background: var(--text);
	}
	.now-label {
		font-size: 12px;
		font-weight: 600;
	}
	.blocks {
		padding: var(--space-1) var(--space-4) var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.all-day {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 36px;
		padding: 0 var(--space-3);
		margin-left: 54px;
		border-radius: var(--radius-control);
		border: 1px solid var(--border);
		background: var(--surface);
		font-size: 13px;
	}
	.all-day-label {
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.empty,
	.note {
		margin: 0;
		font-size: 14px;
		line-height: 1.45;
		color: var(--text-muted);
	}
	.empty {
		margin: var(--space-2) var(--space-1);
	}
	.waiting {
		margin: var(--space-2) var(--space-4) 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
		--q-bg: var(--q-delegate-bg);
		--q-ink: var(--q-delegate-ink);
	}
	.waiting a {
		min-height: 56px;
		display: flex;
		align-items: center;
		gap: var(--space-2-5);
		padding: 0 var(--space-3);
		border-radius: var(--radius-block);
		background: var(--q-bg);
		color: var(--q-ink);
		text-decoration: none;
	}
	.initial {
		width: 32px;
		height: 32px;
		flex-shrink: 0;
		border-radius: 16px;
		background: var(--q-ink);
		color: var(--q-bg);
		font-size: 12px;
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.what {
		flex-grow: 1;
		font-size: 14px;
	}
	.when {
		font-size: 12px;
		flex-shrink: 0;
	}
	.review {
		margin: 0 var(--space-4) var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.review h3 {
		margin: var(--space-1) var(--space-1) 0;
		font-family: var(--font-body);
		font-size: 13px;
		font-weight: 500;
	}
	dl {
		margin: 0;
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 6px;
	}
	.hours {
		min-height: 56px;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-block);
		background: var(--q-bg);
		color: var(--q-ink);
		display: flex;
		flex-direction: column;
		justify-content: center;
	}
	.hours dt {
		font-size: 13px;
	}
	.hours dd {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 15px;
		font-weight: 600;
	}
	.q-do {
		--q-bg: var(--q-do-bg);
		--q-ink: var(--q-do-ink);
	}
	.q-schedule {
		--q-bg: var(--q-schedule-bg);
		--q-ink: var(--q-schedule-ink);
	}
	.q-delegate {
		--q-bg: var(--q-delegate-bg);
		--q-ink: var(--q-delegate-ink);
	}
	.q-eliminate {
		--q-bg: var(--q-eliminate-bg);
		--q-ink: var(--q-eliminate-ink);
	}
	.pending {
		margin: var(--space-2) var(--space-4) var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-block);
	}
	li + li {
		border-top: 1px solid var(--border);
	}
	li a {
		min-height: var(--touch);
		padding: 0 var(--space-4);
		display: flex;
		align-items: center;
		color: var(--text);
		text-decoration: none;
		font-size: 14px;
	}
	li a span {
		color: var(--text-muted);
		white-space: pre;
	}
	/* Orange fill: the scheduler proposes on its own (docs/05). */
	.find {
		align-self: flex-start;
		min-height: var(--touch);
		padding: 0 var(--space-5);
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--accent-ai);
		color: var(--on-accent-ai);
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}
	.find:disabled {
		opacity: 0.6;
	}
</style>
