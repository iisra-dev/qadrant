// What the engine learns from the user's own tasks (docs/03, "Correcciones y
// calibración" and step 6). Pure: the app feeds tasks in, the engine trains.
import type { Settings, Task } from './types';

/** A task title with what the user's choices say about it. */
export interface LabeledTask {
	title: string;
	important?: boolean;
	delegable?: boolean;
}

/** Labels needed (and of both values) before anything is learned or recalibrated. */
export const MIN_LABELED = 20;

/**
 * Delegability is known for assignments ("Que Ana…"), Delegar picked by hand
 * and answers to the delegability doubt; importance, from Task.important.
 */
export function delegableLabel(task: Task): boolean | undefined {
	if (task.decision?.delegable.personId) return true;
	if (task.quadrantSource === 'answer' && task.decision?.ask === 'delegable') return task.quadrant === 'delegate';
	if (task.quadrantSource === 'user' && task.quadrant === 'delegate') return true;
	return undefined;
}

export function trainingSet(tasks: Task[]): LabeledTask[] {
	const out: LabeledTask[] = [];
	for (const task of tasks) {
		if (task.deletedAt) continue;
		const delegable = delegableLabel(task);
		if (task.important === undefined && delegable === undefined) continue;
		out.push({
			title: task.title,
			...(task.important !== undefined && { important: task.important }),
			...(delegable !== undefined && { delegable })
		});
	}
	return out;
}

export interface ImportanceLabel {
	p: number;
	important: boolean;
}

/**
 * Accepted and corrected tasks alike: with only the corrections the sample
 * would be the mistakes (docs/03).
 */
export function importanceLabels(tasks: Task[]): ImportanceLabel[] {
	const out: ImportanceLabel[] = [];
	for (const task of tasks) {
		const p = task.decision?.importance.p;
		if (task.deletedAt || task.important === undefined || p === null || p === undefined) continue;
		out.push({ p, important: task.important });
	}
	return out;
}

const DOUBT_COST = 0.3;
const MIN_GAP = 15; // high - low >= 0.15, in hundredths
const STEP = 5;
const DEFAULT: Settings['thresholds'] = { low: 0.35, high: 0.65 };

/**
 * Grid search every 0.05 with high - low >= 0.15, minimizing errors + 0.3 x
 * doubts: minimizing errors alone would widen the doubt zone until it always
 * asks. Ties go to the pair closest to the defaults. null without enough labels.
 */
export function recalibrateThresholds(labels: ImportanceLabel[]): Settings['thresholds'] | null {
	if (labels.length < MIN_LABELED || labels.every((l) => l.important) || labels.every((l) => !l.important)) return null;
	// Hundredths, so 0.35 compares as 35 without float surprises.
	const points = labels.map((l) => ({ p: Math.round(l.p * 10000) / 100, important: l.important }));
	let best: { low: number; high: number; cost: number; distance: number } | null = null;
	for (let low = 0; low <= 100 - MIN_GAP; low += STEP) {
		for (let high = low + MIN_GAP; high <= 100; high += STEP) {
			let cost = 0;
			for (const { p, important } of points) {
				if (p >= high) cost += important ? 0 : 1;
				else if (p <= low) cost += important ? 1 : 0;
				else cost += DOUBT_COST;
			}
			const distance = Math.abs(low - DEFAULT.low * 100) + Math.abs(high - DEFAULT.high * 100);
			if (!best || cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) < 1e-9 && distance < best.distance)) {
				best = { low, high, cost, distance };
			}
		}
	}
	return best && { low: best.low / 100, high: best.high / 100 };
}
