import { describe, expect, it } from 'vitest';
import { agendaForDay, agendaItems, busyHours, dayLoad, eventsForDay, hourLayout, hourRange, offsetOf, ROW_BUSY, ROW_IDLE, waitingOnOthers, weekDays, withoutSlot } from './agenda';
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

describe('eventsForDay', () => {
	it('splits all-day (end exclusive) and timed events of the day', () => {
		const events = [
			{ id: 'trip', start: '2026-10-01', end: '2026-10-03', title: 'Viaje', allDay: true },
			{ id: 'holiday', start: '2026-10-12', end: '2026-10-13', title: 'Fiesta', allDay: true },
			{ id: 'late', start: new Date(2026, 9, 2, 16).toISOString(), end: new Date(2026, 9, 2, 17).toISOString(), title: 'B', allDay: false },
			{ id: 'early', start: new Date(2026, 9, 2, 9).toISOString(), end: new Date(2026, 9, 2, 10).toISOString(), title: 'A', allDay: false },
			{ id: 'other', start: new Date(2026, 9, 3, 9).toISOString(), end: new Date(2026, 9, 3, 10).toISOString(), title: 'C', allDay: false }
		];
		const day = eventsForDay(events, new Date(2026, 9, 2));
		expect(day.allDay.map((e) => e.id)).toEqual(['trip']);
		expect(day.timed.map((e) => e.id)).toEqual(['early', 'late']);
		expect(eventsForDay(events, new Date(2026, 9, 3)).allDay).toEqual([]);
	});
});

describe('dayLoad', () => {
	it('counts open tasks due that local day, by quadrant', () => {
		const day = new Date(2026, 9, 7);
		const due = (h: number, d = 7) => new Date(2026, 9, d, h).toISOString();
		const load = dayLoad(
			[
				task('a', undefined, { dueAt: due(9) }),
				task('b', undefined, { dueAt: due(23), quadrant: 'schedule' }),
				task('c', undefined, { dueAt: due(10), quadrant: 'schedule' }),
				task('other day', undefined, { dueAt: due(9, 8) }),
				task('done', undefined, { dueAt: due(9), status: 'done' }),
				task('deleted', undefined, { dueAt: due(9), deletedAt: due(8) }),
				task('no date')
			],
			day
		);
		expect(load).toEqual({ do: 1, schedule: 2, delegate: 0, eliminate: 0 });
	});
});

describe('hourLayout', () => {
	const at = (h: number, m = 0) => new Date(2026, 9, 7, h, m);

	it('marks every hour a span touches as busy', () => {
		const busy = busyHours([
			{ start: at(10, 30), minutes: 60 },
			{ start: at(14), minutes: 60 },
			{ start: at(16, 45), minutes: 15 }
		]);
		expect([...busy].sort((a, b) => a - b)).toEqual([10, 11, 14, 16]);
	});

	it('gives busy hours room for a 30-minute block and squeezes empty ones', () => {
		const layout = hourLayout({ from: 9, to: 13 }, new Set([10, 11]));
		expect(layout.heights).toEqual([ROW_IDLE, ROW_BUSY, ROW_BUSY, ROW_IDLE]);
		expect(layout.offsets).toEqual([0, ROW_IDLE, ROW_IDLE + ROW_BUSY, ROW_IDLE + 2 * ROW_BUSY]);
		expect(layout.total).toBe(2 * ROW_IDLE + 2 * ROW_BUSY);
		expect(ROW_BUSY / 2).toBeGreaterThanOrEqual(44);
	});

	it('an empty week is all short rows', () => {
		expect(hourLayout({ from: 9, to: 18 }, new Set()).total).toBe(9 * ROW_IDLE);
	});

	it('places a time inside its hour row', () => {
		const layout = hourLayout({ from: 9, to: 13 }, new Set([10, 11]));
		expect(offsetOf(layout, at(9))).toBe(0);
		expect(offsetOf(layout, at(10, 30))).toBe(ROW_IDLE + ROW_BUSY / 2);
		expect(offsetOf(layout, at(12))).toBe(ROW_IDLE + 2 * ROW_BUSY);
		expect(offsetOf(layout, at(13))).toBe(layout.total);
		expect(offsetOf(layout, at(8))).toBe(0);
		expect(offsetOf(layout, at(20))).toBe(layout.total);
	});
});
