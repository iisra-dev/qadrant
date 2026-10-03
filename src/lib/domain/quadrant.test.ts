import { describe, expect, it } from 'vitest';
import { combine, doubtOutcomes, importantOnSave, redecide } from './quadrant';
import type { Decision } from './types';

const thresholds = { low: 0.35, high: 0.65 };

function run(urgent: boolean, pImportance: number | null, pDelegable: number | null, assigned = false) {
	return combine({ urgent, assigned, pImportance, pDelegable, thresholds });
}

describe('combine with probabilities', () => {
	it.each([
		[true, 0.87, null, false, { quadrant: 'do' }],
		[true, 0.65, null, false, { quadrant: 'do' }],
		[true, 0.2, 0.8, false, { quadrant: 'delegate' }],
		[true, 0.2, 0.2, false, { quadrant: 'do' }],
		[true, 0.2, 0.5, false, { quadrant: null, ask: 'delegable' }],
		[true, 0.5, 0.8, false, { quadrant: null, ask: 'importance' }],
		[false, 0.7, null, false, { quadrant: 'schedule' }],
		[false, 0.35, null, false, { quadrant: 'eliminate' }],
		[false, 0.52, null, false, { quadrant: null, ask: 'importance' }],
		[true, 0.87, null, true, { quadrant: 'delegate' }],
		[true, 0.2, null, true, { quadrant: 'delegate' }],
		[false, 0.8, null, true, { quadrant: 'delegate' }],
		[false, 0.5, null, true, { quadrant: 'delegate' }]
	] as const)('urgent=%s p=%s delegable=%s assigned=%s', (urgent, pi, pd, assigned, expected) => {
		expect(run(urgent, pi, pd, assigned)).toEqual(expected);
	});

	it('treats a missing delegability as not delegable', () => {
		expect(run(true, 0.2, null)).toEqual({ quadrant: 'do' });
	});
});

describe('combine in rules-only mode', () => {
	it.each([
		[true, true, { quadrant: 'delegate' }],
		[false, true, { quadrant: 'delegate' }],
		[true, false, { quadrant: 'do' }],
		[false, false, { quadrant: null, ask: 'importance' }]
	] as const)('urgent=%s assigned=%s', (urgent, assigned, expected) => {
		expect(run(urgent, null, null, assigned)).toEqual(expected);
	});
});

describe('doubtOutcomes', () => {
	it('urgent with doubtful importance: Yes -> do, No -> delegate when delegable p >= 0.5', () => {
		expect(doubtOutcomes({ ask: 'importance', urgent: true, pDelegable: 0.8 })).toEqual({ yes: 'do', no: 'delegate' });
		expect(doubtOutcomes({ ask: 'importance', urgent: true, pDelegable: 0.5 })).toEqual({ yes: 'do', no: 'delegate' });
		expect(doubtOutcomes({ ask: 'importance', urgent: true, pDelegable: 0.4 })).toEqual({ yes: 'do', no: 'do' });
		expect(doubtOutcomes({ ask: 'importance', urgent: true, pDelegable: null })).toEqual({ yes: 'do', no: 'do' });
	});

	it('not urgent: Yes -> schedule, No -> eliminate', () => {
		expect(doubtOutcomes({ ask: 'importance', urgent: false, pDelegable: null })).toEqual({ yes: 'schedule', no: 'eliminate' });
	});

	it('doubtful delegability: Yes -> delegate, No -> do', () => {
		expect(doubtOutcomes({ ask: 'delegable', urgent: true, pDelegable: 0.5 })).toEqual({ yes: 'delegate', no: 'do' });
	});
});

function decision(overrides: Partial<Decision> = {}): Decision {
	return {
		quadrant: 'do',
		title: 'Tarea',
		urgent: { value: true, reason: 'due-soon' },
		importance: { p: null },
		delegable: { p: null },
		engine: 'rules',
		...overrides
	};
}

describe('importantOnSave', () => {
	it('accepted proposal follows the thresholds', () => {
		const t = thresholds;
		expect(importantOnSave({ kind: 'accepted', decision: decision({ importance: { p: 0.8 } }), thresholds: t })).toBe(true);
		expect(importantOnSave({ kind: 'accepted', decision: decision({ importance: { p: 0.35 } }), thresholds: t })).toBe(false);
		expect(importantOnSave({ kind: 'accepted', decision: decision({ importance: { p: 0.5 } }), thresholds: t })).toBeUndefined();
		expect(importantOnSave({ kind: 'accepted', decision: decision(), thresholds: t })).toBeUndefined();
	});

	it('answer to the importance question is the answer; to delegability is false', () => {
		expect(importantOnSave({ kind: 'answer', ask: 'importance', answer: true })).toBe(true);
		expect(importantOnSave({ kind: 'answer', ask: 'importance', answer: false })).toBe(false);
		expect(importantOnSave({ kind: 'answer', ask: 'delegable', answer: true })).toBe(false);
	});

	it('manual choice', () => {
		expect(importantOnSave({ kind: 'manual', quadrant: 'schedule', urgent: false })).toBe(true);
		expect(importantOnSave({ kind: 'manual', quadrant: 'do', urgent: false })).toBe(true);
		expect(importantOnSave({ kind: 'manual', quadrant: 'do', urgent: true })).toBeUndefined();
		expect(importantOnSave({ kind: 'manual', quadrant: 'eliminate', urgent: true })).toBe(false);
		expect(importantOnSave({ kind: 'manual', quadrant: 'delegate', urgent: false })).toBeUndefined();
	});
});

describe('redecide', () => {
	const settings = { urgencyDays: 2, workDays: [1, 2, 3, 4, 5], holidays: { national: true, extra: [] }, thresholds };
	const now = new Date(2026, 9, 2, 10, 0);

	it('rules-only doubt with a near date becomes Hacer without asking', () => {
		const d = decision({ quadrant: null, ask: 'importance', urgent: { value: false, reason: 'no-date' } });
		const next = redecide(d, new Date(2026, 9, 5, 18).toISOString(), now, settings);
		expect(next.quadrant).toBe('do');
		expect(next.ask).toBeUndefined();
		expect(next.urgent).toMatchObject({ value: true, reason: 'due-soon' });
	});

	it('a far date keeps the importance question', () => {
		const d = decision({ quadrant: null, ask: 'importance', urgent: { value: false, reason: 'no-date' } });
		const next = redecide(d, new Date(2026, 9, 30, 18).toISOString(), now, settings);
		expect(next).toMatchObject({ quadrant: null, ask: 'importance', urgent: { value: false, reason: 'due-later' } });
	});

	it('keeps the probabilities', () => {
		const d = decision({ quadrant: null, ask: 'importance', importance: { p: 0.8 }, urgent: { value: false, reason: 'no-date' } });
		expect(redecide(d, new Date(2026, 9, 5, 18).toISOString(), now, settings).quadrant).toBe('do');
	});
});
