import { DEFAULT_DURATION_MIN } from './scheduler';
import { addDays, dateKey, isoWeekday, sameDay, startOfDay } from './dates';
import { QUADRANTS, type CalendarEvent, type Quadrant, type Task } from './types';

/** Open tasks scheduled on the given local day, by start time. */
export function agendaForDay(tasks: Task[], day: Date): Task[] {
	return tasks
		.filter((task) => task.status === 'open' && !task.deletedAt && task.scheduledAt && sameDay(new Date(task.scheduledAt), day))
		.sort((a, b) => (a.scheduledAt! < b.scheduledAt! ? -1 : a.scheduledAt! > b.scheduledAt! ? 1 : 0));
}

export interface AgendaItem {
	start: Date;
	minutes: number;
	tasks: Task[];
	/** Programar tasks back to back: a focus block is drawn as one (docs/06, phase 3). */
	focus: boolean;
}

/** Programar time is focus time; back-to-back Programar tasks are drawn as one focus block. */
export function agendaItems(tasks: Task[]): AgendaItem[] {
	const items: AgendaItem[] = [];
	for (const task of tasks) {
		const start = new Date(task.scheduledAt!);
		const minutes = task.durationMin ?? DEFAULT_DURATION_MIN;
		const last = items.at(-1);
		const lastEnd = last ? last.start.getTime() + last.minutes * 60_000 : NaN;
		if (last && task.quadrant === 'schedule' && last.tasks[0].quadrant === 'schedule' && lastEnd === start.getTime()) {
			last.tasks.push(task);
			last.minutes += minutes;
			continue;
		}
		items.push({ start, minutes, tasks: [task], focus: task.quadrant === 'schedule' });
	}
	return items;
}

/** Open Hacer and Programar tasks without a time ("Sin hueco todavía"). */
export function withoutSlot(tasks: Task[]): Task[] {
	return tasks.filter(
		(t) => t.status === 'open' && !t.deletedAt && !t.scheduledAt && (t.quadrant === 'do' || t.quadrant === 'schedule')
	);
}

/** Days of the week (Monday first) that are in workDays, `offset` weeks from the current one. */
export function weekDays(now: Date, offset: number, workDays: number[]): Date[] {
	const monday = addDays(startOfDay(now), 1 - isoWeekday(now) + offset * 7);
	return Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter((day) => workDays.includes(isoWeekday(day)));
}

/** Hour rows for the week grid: working hours, widened to fit any task outside them. */
export function hourRange(tasks: Task[], workHours: { start: string; end: string }): { from: number; to: number } {
	let from = Number(workHours.start.split(':')[0]);
	let to = Math.ceil(Number(workHours.end.split(':')[0]) + Number(workHours.end.split(':')[1]) / 60);
	for (const task of tasks) {
		const start = new Date(task.scheduledAt!);
		const end = new Date(start.getTime() + (task.durationMin ?? DEFAULT_DURATION_MIN) * 60_000);
		from = Math.min(from, start.getHours());
		to = Math.max(to, end.getHours() + (end.getMinutes() ? 1 : 0) || 24);
	}
	return { from, to: Math.min(24, to) };
}

/** Open delegated tasks, by follow-up date ("Esperando a otros"). */
export function waitingOnOthers(tasks: Task[]): Task[] {
	return tasks
		.filter((t) => t.status === 'open' && !t.deletedAt && t.quadrant === 'delegate')
		.sort((a, b) => (a.followUpAt ?? '\uffff').localeCompare(b.followUpAt ?? '\uffff'));
}

/** Calendar events of a local day: all-day ones go on top and take no time (docs/01, Agenda). */
export function eventsForDay(events: CalendarEvent[], day: Date): { allDay: CalendarEvent[]; timed: CalendarEvent[] } {
	const key = dateKey(day);
	return {
		allDay: events.filter((e) => e.allDay && e.start <= key && key < e.end),
		timed: events.filter((e) => !e.allDay && sameDay(new Date(e.start), day)).sort((a, b) => a.start.localeCompare(b.start))
	};
}

/** Open tasks due on a local day, by quadrant: the load strip over each day of the week. */
export function dayLoad(tasks: Task[], day: Date): Record<Quadrant, number> {
	const load = Object.fromEntries(QUADRANTS.map((q) => [q, 0])) as Record<Quadrant, number>;
	for (const task of tasks) {
		if (task.status === 'open' && !task.deletedAt && task.dueAt && sameDay(new Date(task.dueAt), day)) load[task.quadrant]++;
	}
	return load;
}

/** Hour row heights in the week grid: busy hours fit a 30-minute block at 44 px (the touch minimum), empty ones shrink. */
export const ROW_BUSY = 88;
export const ROW_IDLE = 28;

/** Hours of the day that any span (task block or event) touches. */
export function busyHours(spans: { start: Date; minutes: number }[]): Set<number> {
	const busy = new Set<number>();
	for (const { start, minutes } of spans) {
		const end = new Date(start.getTime() + Math.max(1, minutes) * 60_000 - 1);
		const last = sameDay(start, end) ? end.getHours() : 23;
		for (let hour = start.getHours(); hour <= last; hour++) busy.add(hour);
	}
	return busy;
}

export interface HourLayout {
	from: number;
	heights: number[];
	offsets: number[];
	total: number;
}

export function hourLayout(range: { from: number; to: number }, busy: Set<number>): HourLayout {
	const heights = Array.from({ length: range.to - range.from }, (_, i) => (busy.has(range.from + i) ? ROW_BUSY : ROW_IDLE));
	const offsets: number[] = [];
	let total = 0;
	for (const height of heights) {
		offsets.push(total);
		total += height;
	}
	return { from: range.from, heights, offsets, total };
}

/** Vertical pixel of a time in the grid, clamped to it. */
export function offsetOf(layout: HourLayout, date: Date): number {
	const index = date.getHours() - layout.from;
	if (index < 0) return 0;
	if (index >= layout.heights.length) return layout.total;
	return layout.offsets[index] + (date.getMinutes() / 60) * layout.heights[index];
}
