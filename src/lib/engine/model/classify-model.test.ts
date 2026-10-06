import { describe, expect, it } from 'vitest';
import { defaultSettings } from '$lib/db/defaults';
import type { ClassifyContext, Goal, Person } from '$lib/domain/types';
import { classifyWithModel, type LoadedModel } from './classify-model';
import type { LogisticModel } from './logistic';

// A fake embedding: each text maps to a fixed unit vector in 2D.
const VECTORS: Record<string, [number, number]> = {
	'Ventas Q4': [1, 0],
	'Mandar la oferta a [CLIENTE]': [1, 0], // same direction as the goal: similarity 1
	'Mirar cursos de inglés': [0, 1], // orthogonal: similarity 0
	'Revisar el contrato': [Math.SQRT1_2, Math.SQRT1_2], // similarity 0.707
	'Que Ana reserve la sala': [0, 1]
};

function model(over: Partial<LoadedModel> = {}): LoadedModel {
	return {
		engine: 'model-wasm',
		version: 'v1',
		calibration: { a: 14.4653, b: -3.7845 },
		embed: async (text) => new Float32Array(VECTORS[text] ?? [0, 1]),
		...over
	};
}

const goal: Goal = { id: 'g1', createdAt: '', updatedAt: '', title: 'Ventas Q4', summary: 'Ventas Q4', active: true, order: 0 };
const ana: Person = { id: 'p-ana', createdAt: '', updatedAt: '', name: 'Ana', aliases: [] };
const ctx = (over: Partial<ClassifyContext> = {}): ClassifyContext => ({
	now: new Date(2026, 9, 2, 10, 0), // Friday 2 Oct 2026
	goals: [goal],
	people: [ana],
	settings: defaultSettings(),
	...over
});

describe('classifyWithModel', () => {
	it('importance from the best goal similarity and the default calibration', async () => {
		const d = await classifyWithModel('El lunes a primera hora mandar la oferta a [CLIENTE]', ctx(), model());
		expect(d.importance.p).toBeGreaterThan(0.99);
		expect(d.importance.matchedGoalId).toBe('g1');
		expect(d.urgent.value).toBe(true);
		expect(d.quadrant).toBe('do');
		expect(d.engine).toBe('model-wasm');
		expect(d.modelVersion).toBe('v1');
	});

	it('low similarity without a date goes to Eliminar, with no matched goal', async () => {
		const d = await classifyWithModel('Mirar cursos de inglés', ctx(), model());
		expect(d.importance.p).toBeCloseTo(0.0222, 3);
		expect(d.importance.matchedGoalId).toBeUndefined();
		expect(d.quadrant).toBe('eliminate');
	});

	it('the middle zone asks about importance', async () => {
		// s = 0.707 -> p = sigmoid(14.4653 * 0.707 - 3.7845) ≈ 0.9985: high. Use a flatter calibration.
		const d = await classifyWithModel('Revisar el contrato', ctx(), model({ calibration: { a: 1, b: -0.6 } }));
		expect(d.importance.p).toBeCloseTo(0.527, 2);
		expect(d.quadrant).toBeNull();
		expect(d.ask).toBe('importance');
	});

	it('without goals and without a learned classifier, importance is unknown', async () => {
		const d = await classifyWithModel('Mirar cursos de inglés', ctx({ goals: [] }), model());
		expect(d.importance.p).toBeNull();
		expect(d.ask).toBe('importance');
	});

	it('a learned importance classifier replaces the calibration', async () => {
		// Weights over [x, y, best similarity]: y counts as important.
		const importance: LogisticModel = { weights: [0, 10, 0], bias: -5 };
		const d = await classifyWithModel('Mirar cursos de inglés', ctx(), model({ importance }));
		expect(d.importance.p).toBeGreaterThan(0.99);
		expect(d.quadrant).toBe('schedule');
	});

	it('delegability only when urgent, not assigned and not important', async () => {
		const delegable: LogisticModel = { weights: [0, 10], bias: -5 };
		const urgentLow = await classifyWithModel('Mirar cursos de inglés hoy', ctx(), model({ delegable }));
		expect(urgentLow.delegable.p).toBeGreaterThan(0.99);
		expect(urgentLow.quadrant).toBe('delegate');

		const notUrgent = await classifyWithModel('Mirar cursos de inglés', ctx(), model({ delegable }));
		expect(notUrgent.delegable.p).toBeNull();

		const assigned = await classifyWithModel('Que Ana reserve la sala para el martes', ctx(), model({ delegable }));
		expect(assigned.delegable.p).toBeNull();
		expect(assigned.delegable.personId).toBe('p-ana');
		expect(assigned.quadrant).toBe('delegate');
	});
});
