// Logistic regression trained on the device (docs/03, step 6): importance and
// delegability learned from the user's own labels. Pure TS, deterministic.
import { dot, sigmoid } from './vector';

export interface LogisticModel {
	weights: number[];
	bias: number;
}

export interface TrainOptions {
	/** L2 penalty; keeps a few hundred examples from overfitting 385 features. */
	l2?: number;
	epochs?: number;
	learningRate?: number;
}

/** Labels needed, and of both values, before a classifier replaces the defaults. */
export const MIN_LABELS = 20;

export function canTrain(labels: boolean[]): boolean {
	return labels.length >= MIN_LABELS && labels.some(Boolean) && labels.some((label) => !label);
}

/**
 * Full-batch gradient descent. Each class weighs the same in total, so a user
 * who marks most tasks as important does not get a model that always says yes.
 */
export function trainLogistic(xs: ArrayLike<number>[], ys: boolean[], options: TrainOptions = {}): LogisticModel {
	const { l2 = 0.01, epochs = 300, learningRate = 0.5 } = options;
	const n = xs.length;
	const dim = n ? xs[0].length : 0;
	const positives = ys.filter(Boolean).length;
	const weightOf = (y: boolean) => (y ? n / (2 * Math.max(1, positives)) : n / (2 * Math.max(1, n - positives)));
	const weights = new Array<number>(dim).fill(0);
	let bias = 0;
	for (let epoch = 0; epoch < epochs; epoch++) {
		const grad = new Array<number>(dim).fill(0);
		let gradBias = 0;
		for (let i = 0; i < n; i++) {
			const x = xs[i];
			const error = (sigmoid(dot(weights, x) + bias) - (ys[i] ? 1 : 0)) * weightOf(ys[i]);
			for (let d = 0; d < dim; d++) grad[d] += error * x[d];
			gradBias += error;
		}
		for (let d = 0; d < dim; d++) weights[d] -= learningRate * (grad[d] / n + l2 * weights[d]);
		bias -= learningRate * (gradBias / n);
	}
	return { weights, bias };
}

export function predictLogistic(model: LogisticModel, x: ArrayLike<number>): number {
	return sigmoid(dot(model.weights, x) + model.bias);
}
