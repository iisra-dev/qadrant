<script lang="ts">
	import { clock } from '$lib/app/clock.svelte';
	import { media } from '$lib/app/media.svelte';
	import { currentSettings } from '$lib/app/context';
	import { agendaForDay, agendaItems, eventsForDay, waitingOnOthers, weekDays, withoutSlot } from '$lib/domain/agenda';
	import { addDays, sameDay, startOfDay } from '$lib/domain/dates';
	import { formatDuration, formatLongDate, formatShortDate, formatTime } from '$lib/domain/format';
	import { calendarEvents, people, settings } from '$lib/stores';
	import WeekView from './WeekView.svelte';
	import { openTasks } from '$lib/stores';
	import { taskActions } from '$lib/tasks/actions';
	import { AgendaBlock, IconButton, QUADRANT_META } from '$lib/ui';

	// Web: week view by default, working week (docs/01); mobile: day view only.
	let view = $state<'day' | 'week'>('week');
	const week = $derived(media.web && view === 'week');
	let weekOffset = $state(0);
	const days = $derived(weekDays(clock.now, weekOffset, ($settings ?? currentSettings()).workDays));
	const weekLabel = $derived(
		days.length ? `${formatShortDate(days[0]).slice(4)} – ${formatShortDate(days.at(-1)!).slice(4)}` : ''
	);
	const weekTitle = $derived(weekOffset === 0 ? 'Esta semana' : weekOffset === 1 ? 'La semana que viene' : weekOffset === -1 ? 'La semana pasada' : 'Semana');

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
	const SHORT_WEEKDAY = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

	function personName(id: string | undefined): string | undefined {
		return id ? $people.find((p) => p.id === id)?.name : undefined;
	}

	/** "Revisar lun" within a week, "Revisar 20 oct" later, "Revisar hoy"/"Revisar ya" when due. */
	function followUpLabel(iso: string | undefined): string {
		if (!iso) return 'Sin fecha de revisión';
		const date = new Date(iso);
		const today = startOfDay(clock.now).getTime();
		const days = Math.round((startOfDay(date).getTime() - today) / 86_400_000);
		if (days < 0) return 'Revisar ya';
		if (days === 0) return 'Revisar hoy';
		if (days < 7) return `Revisar ${SHORT_WEEKDAY[date.getDay()]}`;
		return `Revisar ${formatShortDate(date).slice(4)}`;
	}
	const label = $derived(formatLongDate(day));
	const isToday = $derived(sameDay(day, clock.now));

	let message = $state('');
	let busy = $state(false);

	async function findSlots() {
		busy = true;
		try {
			const { placed, unplaced } = await taskActions.findSlots(currentSettings());
			message =
				placed === 0
					? 'No hay huecos libres en las próximas dos semanas.'
					: `${placed === 1 ? 'Colocada 1 tarea' : `Colocadas ${placed} tareas`}${unplaced ? `; ${unplaced} siguen sin hueco` : ''}.`;
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Agenda · Qadrant</title>
</svelte:head>

<div class="agenda" class:wide={week}>
	<header>
		<div class="titles">
			{#if week}
				<span class="date" aria-live="polite">{weekLabel}</span>
				<h1>{weekTitle}</h1>
			{:else}
				<span class="date" aria-live="polite">{label.charAt(0).toUpperCase() + label.slice(1)}</span>
				<h1>Agenda</h1>
			{/if}
		</div>
		<div class="nav">
			{#if media.web}
				<div class="views" role="group" aria-label="Vista">
					<button type="button" aria-pressed={view === 'day'} onclick={() => (view = 'day')}>Día</button>
					<button type="button" aria-pressed={view === 'week'} onclick={() => (view = 'week')}>Semana</button>
				</div>
			{/if}
			{#if week}
				<IconButton label="Semana anterior" icon="prev" onclick={() => weekOffset--} />
				{#if weekOffset !== 0}
					<button class="today" type="button" onclick={() => (weekOffset = 0)}>Hoy</button>
				{/if}
				<IconButton label="Semana siguiente" icon="next" onclick={() => weekOffset++} />
			{:else}
				<IconButton label="Día anterior" icon="prev" onclick={() => offset--} />
				{#if !isToday}
					<button class="today" type="button" onclick={() => (offset = 0)}>Hoy</button>
				{/if}
				<IconButton label="Día siguiente" icon="next" onclick={() => offset++} />
			{/if}
		</div>
	</header>

	{#if week}
		<div class="week">
			<WeekView {days} tasks={$openTasks} events={$calendarEvents} now={clock.now} workHours={($settings ?? currentSettings()).workHours} />
		</div>
	{:else}
	<div class="blocks">
		{#each dayEvents.allDay as event (event.id)}
			<div class="all-day"><span class="all-day-label">Todo el día</span>{event.title}</div>
		{/each}
		{#each rows as row (row.kind === 'task' ? row.item.tasks[0].id : row.event.id)}
			{#if row.kind === 'task'}
				{@const item = row.item}
				<AgendaBlock
					time={formatTime(item.start)}
					title={item.tasks.map((t) => t.title).join(' · ')}
					meta={`${QUADRANT_META[item.tasks[0].quadrant].name} · ${formatDuration(item.minutes)}`}
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
					meta={`Calendario · ${formatDuration(minutes)}`}
					{minutes}
				/>
			{/if}
		{:else}
			<p class="empty">Nada en la agenda este día.</p>
		{/each}
	</div>
	{/if}

	{#if waiting.length}
		<section class="waiting" aria-labelledby="waiting-title">
			<h2 id="waiting-title">Esperando a otros</h2>
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

	<section class="pending" aria-labelledby="no-slot">
		<h2 id="no-slot">Sin hueco todavía</h2>
		{#if pending.length}
			<ul>
				{#each pending as task (task.id)}
					<li><a href={`/task/${task.id}`}>{task.title}<span> · {QUADRANT_META[task.quadrant].name}</span></a></li>
				{/each}
			</ul>
			<button class="find" type="button" onclick={findSlots} disabled={busy}>Buscarles hueco</button>
		{:else}
			<p class="empty">Todas las tareas de Hacer y Programar tienen hora.</p>
		{/if}
		<p class="note" role="status">{message}</p>
	</section>
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
		padding: var(--space-6) var(--space-3) var(--space-3) var(--space-5);
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
		font-size: 18px;
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
		min-height: 52px;
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
		font-size: 13px;
	}
	.when {
		font-size: 11px;
		flex-shrink: 0;
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
