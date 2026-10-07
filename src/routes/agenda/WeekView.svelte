<script lang="ts">
	import { agendaForDay, agendaItems, eventsForDay, hourRange } from '$lib/domain/agenda';
	import { sameDay } from '$lib/domain/dates';
	import { formatDuration, formatTime, weekdayName } from '$lib/domain/format';
	import type { CalendarEvent, Task } from '$lib/domain/types';
	import { i18n } from '$lib/i18n/index.svelte';
	import { AiDot, quadrantVars } from '$lib/ui';

	let {
		days,
		tasks,
		events = [],
		now,
		workHours
	}: { days: Date[]; tasks: Task[]; events?: CalendarEvent[]; now: Date; workHours: { start: string; end: string } } = $props();

	const ROW = 56; // px per hour, as in WebAgenda.html
	// One-letter day initials from the catalog (L M X J V / M T W T F).
	const initial = (day: Date) => i18n.m.settings.weekdays[(day.getDay() + 6) % 7].short;

	const columns = $derived(
		days.map((day) => ({ day, items: agendaItems(agendaForDay(tasks, day)), events: eventsForDay(events, day) }))
	);
	const range = $derived(hourRange(columns.flatMap((c) => c.items.flatMap((i) => i.tasks)), workHours));
	const hours = $derived(Array.from({ length: range.to - range.from }, (_, i) => range.from + i));

	function top(start: Date): number {
		return ((start.getHours() - range.from) * 60 + start.getMinutes()) * (ROW / 60);
	}
</script>

<div class="frame">
	<div class="grid" style="--cols: {days.length}; --rows: {hours.length}; --row: {ROW}px">
		<span></span>
		{#each columns as column (column.day.getTime())}
			<h3 class="day" class:today={sameDay(column.day, now)} aria-label={`${weekdayName(column.day, i18n.lang)} ${column.day.getDate()}`}>
				<span aria-hidden="true">{initial(column.day)}</span>
				<span aria-hidden="true" class="num">{column.day.getDate()}</span>
			</h3>
		{/each}

		<div class="hours" aria-hidden="true">
			{#each hours as hour (hour)}
				<span>{String(hour).padStart(2, '0')}:00</span>
			{/each}
		</div>

		{#each columns as column (column.day.getTime())}
			<ul class="column" aria-label={`${weekdayName(column.day, i18n.lang)} ${column.day.getDate()}`}>
				{#each column.events.allDay as event (event.id)}
					<li class="all-day">{event.title}</li>
				{/each}
				{#each column.events.timed as event (event.id)}
					{@const start = new Date(event.start)}
					{@const minutes = Math.max(15, (new Date(event.end).getTime() - start.getTime()) / 60_000)}
					<li class="event" style="top: {top(start)}px; height: {Math.max(28, minutes * (ROW / 60) - 4)}px">
						<span class="title">{event.title}</span>
						<span class="meta">{formatTime(start)} · {i18n.m.common.calendar}</span>
					</li>
				{/each}
				{#each column.items as item (item.tasks[0].id)}
					{@const quadrant = item.tasks[0].quadrant}
					<li style="top: {top(item.start)}px; height: {Math.max(28, item.minutes * (ROW / 60) - 4)}px; {quadrantVars(quadrant)}">
						<a href={`/task/${item.tasks[0].id}`}>
							{#if item.focus}<span class="label"><AiDot />{i18n.m.common.focusBlock}</span>{/if}
							<span class="title">{item.tasks.map((t) => t.title).join(' · ')}</span>
							<span class="meta">{formatTime(item.start)} · {i18n.m.quadrants[quadrant].name} · {formatDuration(item.minutes)}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/each}
	</div>
</div>

<style>
	.frame {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		padding: var(--space-4);
		overflow-x: auto;
	}
	.grid {
		display: grid;
		grid-template-columns: 56px repeat(var(--cols), minmax(0, 1fr));
		grid-template-rows: 48px calc(var(--rows) * var(--row));
		column-gap: var(--space-2);
		min-width: 640px;
	}
	.day {
		margin: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		font-family: var(--font-body);
		font-size: 13px;
		font-weight: 400;
		color: var(--text-muted);
		border-radius: var(--radius-control);
	}
	.num {
		color: var(--text);
	}
	.day.today {
		background: var(--cta-bg);
		color: var(--cta-text);
	}
	.day.today .num {
		color: var(--cta-text);
		font-weight: 600;
	}
	.hours {
		grid-column: 1;
		grid-row: 2;
		display: grid;
		grid-auto-rows: var(--row);
	}
	.hours span {
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 500;
		color: var(--text-muted);
		padding-top: var(--space-1);
		border-top: 1px solid var(--border);
	}
	.column {
		grid-row: 2;
		position: relative;
		list-style: none;
		margin: 0;
		padding: 0;
		background: repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px var(--row));
	}
	li {
		position: absolute;
		left: 0;
		right: 0;
	}
	.event {
		box-sizing: border-box;
		border-radius: var(--radius-control);
		border: 1px solid var(--border-strong);
		background: var(--surface);
		padding: 6px var(--space-2);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.event .meta {
		color: var(--text-muted);
	}
	.all-day {
		position: static;
		margin-bottom: 2px;
		padding: 2px var(--space-2);
		border-radius: var(--radius-control);
		border: 1px solid var(--border-strong);
		background: var(--surface);
		font-size: 11px;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		position: relative;
		z-index: 1;
	}
	a {
		height: 100%;
		box-sizing: border-box;
		border-radius: var(--radius-control);
		background: var(--q-bg);
		color: var(--q-ink);
		padding: 6px var(--space-2);
		display: flex;
		flex-direction: column;
		gap: 1px;
		overflow: hidden;
		text-decoration: none;
	}
	.label {
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: 500;
		letter-spacing: 0.08em;
	}
	.title {
		font-size: 13px;
		font-weight: 600;
		line-height: 1.25;
	}
	.meta {
		font-size: 11px;
	}
</style>
