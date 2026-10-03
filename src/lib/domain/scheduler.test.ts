import { describe, expect, it } from 'vitest';
import { defaultSettings } from '$lib/db/defaults';
import { DEFAULT_DURATION_MIN, schedule, type BusyEvent } from './scheduler';
import type { Quadrant, Settings, Task } from './types';

const settings: Settings = defaultSettings(); // Mon-Fri 09:00-18:00, national holidays
const friday2Oct10 = new Date(2026, 9, 2, 10, 0);

let seq = 0;
function task(quadrant: Quadrant, overrides: Partial<Task> = {}): Task {
	seq++;
	return {
		id: overrides.id ?? `t${seq}`,
		createdAt: new Date(2026, 8, seq).toISOString(),
		updatedAt: '',
		title: `Tarea ${seq}`,
		rawInput: '',
		quadrant,
		quadrantSource: 'ai',
		status: 'open',
		...overrides
	};
}

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();

function placed(result: ReturnType<typeof schedule>, id: string) {
	return result.placements.find((p) => p.taskId === id);
}

describe('schedule: Hacer', () => {
	it('places a task in the first free slot, from now rounded to 15 min', () => {
		const result = schedule({ now: new Date(2026, 9, 2, 10, 7), tasks: [task('do', { id: 'a' })], settings });
		expect(placed(result, 'a')).toEqual({ taskId: 'a', start: at(2, 10, 15), end: at(2, 10, 45), focus: false });
		expect(DEFAULT_DURATION_MIN).toBe(30);
	});

	it('uses the duration and skips busy time (fixed tasks and timed events)', () => {
		const fixed = task('do', { id: 'fixed', scheduledAt: at(2, 10, 0), durationMin: 60 });
		const events: BusyEvent[] = [{ start: at(2, 11, 0), end: at(2, 12, 0), allDay: false }];
		const result = schedule({ now: friday2Oct10, tasks: [fixed, task('do', { id: 'a', durationMin: 45 })], settings, events });
		expect(placed(result, 'a')).toMatchObject({ start: at(2, 12, 0), end: at(2, 12, 45) });
		expect(placed(result, 'fixed')).toBeUndefined();
	});

	it('all-day events do not take time', () => {
		const events: BusyEvent[] = [{ start: at(2, 0), end: at(3, 0), allDay: true }];
		const result = schedule({ now: friday2Oct10, tasks: [task('do', { id: 'a' })], settings, events });
		expect(placed(result, 'a')?.start).toBe(at(2, 10, 0));
	});

	it('never on weekends or holidays: Friday 9 Oct after hours goes to Tuesday 13 (Monday 12 is a holiday)', () => {
		const result = schedule({ now: new Date(2026, 9, 9, 18, 30), tasks: [task('do', { id: 'a' })], settings });
		expect(placed(result, 'a')?.start).toBe(at(13, 9, 0));
	});

	it('must finish before dueAt; otherwise it has no slot yet', () => {
		const ok = task('do', { id: 'ok', dueAt: at(2, 10, 30) });
		const late = task('do', { id: 'late', dueAt: at(2, 10, 45), durationMin: 60 });
		const result = schedule({ now: friday2Oct10, tasks: [ok, late], settings });
		expect(placed(result, 'ok')).toMatchObject({ start: at(2, 10, 0), end: at(2, 10, 30) });
		expect(result.unplaced).toEqual(['late']);
	});

	it('orders Hacer: overdue first, then by due date', () => {
		const later = task('do', { id: 'later', dueAt: at(6, 18) });
		const overdue = task('do', { id: 'overdue', dueAt: at(1, 18) });
		const soon = task('do', { id: 'soon', dueAt: at(5, 18) });
		const result = schedule({ now: friday2Oct10, tasks: [later, soon, overdue], settings });
		expect(placed(result, 'overdue')?.start).toBe(at(2, 10, 0));
		expect(placed(result, 'soon')?.start).toBe(at(2, 10, 30));
		expect(placed(result, 'later')?.start).toBe(at(2, 11, 0));
	});
});

describe('schedule: Programar in focus blocks', () => {
	it('fills one focus block per day (60-120 min) with the oldest tasks', () => {
		const tasks = [
			task('schedule', { id: 'old', durationMin: 60 }),
			task('schedule', { id: 'mid', durationMin: 45 }),
			task('schedule', { id: 'new', durationMin: 30 })
		];
		const result = schedule({ now: friday2Oct10, tasks, settings });
		expect(placed(result, 'old')).toEqual({ taskId: 'old', start: at(2, 10, 0), end: at(2, 11, 0), focus: true });
		expect(placed(result, 'mid')).toMatchObject({ start: at(2, 11, 0), end: at(2, 11, 45), focus: true });
		// 120 min block is full (105 used, 30 does not fit): next working day.
		expect(placed(result, 'new')).toMatchObject({ start: at(5, 9, 0), focus: true });
	});

	it('needs a free gap of at least 60 min', () => {
		const events: BusyEvent[] = [
			{ start: at(2, 10, 45), end: at(2, 18, 0), allDay: false }
		];
		const result = schedule({ now: friday2Oct10, tasks: [task('schedule', { id: 'a' })], settings, events });
		expect(placed(result, 'a')?.start).toBe(at(5, 9, 0));
	});

	it('Hacer goes first and Programar uses what is left', () => {
		const result = schedule({
			now: new Date(2026, 9, 2, 16, 0),
			tasks: [task('schedule', { id: 's' }), task('do', { id: 'd', durationMin: 90 })],
			settings
		});
		expect(placed(result, 'd')?.start).toBe(at(2, 16, 0));
		expect(placed(result, 's')?.start).toBe(at(5, 9, 0));
	});

	it('a task longer than a focus block has no slot', () => {
		const result = schedule({ now: friday2Oct10, tasks: [task('schedule', { id: 'big', durationMin: 150 })], settings });
		expect(result.unplaced).toEqual(['big']);
	});

	it('ignores Delegar, Eliminar, done and already scheduled tasks', () => {
		const tasks = [
			task('delegate'),
			task('eliminate'),
			task('do', { status: 'done' }),
			task('schedule', { scheduledAt: at(5, 9) })
		];
		const result = schedule({ now: friday2Oct10, tasks, settings });
		expect(result).toEqual({ placements: [], unplaced: [] });
	});

	it('what does not fit in the horizon has no slot yet', () => {
		const tasks = Array.from({ length: 40 }, (_, i) => task('schedule', { id: `s${i}`, durationMin: 60 }));
		const result = schedule({ now: friday2Oct10, tasks, settings, horizonDays: 7 });
		// 5 working days in 7 calendar days from Friday (Fri, Mon-Thu): two 60-min tasks per block.
		expect(result.placements).toHaveLength(10);
		expect(result.unplaced).toHaveLength(30);
	});
});
