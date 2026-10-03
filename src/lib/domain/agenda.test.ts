import { describe, expect, it } from 'vitest';
import { agendaForDay, agendaItems, withoutSlot } from './agenda';
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
