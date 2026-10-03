import { sameDay } from './dates';
import type { Task } from './types';

/** Open tasks scheduled on the given local day, by start time. */
export function agendaForDay(tasks: Task[], day: Date): Task[] {
	return tasks
		.filter((task) => task.status === 'open' && !task.deletedAt && task.scheduledAt && sameDay(new Date(task.scheduledAt), day))
		.sort((a, b) => (a.scheduledAt! < b.scheduledAt! ? -1 : a.scheduledAt! > b.scheduledAt! ? 1 : 0));
}
