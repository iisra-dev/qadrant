import { DEFAULT_DURATION_MIN } from './scheduler';
import { addDays, dateKey, isoWeekday, sameDay, startOfDay } from './dates';
import type { CalendarEvent, Task } from './types';

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
