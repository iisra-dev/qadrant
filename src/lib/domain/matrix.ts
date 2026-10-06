import type { Quadrant, Task } from './types';

export function isOverdue(task: Pick<Task, 'dueAt'>, now: Date): boolean {
	return Boolean(task.dueAt && new Date(task.dueAt).getTime() < now.getTime());
}

/** Done tasks stay in the Matrix, struck through, this long after being done (docs/01). */
export const DONE_VISIBLE_HOURS = 24;

/** Tasks done within the last 24 hours. Older ones stay in the database, out of sight. */
export function recentlyDone(tasks: Task[], now: Date): Task[] {
	const since = now.getTime() - DONE_VISIBLE_HOURS * 3_600_000;
	return tasks.filter(
		(t) => t.status === 'done' && !t.deletedAt && t.doneAt !== undefined && new Date(t.doneAt).getTime() > since
	);
}

/**
 * Open tasks plus the recently done ones, one entry per task. Two live queries
 * can briefly disagree on a task that was just ticked; the newer copy wins.
 */
export function matrixTasks(open: Task[], all: Task[], now: Date): Task[] {
	const byId = new Map<string, Task>();
	for (const task of [...open, ...recentlyDone(all, now)]) {
		const seen = byId.get(task.id);
		if (!seen || task.updatedAt > seen.updatedAt) byId.set(task.id, task);
	}
	return [...byId.values()].filter((task) => task.status === 'open' || task.status === 'done');
}

/** Matrix order (docs/01): open before done; overdue first, then by due date (none last), then oldest first. */
export function sortForMatrix(tasks: Task[], now: Date): Task[] {
	return [...tasks].sort((a, b) => {
		const done = Number(a.status === 'done') - Number(b.status === 'done');
		if (done) return done;
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
