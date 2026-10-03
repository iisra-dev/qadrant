<script lang="ts">
	import { clock } from '$lib/app/clock.svelte';
	import { agendaForDay } from '$lib/domain/agenda';
	import { addDays, sameDay, startOfDay } from '$lib/domain/dates';
	import { formatDuration, formatLongDate, formatTime } from '$lib/domain/format';
	import { openTasks } from '$lib/stores';
	import { AgendaBlock, IconButton, QUADRANT_META } from '$lib/ui';

	let offset = $state(0);
	const day = $derived(addDays(startOfDay(clock.now), offset));
	const items = $derived(agendaForDay($openTasks, day));
	const label = $derived(formatLongDate(day));
	const isToday = $derived(sameDay(day, clock.now));
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
		{#each items as task (task.id)}
			<AgendaBlock
				time={formatTime(new Date(task.scheduledAt!))}
				title={task.title}
				meta={`${QUADRANT_META[task.quadrant].name} · ${formatDuration(task.durationMin ?? 30)}`}
				href={`/task/${task.id}`}
				quadrant={task.quadrant}
				minutes={task.durationMin ?? 30}
			/>
		{:else}
			<p class="empty">Nada en la agenda este día. Pon día y hora a una tarea desde su detalle, en «En la agenda».</p>
		{/each}
	</div>
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
	.empty {
		margin: var(--space-4) var(--space-1);
		font-size: 14px;
		line-height: 1.45;
		color: var(--text-muted);
	}
</style>
