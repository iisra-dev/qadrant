import { describe, expect, it } from 'vitest';
import { agendaForDay, agendaItems, hourRange, waitingOnOthers, weekDays, withoutSlot } from './agenda';
import type { Task } from './types';

function task(id: string, scheduledAt?: Date, overrides: Partial<Task> = {}): Task {
	return {
		id,
		createdAt: '',
		updatedAt: '',
		title: id,
		rawInput: id,
		quadrant: 'do',
		quadrantSource: 'ai',
		status: 'open',
		...(scheduledAt && { scheduledAt: scheduledAt.toISOString() }),
		...overrides
	};
}

describe('agendaForDay', () => {
	it('keeps open tasks of that local day, sorted by time', () => {
		const day = new Date(2026, 9, 2);
		const tasks = [
			task('late', new Date(2026, 9, 2, 16)),
			task('early', new Date(2026, 9, 2, 9)),
			task('midnight', new Date(2026, 9, 2, 0, 30)),
			task('tomorrow', new Date(2026, 9, 3, 9)),
			task('unscheduled'),
			task('done', new Date(2026, 9, 2, 10), { status: 'done' })
		];
		expect(agendaForDay(tasks, day).map((t) => t.id)).toEqual(['midnight', 'early', 'late']);
	});
});

describe('agendaItems', () => {
	it('draws back-to-back Programar tasks as one focus block', () => {
		const items = agendaItems([
			task('do1', new Date(2026, 9, 2, 9)),
			task('s1', new Date(2026, 9, 2, 10), { quadrant: 'schedule', durationMin: 60 }),
			task('s2', new Date(2026, 9, 2, 11), { quadrant: 'schedule', durationMin: 30 }),
			task('s3', new Date(2026, 9, 2, 14), { quadrant: 'schedule' })
		]);
		expect(items.map((i) => [i.tasks.map((t) => t.id), i.minutes, i.focus])).toEqual([
			[['do1'], 30, false],
			[['s1', 's2'], 90, true],
			[['s3'], 30, true]
		]);
	});
});

describe('withoutSlot', () => {
	it('keeps open Hacer and Programar without time', () => {
		const tasks = [task('a'), task('b', new Date()), task('c', undefined, { quadrant: 'delegate' }), task('d', undefined, { quadrant: 'schedule' })];
		expect(withoutSlot(tasks).map((t) => t.id)).toEqual(['a', 'd']);
	});
});

describe('weekDays', () => {
	it('returns the working days of the week, Monday first', () => {
		const friday = new Date(2026, 9, 2, 10);
		expect(weekDays(friday, 0, [1, 2, 3, 4, 5]).map((d) => d.getDate())).toEqual([28, 29, 30, 1, 2]);
		expect(weekDays(friday, 1, [1, 3, 6]).map((d) => d.getDate())).toEqual([5, 7, 10]);
	});

	it('works on Sunday', () => {
		expect(weekDays(new Date(2026, 9, 4, 10), 0, [1])[0].getDate()).toBe(28);
	});
});

describe('hourRange', () => {
	it('uses working hours and widens to fit tasks', () => {
		const hours = { start: '09:00', end: '18:00' };
		expect(hourRange([], hours)).toEqual({ from: 9, to: 18 });
		expect(hourRange([task('a', new Date(2026, 9, 2, 7, 30)), task('b', new Date(2026, 9, 2, 19, 0))], hours)).toEqual({ from: 7, to: 20 });
	});
});

describe('waitingOnOthers', () => {
	it('lists open delegated tasks by follow-up, undated last', () => {
		const tasks = [
			task('none', undefined, { quadrant: 'delegate' }),
			task('late', undefined, { quadrant: 'delegate', followUpAt: '2026-10-09T07:00:00.000Z' }),
			task('soon', undefined, { quadrant: 'delegate', followUpAt: '2026-10-06T07:00:00.000Z' }),
			task('other', undefined, { quadrant: 'do' })
		];
		expect(waitingOnOthers(tasks).map((t) => t.id)).toEqual(['soon', 'late', 'none']);
	});
});
