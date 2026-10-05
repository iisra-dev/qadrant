import { describe, expect, it } from 'vitest';
import { delegableLabel, importanceLabels, recalibrateThresholds, trainingSet } from './learning';
import type { Decision, Task } from './types';

function task(over: Omit<Partial<Task>, 'decision'> & { decision?: Partial<Decision> }): Task {
	const { decision, ...rest } = over;
	return {
		id: crypto.randomUUID(),
		createdAt: '2026-10-01T10:00:00.000Z',
		updatedAt: '2026-10-01T10:00:00.000Z',
		title: 'Tarea',
		rawInput: 'Tarea',
		quadrant: 'do',
		quadrantSource: 'ai',
		status: 'open',
		...rest,
		...(decision && {
			decision: {
				quadrant: 'do',
				title: 'Tarea',
				urgent: { value: true, reason: 'due-soon' },
				importance: { p: 0.5 },
				delegable: { p: null },
				engine: 'model-wasm',
				...decision
			} as Decision
		})
	};
}

describe('delegableLabel', () => {
	it('assignments and Delegar by hand are delegable', () => {
		expect(delegableLabel(task({ decision: { delegable: { p: null, personId: 'ana' } } }))).toBe(true);
		expect(delegableLabel(task({ quadrant: 'delegate', quadrantSource: 'user' }))).toBe(true);
	});

	it('the answer to the delegability doubt is the label', () => {
		expect(delegableLabel(task({ quadrant: 'delegate', quadrantSource: 'answer', decision: { ask: 'delegable' } }))).toBe(true);
		expect(delegableLabel(task({ quadrant: 'do', quadrantSource: 'answer', decision: { ask: 'delegable' } }))).toBe(false);
	});

	it('is unknown otherwise', () => {
		expect(delegableLabel(task({ quadrant: 'do', quadrantSource: 'ai' }))).toBeUndefined();
		expect(delegableLabel(task({ quadrant: 'do', quadrantSource: 'answer', decision: { ask: 'importance' } }))).toBeUndefined();
	});
});

describe('trainingSet', () => {
	it('keeps titles with a known label and skips deleted tasks', () => {
		const set = trainingSet([
			task({ title: 'A', important: true }),
			task({ title: 'B' }),
			task({ title: 'C', important: false, deletedAt: '2026-10-02T00:00:00.000Z' }),
			task({ title: 'D', quadrant: 'delegate', quadrantSource: 'user' })
		]);
		expect(set).toEqual([{ title: 'A', important: true }, { title: 'D', delegable: true }]);
	});
});

describe('importanceLabels', () => {
	it('needs both the label and the model probability', () => {
		const labels = importanceLabels([
			task({ important: true, decision: { importance: { p: 0.8 } } }),
			task({ important: false, decision: { importance: { p: null } } }),
			task({ decision: { importance: { p: 0.3 } } })
		]);
		expect(labels).toEqual([{ p: 0.8, important: true }]);
	});
});

describe('recalibrateThresholds', () => {
	const labels = (pairs: [number, boolean][]) => pairs.map(([p, important]) => ({ p, important }));

	it('needs 20 labels of both values', () => {
		expect(recalibrateThresholds(labels(Array(19).fill([0.9, true]).concat([[0.1, false]])))).not.toBeNull();
		expect(recalibrateThresholds(labels(Array(18).fill([0.9, true]).concat([[0.1, false]])))).toBeNull();
		expect(recalibrateThresholds(labels(Array(30).fill([0.9, true])))).toBeNull();
	});

	it('keeps the defaults when they already separate the labels', () => {
		const data = labels([...Array(10).fill([0.8, true]), ...Array(10).fill([0.2, false])]);
		expect(recalibrateThresholds(data)).toEqual({ low: 0.35, high: 0.65 });
	});

	it('moves the thresholds when the model runs high for this user', () => {
		// Unimportant tasks score 0.70 and important ones 0.90: high must go above 0.70.
		const data = labels([...Array(10).fill([0.9, true]), ...Array(10).fill([0.7, false])]);
		const t = recalibrateThresholds(data)!;
		expect(t.high).toBeGreaterThan(0.7);
		expect(t.high).toBeLessThanOrEqual(0.9);
		expect(t.low).toBeGreaterThanOrEqual(0.7);
		expect(t.high - t.low).toBeGreaterThanOrEqual(0.15 - 1e-9);
	});

	it('prefers asking to being wrong only up to the doubt cost', () => {
		// Mixed labels at 0.5: answering wrong costs 1, asking costs 0.3, so they stay in the doubt zone.
		const data = labels([
			...Array(8).fill([0.9, true]),
			...Array(8).fill([0.1, false]),
			[0.5, true],
			[0.5, false],
			[0.5, true],
			[0.5, false]
		]);
		const t = recalibrateThresholds(data)!;
		expect(t.low).toBeLessThan(0.5);
		expect(t.high).toBeGreaterThan(0.5);
	});
});
