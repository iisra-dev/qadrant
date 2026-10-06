// Classification with the embedding model (docs/03, steps 6 and 7). The rules
// still read the date, duration and assignment; the model only adds the
// probabilities. ONNX stays behind `embed`, so this file is pure and testable.
import { combine } from '$lib/domain/quadrant';
import type { ClassifyContext, Decision } from '$lib/domain/types';
import { evaluateUrgency } from '$lib/domain/urgency';
import { extract } from '../rules';
import { predictLogistic, type LogisticModel } from './logistic';
import { dot, sigmoid } from './vector';

export interface Calibration {
	/** importance.p = sigmoid(a·s + b), s = best similarity to a goal. */
	a: number;
	b: number;
}

export interface LoadedModel {
	engine: 'model-webgpu' | 'model-wasm';
	version: string;
	/** Unit-length sentence embedding; caches are the caller's business. */
	embed(text: string): Promise<Float32Array>;
	calibration: Calibration;
	/** Learned from the user's labels once there are enough (step 6). */
	importance?: LogisticModel;
	delegable?: LogisticModel;
}

/** Features of the importance classifier: the embedding and the best goal similarity. */
export function importanceFeatures(vector: Float32Array, best: number): number[] {
	return [...vector, best];
}

export async function goalSimilarities(model: LoadedModel, vector: Float32Array, ctx: ClassifyContext) {
	const out: { goalId: string; similarity: number }[] = [];
	for (const goal of ctx.goals) {
		const text = (goal.summary || goal.title).trim();
		if (!text) continue;
		out.push({ goalId: goal.id, similarity: dot(vector, await model.embed(text)) });
	}
	return out;
}

export async function classifyWithModel(text: string, ctx: ClassifyContext, model: LoadedModel): Promise<Decision> {
	const extraction = extract(text, ctx);
	const urgent = evaluateUrgency(extraction.dueAt, ctx.now, ctx.settings);
	const assigned = Boolean(extraction.personId);
	const { thresholds } = ctx.settings;

	const vector = await model.embed(extraction.title);
	const sims = await goalSimilarities(model, vector, ctx);
	const best = sims.reduce<{ goalId: string; similarity: number } | null>(
		(top, s) => (!top || s.similarity > top.similarity ? s : top),
		null
	);

	// Without goals the default calibration has nothing to compare with.
	let pImportance: number | null = null;
	if (model.importance) pImportance = predictLogistic(model.importance, importanceFeatures(vector, best?.similarity ?? 0));
	else if (best) pImportance = sigmoid(model.calibration.a * best.similarity + model.calibration.b);

	// Only when it can change the result: urgent, not assigned, importance not high.
	const pDelegable =
		model.delegable && urgent.value && !assigned && (pImportance === null || pImportance < thresholds.high)
			? predictLogistic(model.delegable, vector)
			: null;

	const { quadrant, ask } = combine({ urgent: urgent.value, assigned, pImportance, pDelegable, thresholds });
	const matchedGoalId = best && pImportance !== null && pImportance >= thresholds.high ? best.goalId : undefined;
	return {
		quadrant,
		...(ask && { ask }),
		title: extraction.title,
		urgent,
		importance: { p: pImportance, ...(matchedGoalId && { matchedGoalId }) },
		delegable: { p: pDelegable, ...(extraction.personId && { personId: extraction.personId }) },
		...(extraction.durationMin && { durationMin: extraction.durationMin }),
		engine: model.engine,
		modelVersion: model.version
	};
}
