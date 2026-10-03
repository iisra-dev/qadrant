<script lang="ts">
	import { clock } from '$lib/app/clock.svelte';
	import { currentSettings } from '$lib/app/context';
	import { agendaForDay, agendaItems, withoutSlot } from '$lib/domain/agenda';
	import { addDays, sameDay, startOfDay } from '$lib/domain/dates';
	import { formatDuration, formatLongDate, formatTime } from '$lib/domain/format';
	import { openTasks } from '$lib/stores';
	import { taskActions } from '$lib/tasks/actions';
	import { AgendaBlock, IconButton, QUADRANT_META } from '$lib/ui';

	let offset = $state(0);
	const day = $derived(addDays(startOfDay(clock.now), offset));
	const items = $derived(agendaItems(agendaForDay($openTasks, day)));
	const pending = $derived(withoutSlot($openTasks));
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
	<title>Agenda · Cuadrante</title>
</svelte:head>

<div class="agenda">
	<header>
		<div class="titles">
			<span class="date" aria-live="polite">{label.charAt(0).toUpperCase() + label.slice(1)}</span>
			<h1>Agenda</h1>
		</div>
		<div class="nav">
			<IconButton label="Día anterior" icon="prev" onclick={() => offset--} />
			{#if !isToday}
				<button class="today" type="button" onclick={() => (offset = 0)}>Hoy</button>
			{/if}
			<IconButton label="Día siguiente" icon="next" onclick={() => offset++} />
		</div>
	</header>

	<div class="blocks">
		{#each items as item (item.tasks[0].id)}
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
			<p class="empty">Nada en la agenda este día.</p>
		{/each}
	</div>

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
