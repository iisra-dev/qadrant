import { describe, expect, it } from 'vitest';
import { agendaForDay } from './agenda';
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
