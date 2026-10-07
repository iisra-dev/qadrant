import { addDays, isoWeekday, startOfDay } from './dates';
import { DEFAULT_DURATION_MIN } from './scheduler';
import { QUADRANTS, type Quadrant, type Task } from './types';

/** An open Programar task this old is worth a look in the weekly review. */
export const STALE_DAYS = 14;

const DAY_MS = 24 * 60 * 60_000;

export interface WeeklyReview {
	/** Minutes in the agenda this week (Monday to Sunday), by quadrant. */
	minutes: Record<Quadrant, number>;
	totalMinutes: number;
	/** Open Programar tasks waiting for weeks, oldest first. */
	stale: { task: Task; weeks: number }[];
}

/**
 * The weekly review card of the Agenda (docs/01): where this week's time
 * goes, from the tasks with a time (done ones too; 30 min when they have no
 * duration, as in the scheduler), and what has been in Programar for weeks.
 * Time in Programar counts from creation, or from the last automatic move.
 */
export function weeklyReview(tasks: Task[], now: Date): WeeklyReview {
	const monday = addDays(startOfDay(now), 1 - isoWeekday(now));
	const from = monday.getTime();
	const to = addDays(monday, 7).getTime();
	const minutes = Object.fromEntries(QUADRANTS.map((q) => [q, 0])) as Record<Quadrant, number>;
	const stale: WeeklyReview['stale'] = [];

	for (const task of tasks) {
		if (task.deletedAt) continue;
		if (task.scheduledAt && task.status !== 'archived') {
			const start = new Date(task.scheduledAt).getTime();
			if (start >= from && start < to) minutes[task.quadrant] += task.durationMin ?? DEFAULT_DURATION_MIN;
		}
		if (task.status === 'open' && task.quadrant === 'schedule') {
			const since = new Date(task.movedAt ?? task.createdAt).getTime();
			const days = Math.floor((now.getTime() - since) / DAY_MS);
			if (days >= STALE_DAYS) stale.push({ task, weeks: Math.floor(days / 7) });
		}
	}
	stale.sort((a, b) => (a.task.movedAt ?? a.task.createdAt).localeCompare(b.task.movedAt ?? b.task.createdAt));
	const totalMinutes = QUADRANTS.reduce((sum, q) => sum + minutes[q], 0);
	return { minutes, totalMinutes, stale };
}
