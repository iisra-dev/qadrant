<script lang="ts">
	import {
		agendaForDay,
		agendaItems,
		busyHours,
		dayLoad,
		eventsForDay,
		hourLayout,
		hourRange,
		offsetOf
	} from '$lib/domain/agenda';
	import { sameDay } from '$lib/domain/dates';
	import { formatDuration, formatTime, weekdayName } from '$lib/domain/format';
	import { QUADRANTS, type CalendarEvent, type Task } from '$lib/domain/types';
	import { i18n } from '$lib/i18n/index.svelte';
	import { AiDot, quadrantVars } from '$lib/ui';

	let {
		days,
		tasks,
		events = [],
		now,
		workHours
	}: { days: Date[]; tasks: Task[]; events?: CalendarEvent[]; now: Date; workHours: { start: string; end: string } } = $props();

	// Below this a block is one line: time and title (a 30-minute block is 44 px tall).
	const COMPACT_MIN = 45;
	const GAP = 2; // px between back-to-back blocks
	// One-letter day initials from the catalog (L M X J V / M T W T F).
	const initial = (day: Date) => i18n.m.settings.weekdays[(day.getDay() + 6) % 7].short;

	const columns = $derived(
		days.map((day) => {
			const timed = eventsForDay(events, day);
			return {
				day,
				today: sameDay(day, now),
				items: agendaItems(agendaForDay(tasks, day)),
				allDay: timed.allDay,
				events: timed.timed.map((event) => {
					const start = new Date(event.start);
					return { event, start, minutes: Math.max(15, (new Date(event.end).getTime() - start.getTime()) / 60_000) };
				}),
				load: dayLoad(tasks, day)
			};
		})
	);
	const range = $derived(hourRange(columns.flatMap((c) => c.items.flatMap((i) => i.tasks)), workHours));
	const layout = $derived(
		hourLayout(
			range,
			busyHours(
				columns.flatMap((c) => [
					...c.items.map(({ start, minutes }) => ({ start, minutes })),
					...c.events.map(({ start, minutes }) => ({ start, minutes }))
				])
			)
		)
	);
	const showNow = $derived(now.getHours() >= range.from && now.getHours() < range.to);

	function place(start: Date, minutes: number): string {
		const top = offsetOf(layout, start);
		const bottom = offsetOf(layout, new Date(start.getTime() + minutes * 60_000));
		return `top: ${top}px; height: ${Math.max(44, bottom - top) - GAP}px`;
	}

	function loadLabel(load: Record<string, number>): string {
		const parts = QUADRANTS.filter((q) => load[q]).map((q) => `${load[q]} ${i18n.m.quadrants[q].name}`);
		return i18n.m.agenda.dueLoad(parts.join(', '));
	}
</script>

<div class="frame">
	<div class="grid" style="--cols: {days.length}; --body: {layout.total}px">
		<span></span>
		{#each columns as column (column.day.getTime())}
			{@const total = QUADRANTS.reduce((sum, q) => sum + column.load[q], 0)}
			<div class="head" class:today={column.today}>
				<h3 class="day" aria-current={column.today ? 'date' : undefined} aria-label={`${weekdayName(column.day, i18n.lang)} ${column.day.getDate()}`}>
					<span aria-hidden="true">{initial(column.day)}</span>
					<span aria-hidden="true" class="num">{column.day.getDate()}</span>
				</h3>
				{#if total}
					{@const label = loadLabel(column.load)}
					<div class="load" role="img" aria-label={label} title={label}>
						{#each QUADRANTS.filter((q) => column.load[q]) as quadrant (quadrant)}
							<span style={quadrantVars(quadrant)}>{column.load[quadrant]}</span>
						{/each}
					</div>
				{/if}
				{#each column.allDay as event (event.id)}
					<span class="all-day">{event.title}</span>
				{/each}
			</div>
		{/each}

		<div class="hours" aria-hidden="true">
			{#each layout.heights as _, index (index)}
				<span style="top: {layout.offsets[index]}px">{String(layout.from + index).padStart(2, '0')}:00</span>
			{/each}
		</div>
		<div class="lines" aria-hidden="true">
			{#each [...layout.offsets, layout.total] as offset (offset)}
				<span style="top: {offset}px"></span>
			{/each}
		</div>

		{#each columns as column, index (column.day.getTime())}
			<ul class="column" class:today={column.today} style="grid-column: {index + 2}" aria-label={`${weekdayName(column.day, i18n.lang)} ${column.day.getDate()}`}>
				{#each column.events as { event, start, minutes } (event.id)}
					<li class="event" class:compact={minutes < COMPACT_MIN} style={place(start, minutes)}>
						{#if minutes < COMPACT_MIN}
							<span class="line"><span class="time">{formatTime(start)}</span> {event.title}</span>
						{:else}
							<span class="title">{event.title}</span>
							<span class="meta">{formatTime(start)} · {i18n.m.common.calendar}</span>
						{/if}
					</li>
				{/each}
				{#each column.items as item (item.tasks[0].id)}
					{@const quadrant = item.tasks[0].quadrant}
					{@const title = item.tasks.map((t) => t.title).join(' · ')}
					<li style="{place(item.start, item.minutes)}; {quadrantVars(quadrant)}">
						<a href={`/task/${item.tasks[0].id}`} class:compact={item.minutes < COMPACT_MIN}>
							{#if item.minutes < COMPACT_MIN}
								<span class="line">
									{#if item.focus}<AiDot />{/if}<span class="time">{formatTime(item.start)}</span>
									{title}
								</span>
							{:else}
								{#if item.focus}<span class="label"><AiDot />{i18n.m.common.focusBlock}</span>{/if}
								<span class="title">{title}</span>
								<span class="meta">{formatTime(item.start)} · {i18n.m.quadrants[quadrant].name} · {formatDuration(item.minutes)}</span>
							{/if}
						</a>
					</li>
				{/each}
				{#if column.today && showNow}
					<li class="now" style="top: {offsetOf(layout, now)}px" aria-hidden="true"></li>
				{/if}
			</ul>
		{/each}
	</div>
</div>

<style>
	.frame {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		padding: var(--space-4) var(--space-4) var(--space-5);
		overflow-x: auto;
	}
	.grid {
		display: grid;
		grid-template-columns: 52px repeat(var(--cols), minmax(0, 1fr));
		grid-template-rows: auto var(--body);
		min-width: 640px;
	}
	.head {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-1) var(--space-3);
		border-radius: var(--radius-control) var(--radius-control) 0 0;
		min-width: 0;
	}
	.head.today,
	.column.today {
		background: var(--surface-muted);
	}
	.day {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 32px;
		font-family: var(--font-body);
		font-size: 13px;
		font-weight: 400;
		color: var(--text-muted);
	}
	.num {
		display: inline-grid;
		place-items: center;
		min-width: 28px;
		height: 28px;
		border-radius: var(--radius-pill);
		font-family: var(--font-mono);
		font-weight: 500;
		color: var(--text);
	}
	.today .num {
		background: var(--cta-bg);
		color: var(--cta-text);
		font-weight: 600;
	}
	.load {
		display: flex;
		gap: 3px;
	}
	.load span {
		min-width: 20px;
		padding: 0 5px;
		box-sizing: border-box;
		border-radius: var(--radius-pill);
		background: var(--q-bg);
		color: var(--q-ink);
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 500;
		line-height: 18px;
		text-align: center;
	}
	.all-day {
		align-self: stretch;
		padding: 2px var(--space-2);
		border-radius: var(--radius-control);
		border: 1px solid var(--border-strong);
		background: var(--surface);
		font-size: 11px;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.hours,
	.lines {
		grid-row: 2;
		position: relative;
	}
	.hours {
		grid-column: 1;
	}
	.hours span {
		position: absolute;
		left: 0;
		transform: translateY(-50%);
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 500;
		color: var(--text-muted);
	}
	.lines {
		grid-column: 2 / -1;
		z-index: 1;
		pointer-events: none;
	}
	.lines span {
		position: absolute;
		left: 0;
		right: 0;
		border-top: 1px solid var(--border);
	}
	.column {
		grid-row: 2;
		position: relative;
		list-style: none;
		margin: 0;
		padding: 0;
		border-radius: 0 0 var(--radius-control) var(--radius-control);
	}
	li {
		position: absolute;
		left: var(--space-1);
		right: var(--space-1);
		z-index: 3;
		box-sizing: border-box;
		margin-top: 1px;
	}
	.event,
	a {
		height: 100%;
		box-sizing: border-box;
		border-radius: var(--radius-control);
		padding: 5px var(--space-2) 5px var(--space-2-5);
		display: flex;
		flex-direction: column;
		gap: 1px;
		overflow: hidden;
	}
	.event {
		border: 1px solid var(--border-strong);
		background: var(--surface);
		color: var(--text);
	}
	.event .meta {
		color: var(--text-muted);
	}
	a {
		background: var(--q-bg);
		color: var(--q-ink);
		box-shadow: inset 3px 0 0 var(--q-ink);
		text-decoration: none;
	}
	.compact {
		justify-content: center;
	}
	.line {
		display: block;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-size: 13px;
		font-weight: 600;
		line-height: 1.25;
	}
	.time {
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 500;
		margin-right: 4px;
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
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.meta {
		font-size: 11px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.now {
		left: -3px;
		right: 0;
		height: 2px;
		margin-top: -1px;
		z-index: 2;
		background: var(--text);
		pointer-events: none;
	}
	.now::before {
		content: '';
		position: absolute;
		left: 0;
		top: -3px;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--text);
	}
</style>
