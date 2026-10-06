import { describe, expect, it } from 'vitest';
import { canTrain, MIN_LABELS, predictLogistic, trainLogistic } from './logistic';
import { dot, meanPool, sigmoid } from './vector';

describe('meanPool', () => {
	it('averages the unmasked tokens and normalizes', () => {
		// 3 tokens x 2 dims; the last token is padding.
		const hidden = new Float32Array([1, 0, 3, 0, 100, 100]);
		const pooled = meanPool(hidden, [1n, 1n, 0n], 3, 2);
		expect(Array.from(pooled)).toEqual([1, 0]);
	});

	it('gives unit vectors whose dot product is the cosine', () => {
		const a = meanPool(new Float32Array([3, 4]), [1], 1, 2);
		const b = meanPool(new Float32Array([4, 3]), [1], 1, 2);
		expect(dot(a, a)).toBeCloseTo(1, 6);
		expect(dot(a, b)).toBeCloseTo(24 / 25, 6);
	});

	it('returns zeros when every token is masked', () => {
		expect(Array.from(meanPool(new Float32Array([1, 2]), [0], 1, 2))).toEqual([0, 0]);
	});
});

describe('logistic regression', () => {
	const xs = Array.from({ length: 30 }, (_, i) => [i < 15 ? 1 : -1, (i % 5) / 10]);
	const ys = xs.map(([first]) => first > 0);

	it('learns a separable rule', () => {
		const model = trainLogistic(xs, ys);
		expect(predictLogistic(model, [1, 0.2])).toBeGreaterThan(0.9);
		expect(predictLogistic(model, [-1, 0.2])).toBeLessThan(0.1);
	});

	it('balances the classes', () => {
		const skewedX = [...Array(27).fill([1]), ...Array(3).fill([-1])];
		const skewedY = skewedX.map(([v]) => v > 0);
		const model = trainLogistic(skewedX, skewedY);
		expect(predictLogistic(model, [-1])).toBeLessThan(0.5);
	});

	it('needs 20 labels of both values', () => {
		expect(MIN_LABELS).toBe(20);
		expect(canTrain(Array(19).fill(true).concat(false))).toBe(true);
		expect(canTrain(Array(18).fill(true).concat(false))).toBe(false);
		expect(canTrain(Array(25).fill(true))).toBe(false);
	});

	it('sigmoid is the logistic function', () => {
		expect(sigmoid(0)).toBe(0.5);
		expect(sigmoid(2)).toBeCloseTo(0.8808, 4);
	});
});
