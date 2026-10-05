import { describe, expect, it } from 'vitest';
import { defaultSettings } from '$lib/db/defaults';
import { reevaluate, reevaluateAll } from './reevaluate';
import type { Decision, Task } from './types';

const settings = defaultSettings();
const due = new Date(2026, 9, 20, 18, 0).toISOString(); // Tuesday 20 Oct
const thursday15 = new Date(2026, 9, 15, 9, 0);
const friday16 = new Date(2026, 9, 16, 9, 0);

function decision(overrides: Partial<Decision> = {}): Decision {
	return {
		quadrant: 'schedule',
		title: 'Presentar el plan Q4',
		urgent: { value: false, dueAt: due, reason: 'due-later' },
		importance: { p: 0.8 },
		delegable: { p: null },
		engine: 'model-wasm',
		...overrides
	};
}

function task(overrides: Partial<Task> = {}): Task {
	return {
		id: 't1',
		createdAt: '2026-10-02T08:00:00.000Z',
		updatedAt: '2026-10-02T08:00:00.000Z',
		title: 'Presentar el plan Q4',
		rawInput: 'El 20 de octubre presentar el plan Q4',
		quadrant: 'schedule',
		quadrantSource: 'ai',
		important: true,
		dueAt: due,
		status: 'open',
		decision: decision(),
		...overrides
	};
}

describe('reevaluate', () => {
	it('stays in Programar while outside the window', () => {
		expect(reevaluate(task(), thursday15, settings)).toBeNull();
	});

	it('moves Programar to Hacer when it enters the window', () => {
		expect(reevaluate(task(), friday16, settings)).toBe('do');
	});

	it('does not move tasks placed by hand', () => {
		expect(reevaluate(task({ quadrantSource: 'user' }), friday16, settings)).toBeNull();
	});

	it('moves Eliminar to Delegar when delegable p >= 0.5', () => {
		const t = task({
			quadrant: 'eliminate',
			important: false,
			decision: decision({ quadrant: 'eliminate', importance: { p: 0.2 }, delegable: { p: 0.7 } })
		});
		expect(reevaluate(t, friday16, settings)).toBe('delegate');
	});

	it('moves Eliminar to Hacer when delegable p < 0.5 or unknown', () => {
		const t = task({ quadrant: 'eliminate', important: false, decision: decision({ delegable: { p: 0.3 } }) });
		expect(reevaluate(t, friday16, settings)).toBe('do');
		expect(reevaluate({ ...t, decision: undefined }, friday16, settings)).toBe('do');
	});

	it('keeps assigned tasks in Delegar', () => {
		const t = task({
			quadrant: 'delegate',
			important: true,
			delegatedTo: 'luis',
			decision: decision({ quadrant: 'delegate', delegable: { p: null, personId: 'luis' } })
		});
		expect(reevaluate(t, friday16, settings)).toBeNull();
		expect(reevaluate(t, thursday15, settings)).toBeNull();
	});

	it('does not move tasks with unknown importance', () => {
		expect(reevaluate(task({ important: undefined }), friday16, settings)).toBeNull();
	});

	it('ignores tasks without date, done or deleted', () => {
		expect(reevaluate(task({ dueAt: undefined }), friday16, settings)).toBeNull();
		expect(reevaluate(task({ status: 'done' }), friday16, settings)).toBeNull();
		expect(reevaluate(task({ deletedAt: '2026-10-10T00:00:00Z' }), friday16, settings)).toBeNull();
	});

	it('moves back out of Hacer when the date is pushed later', () => {
		const t = task({ quadrant: 'do', dueAt: new Date(2026, 10, 30, 18).toISOString() });
		expect(reevaluate(t, friday16, settings)).toBe('schedule');
	});

	it('keeps an urgent answered Delegar where it is while urgency does not change', () => {
		const t = task({
			quadrant: 'delegate',
			quadrantSource: 'answer',
			important: false,
			dueAt: new Date(2026, 9, 16, 18).toISOString(),
			decision: decision({ quadrant: null, ask: 'delegable', delegable: { p: 0.4 } })
		});
		expect(reevaluate(t, friday16, settings)).toBeNull();
	});
});

describe('reevaluateAll', () => {
	it('returns only the moves', () => {
		const moves = reevaluateAll([task(), task({ id: 't2', quadrantSource: 'user' })], friday16, settings);
		expect(moves).toEqual([{ id: 't1', from: 'schedule', to: 'do' }]);
	});
});
