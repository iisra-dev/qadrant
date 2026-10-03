import { addDays, atTime, startOfDay } from './dates';
import { sortForMatrix } from './matrix';
import type { Settings, Task } from './types';
import { isWorkingDay } from './urgency';

/** Tasks without a duration take 30 min (docs/06, phase 3). */
export const DEFAULT_DURATION_MIN = 30;
/** A focus block is a free gap of 60 to 120 min, at most one per day. */
export const FOCUS_MIN = 60;
export const FOCUS_MAX = 120;
const STEP_MS = 15 * 60_000;
const MIN_MS = 60_000;

export interface BusyEvent {
	start: string;
	end: string;
	allDay: boolean;
}

export interface Placement {
	taskId: string;
	start: string;
	end: string;
	/** Part of a focus block (Programar tasks drawn together by the agenda). */
	focus: boolean;
}

export interface ScheduleInput {
	now: Date;
	tasks: Task[];
	settings: Pick<Settings, 'workHours' | 'workDays' | 'holidays'>;
	/** Calendar events; only those with a time take time. */
	events?: BusyEvent[];
	/** Calendar days ahead to look for gaps, today included. */
	horizonDays?: number;
}

export interface ScheduleResult {
	placements: Placement[];
	/** Ids of the tasks with no slot yet ("Sin hueco todavía"). */
	unplaced: string[];
}

type Interval = { start: number; end: number };

function duration(task: Task): number {
	return (task.durationMin ?? DEFAULT_DURATION_MIN) * MIN_MS;
}

function subtract(free: Interval[], busy: Interval): Interval[] {
	const out: Interval[] = [];
	for (const slot of free) {
		if (busy.end <= slot.start || busy.start >= slot.end) {
			out.push(slot);
			continue;
		}
		if (busy.start > slot.start) out.push({ start: slot.start, end: busy.start });
		if (busy.end < slot.end) out.push({ start: busy.end, end: slot.end });
	}
	return out;
}

/**
 * Free-slot finder (docs/01 and docs/06, phase 3): Hacer goes into the first
 * free slot before its due date; Programar is grouped into one focus block per
 * day, oldest first. Never on holidays or over timed calendar events.
 */
export function schedule({ now, tasks, settings, events = [], horizonDays = 14 }: ScheduleInput): ScheduleResult {
	const from = Math.ceil(now.getTime() / STEP_MS) * STEP_MS;

	const busy: Interval[] = [
		...tasks
			.filter((t) => t.status === 'open' && !t.deletedAt && t.scheduledAt)
			.map((t) => {
				const start = new Date(t.scheduledAt!).getTime();
				return { start, end: start + duration(t) };
			}),
		...events
			.filter((e) => !e.allDay)
			.map((e) => ({ start: new Date(e.start).getTime(), end: new Date(e.end).getTime() }))
	];

	// Free time per working day, in order.
	const days: Interval[][] = [];
	for (let i = 0; i < horizonDays; i++) {
		const day = addDays(startOfDay(now), i);
		if (!isWorkingDay(day, settings)) continue;
		const start = Math.max(atTime(day, settings.workHours.start).getTime(), from);
		const end = atTime(day, settings.workHours.end).getTime();
		if (end <= start) continue;
		let free: Interval[] = [{ start, end }];
		for (const b of busy) free = subtract(free, b);
		days.push(free);
	}

	const pending = tasks.filter((t) => t.status === 'open' && !t.deletedAt && !t.scheduledAt);
	const placements: Placement[] = [];
	const unplaced: string[] = [];

	const take = (dayIndex: number, at: number, length: number) => {
		days[dayIndex] = subtract(days[dayIndex], { start: at, end: at + length });
	};

	// Hacer: overdue first, then by due date, then oldest.
	for (const task of sortForMatrix(pending.filter((t) => t.quadrant === 'do'), now)) {
		const length = duration(task);
		const due = task.dueAt ? new Date(task.dueAt).getTime() : Infinity;
		const deadline = due < from ? Infinity : due; // overdue: as soon as possible
		let done = false;
		for (let d = 0; d < days.length && !done; d++) {
			const slot = days[d].find((s) => s.end - s.start >= length && s.start + length <= deadline);
			if (slot) {
				placements.push({ taskId: task.id, start: iso(slot.start), end: iso(slot.start + length), focus: false });
				take(d, slot.start, length);
				done = true;
			}
		}
		if (!done) unplaced.push(task.id);
	}

	// Programar: one focus block per day, filled with the oldest tasks that fit.
	const queue = pending
		.filter((t) => t.quadrant === 'schedule')
		.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
	for (let d = 0; d < days.length && queue.length; d++) {
		const gap = days[d].find((s) => s.end - s.start >= FOCUS_MIN * MIN_MS);
		if (!gap) continue;
		const blockEnd = gap.start + Math.min(FOCUS_MAX * MIN_MS, gap.end - gap.start);
		let cursor = gap.start;
		for (let i = 0; i < queue.length; ) {
			const task = queue[i];
			const length = duration(task);
			const due = task.dueAt ? new Date(task.dueAt).getTime() : Infinity;
			if (cursor + length <= blockEnd && cursor + length <= due) {
				placements.push({ taskId: task.id, start: iso(cursor), end: iso(cursor + length), focus: true });
				cursor += length;
				queue.splice(i, 1);
			} else {
				i++;
			}
		}
		if (cursor > gap.start) take(d, gap.start, cursor - gap.start);
	}
	unplaced.push(...queue.map((t) => t.id));

	return { placements, unplaced };
}

function iso(ms: number): string {
	return new Date(ms).toISOString();
}
