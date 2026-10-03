import type { Quadrant, Task } from './types';

export function isOverdue(task: Pick<Task, 'dueAt'>, now: Date): boolean {
	return Boolean(task.dueAt && new Date(task.dueAt).getTime() < now.getTime());
}

/** Matrix order (docs/01): overdue first, then by due date (none last), then oldest first. */
export function sortForMatrix(tasks: Task[], now: Date): Task[] {
	return [...tasks].sort((a, b) => {
		const overdue = Number(isOverdue(b, now)) - Number(isOverdue(a, now));
		if (overdue) return overdue;
		if (a.dueAt !== b.dueAt) {
			if (!a.dueAt) return 1;
			if (!b.dueAt) return -1;
			return a.dueAt < b.dueAt ? -1 : 1;
		}
		return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
	});
}

export function groupByQuadrant(tasks: Task[], now: Date): Record<Quadrant, Task[]> {
	const groups: Record<Quadrant, Task[]> = { do: [], schedule: [], delegate: [], eliminate: [] };
	for (const task of tasks) groups[task.quadrant].push(task);
	for (const key of Object.keys(groups) as Quadrant[]) groups[key] = sortForMatrix(groups[key], now);
	return groups;
}

export const ARCHIVE_SUGGESTION_DAYS = 14;

/** Eliminar tasks untouched (updatedAt) for 14 days or more: the app suggests archiving them (docs/01). */
export function staleEliminate(tasks: Task[], now: Date): Task[] {
	const limit = now.getTime() - ARCHIVE_SUGGESTION_DAYS * 86_400_000;
	return tasks.filter(
		(t) => t.quadrant === 'eliminate' && t.status === 'open' && !t.deletedAt && new Date(t.updatedAt).getTime() <= limit
	);
}
