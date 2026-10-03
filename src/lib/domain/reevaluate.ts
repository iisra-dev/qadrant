import { resolveKnown } from './quadrant';
import type { Quadrant, Settings, Task } from './types';
import { evaluateUrgency } from './urgency';

/** Quadrants that imply the task was urgent when it was placed (an assignment aside). */
const URGENT_QUADRANTS: readonly Quadrant[] = ['do', 'delegate'];

export function isAssigned(task: Pick<Task, 'decision'>): boolean {
	return Boolean(task.decision?.delegable.personId);
}

/**
 * Passage of time (docs/03): when the urgency of an open task with a date
 * changes, re-apply combine() with what is already known, without the model.
 * Returns the new quadrant, or null if the task stays where it is.
 */
export function reevaluate(task: Task, now: Date, settings: Settings): Quadrant | null {
	if (task.status !== 'open' || task.deletedAt || !task.dueAt) return null;
	if (task.quadrantSource === 'user' || task.important === undefined) return null;
	if (isAssigned(task)) return null;

	const urgentNow = evaluateUrgency(task.dueAt, now, settings).value;
	const urgentBefore = URGENT_QUADRANTS.includes(task.quadrant);
	if (urgentNow === urgentBefore) return null;

	const next = resolveKnown(urgentNow, task.important, task.decision?.delegable.p ?? null);
	return next === task.quadrant ? null : next;
}

export interface Move {
	id: string;
	from: Quadrant;
	to: Quadrant;
}

export function reevaluateAll(tasks: Task[], now: Date, settings: Settings): Move[] {
	const moves: Move[] = [];
	for (const task of tasks) {
		const to = reevaluate(task, now, settings);
		if (to) moves.push({ id: task.id, from: task.quadrant, to });
	}
	return moves;
}
