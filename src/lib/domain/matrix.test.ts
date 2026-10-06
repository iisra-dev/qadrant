import { describe, expect, it } from 'vitest';
import { DONE_VISIBLE_HOURS, groupByQuadrant, matrixTasks, isOverdue, recentlyDone, sortForMatrix, staleEliminate } from './matrix';
import type { Task } from './types';

const now = new Date(2026, 9, 2, 10, 0);

function task(id: string, overrides: Partial<Task> = {}): Task {
	return {
		id,
		createdAt: `2026-10-0${id.length}T00:00:00.000Z`,
		updatedAt: '',
		title: id,
		rawInput: id,
		quadrant: 'do',
		quadrantSource: 'ai',
		status: 'open',
		...overrides
	};
}

describe('sortForMatrix', () => {
	it('overdue first, then by due date, undated last, then oldest', () => {
		const tasks = [
			task('nodate-new', { createdAt: '2026-09-30T00:00:00.000Z' }),
			task('nodate-old', { createdAt: '2026-09-01T00:00:00.000Z' }),
			task('later', { dueAt: new Date(2026, 9, 9).toISOString() }),
			task('soon', { dueAt: new Date(2026, 9, 3).toISOString() }),
			task('overdue', { dueAt: new Date(2026, 9, 1).toISOString() })
		];
		expect(sortForMatrix(tasks, now).map((t) => t.id)).toEqual(['overdue', 'soon', 'later', 'nodate-old', 'nodate-new']);
	});
});

describe('isOverdue', () => {
	it('compares with now', () => {
		expect(isOverdue({ dueAt: new Date(2026, 9, 2, 9).toISOString() }, now)).toBe(true);
		expect(isOverdue({ dueAt: new Date(2026, 9, 2, 18).toISOString() }, now)).toBe(false);
		expect(isOverdue({}, now)).toBe(false);
	});
});

describe('groupByQuadrant', () => {
	it('groups and sorts', () => {
		const groups = groupByQuadrant([task('a', { quadrant: 'eliminate' }), task('b')], now);
		expect(groups.eliminate.map((t) => t.id)).toEqual(['a']);
		expect(groups.do.map((t) => t.id)).toEqual(['b']);
		expect(groups.schedule).toEqual([]);
	});
});

describe('staleEliminate', () => {
	it('suggests Eliminar tasks untouched for 14 days', () => {
		const tasks = [
			task('old', { quadrant: 'eliminate', updatedAt: new Date(2026, 8, 18, 10).toISOString() }),
			task('recent', { quadrant: 'eliminate', updatedAt: new Date(2026, 8, 19, 10, 1).toISOString() }),
			task('other', { quadrant: 'do', updatedAt: new Date(2026, 8, 1).toISOString() })
		];
		expect(staleEliminate(tasks, now).map((t) => t.id)).toEqual(['old']);
	});
});

describe('done tasks in the Matrix', () => {
	it('stay visible, struck through, for 24 hours after being done', () => {
		const tasks = [
			task('just-done', { status: 'done', doneAt: new Date(now.getTime() - 60_000).toISOString() }),
			task('done-23h', { status: 'done', doneAt: new Date(now.getTime() - 23 * 3_600_000).toISOString() }),
			task('done-25h', { status: 'done', doneAt: new Date(now.getTime() - 25 * 3_600_000).toISOString() }),
			task('archived', { status: 'archived', doneAt: new Date(now.getTime() - 60_000).toISOString() }),
			task('deleted', { status: 'done', doneAt: now.toISOString(), deletedAt: now.toISOString() }),
			task('open')
		];
		expect(recentlyDone(tasks, now).map((t) => t.id)).toEqual(['just-done', 'done-23h']);
		expect(DONE_VISIBLE_HOURS).toBe(24);
	});

	it('one entry per task, the newer copy winning', () => {
		const open = task('a', { updatedAt: '2026-10-02T07:00:00.000Z' });
		const done = task('a', { status: 'done', doneAt: now.toISOString(), updatedAt: '2026-10-02T08:00:00.000Z' });
		expect(matrixTasks([open], [done], now)).toEqual([done]);
		const reopened = task('a', { updatedAt: '2026-10-02T09:00:00.000Z' });
		expect(matrixTasks([reopened], [done], now)).toEqual([reopened]);
	});

	it('go after the open ones in their quadrant', () => {
		const groups = groupByQuadrant(
			[
				task('done', { status: 'done', doneAt: now.toISOString(), dueAt: '2026-10-01T10:00:00.000Z' }),
				task('open-late', { dueAt: '2026-10-20T10:00:00.000Z' })
			],
			now
		);
		expect(groups.do.map((t) => t.id)).toEqual(['open-late', 'done']);
	});
});
