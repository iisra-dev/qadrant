import { describe, expect, it } from 'vitest';
import type { Task } from '$lib/domain/types';
import { fingerprint, remindersFor } from './reminders';

const now = new Date('2026-10-02T08:00:00Z');

function task(id: string, overrides: Partial<Task> = {}): Task {
	return {
		id,
		createdAt: '',
		updatedAt: '',
		title: `Tarea ${id}`,
		rawInput: 'secret raw input',
		quadrant: 'do',
		quadrantSource: 'ai',
		status: 'open',
		notes: 'private notes',
		...overrides
	};
}

describe('remindersFor', () => {
	it('sends only id, time, kind and title of future due dates and follow-ups', () => {
		const list = remindersFor(
			[
				task('due', { dueAt: '2026-10-05T07:00:00.000Z' }),
				task('past', { dueAt: '2026-10-01T16:00:00.000Z' }),
				task('nodate'),
				task('done', { dueAt: '2026-10-05T07:00:00.000Z', status: 'done' }),
				task('deleg', { quadrant: 'delegate', followUpAt: '2026-10-06T07:00:00.000Z', dueAt: '2026-10-09T16:00:00.000Z' })
			],
			now
		);
		expect(list).toEqual([
			{ taskId: 'due', kind: 'due', at: '2026-10-05T07:00:00.000Z', title: 'Tarea due' },
			{ taskId: 'deleg', kind: 'follow-up', at: '2026-10-06T07:00:00.000Z', title: 'Tarea deleg' },
			{ taskId: 'deleg', kind: 'due', at: '2026-10-09T16:00:00.000Z', title: 'Tarea deleg' }
		]);
		expect(JSON.stringify(list)).not.toMatch(/secret|private/);
	});

	it('ignores follow-ups outside Delegar and cuts long titles', () => {
		const list = remindersFor([task('a', { followUpAt: '2026-10-06T07:00:00.000Z', dueAt: '2026-10-07T07:00:00.000Z', title: 'x'.repeat(300) })], now);
		expect(list).toHaveLength(1);
		expect(list[0].title).toHaveLength(200);
	});

	it('fingerprint does not depend on task order', () => {
		const a = task('a', { dueAt: '2026-10-05T07:00:00.000Z' });
		const b = task('b', { dueAt: '2026-10-05T07:00:00.000Z' });
		expect(fingerprint(remindersFor([a, b], now))).toBe(fingerprint(remindersFor([b, a], now)));
	});
});
