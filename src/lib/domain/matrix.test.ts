import { describe, expect, it } from 'vitest';
import { groupByQuadrant, isOverdue, sortForMatrix, staleEliminate } from './matrix';
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
