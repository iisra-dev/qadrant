import { DEFAULT_DURATION_MIN } from './scheduler';
import { sameDay } from './dates';
import type { Task } from './types';

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
