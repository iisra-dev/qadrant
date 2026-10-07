import { describe, expect, it } from 'vitest';
import type { Task } from './types';
import { STALE_DAYS, weeklyReview } from './review';

// Wednesday 7 October 2026, 10:00 in Madrid; the week runs from Monday 5 to Sunday 11.
const now = new Date('2026-10-07T10:00:00+02:00');

function task(id: string, overrides: Partial<Task> = {}): Task {
	return {
		id,
		createdAt: '2026-10-05T08:00:00.000Z',
		updatedAt: '2026-10-05T08:00:00.000Z',
		title: `Tarea ${id}`,
		rawInput: id,
		quadrant: 'do',
		quadrantSource: 'ai',
		status: 'open',
		...overrides
	};
}

describe('weeklyReview', () => {
	it('adds up the hours of this week by quadrant, done tasks included', () => {
		const review = weeklyReview(
			[
				task('a', { scheduledAt: '2026-10-05T07:00:00.000Z', durationMin: 90 }),
				task('b', { scheduledAt: '2026-10-07T07:00:00.000Z', status: 'done', doneAt: '2026-10-07T08:00:00.000Z' }),
				task('c', { quadrant: 'schedule', scheduledAt: '2026-10-11T15:00:00.000Z', durationMin: 120 }),
				task('d', { quadrant: 'delegate', scheduledAt: '2026-10-09T07:00:00.000Z', durationMin: 15 }),
				// Outside the week, archived, deleted or without a time: not counted.
				task('e', { scheduledAt: '2026-10-04T20:00:00.000Z', durationMin: 60 }),
				task('f', { scheduledAt: '2026-10-12T07:00:00.000Z', durationMin: 60 }),
				task('g', { quadrant: 'eliminate', scheduledAt: '2026-10-06T07:00:00.000Z', status: 'archived' }),
				task('h', { scheduledAt: '2026-10-06T07:00:00.000Z', deletedAt: '2026-10-06T08:00:00.000Z' }),
				task('i', { durationMin: 60 })
			],
			now
		);
		expect(review.minutes).toEqual({ do: 120, schedule: 120, delegate: 15, eliminate: 0 });
		expect(review.totalMinutes).toBe(255);
	});

	it('lists open Programar tasks that have waited two weeks or more, oldest first', () => {
		const review = weeklyReview(
			[
				task('old', { quadrant: 'schedule', createdAt: '2026-09-01T08:00:00.000Z' }),
				task('two', { quadrant: 'schedule', createdAt: '2026-09-23T08:00:00.000Z' }),
				task('recent', { quadrant: 'schedule', createdAt: '2026-09-30T08:00:00.000Z' }),
				// Moved there by the passage of time a few days ago: counts from then.
				task('moved', { quadrant: 'schedule', createdAt: '2026-08-01T08:00:00.000Z', movedAt: '2026-10-02T08:00:00.000Z' }),
				task('done', { quadrant: 'schedule', createdAt: '2026-08-01T08:00:00.000Z', status: 'done' }),
				task('other', { quadrant: 'do', createdAt: '2026-08-01T08:00:00.000Z' })
			],
			now
		);
		expect(review.stale.map((s) => [s.task.id, s.weeks])).toEqual([
			['old', 5],
			['two', 2]
		]);
		expect(STALE_DAYS).toBe(14);
	});

	it('is empty when there is nothing to review', () => {
		expect(weeklyReview([], now)).toMatchObject({ totalMinutes: 0, stale: [] });
	});
});
