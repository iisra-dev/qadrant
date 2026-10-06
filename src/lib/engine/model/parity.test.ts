// Parity (docs/06, phase 2): the app's embedding code, on ONNX Runtime Web,
// gives the same similarities and decisions as the int8 ONNX in Python on the
// phase 0 set. Catches a misconfigured tokenizer or pooling. Needs the model
// downloaded with tools/embed-eval/fetch_model.py; skipped otherwise.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmbedder } from './embedder';
import { dot, sigmoid } from './vector';

const MODEL_DIR = join(process.cwd(), 'tools', 'embed-eval', 'model');
const ONNX = join(MODEL_DIR, 'onnx', 'model_quantized.onnx');
const hasModel = existsSync(ONNX);

interface Reference {
	goals: string[];
	tasks: { title: string; similarities: number[]; p: number }[];
}

const LOW = 0.35;
const HIGH = 0.65;
const band = (p: number) => (p >= HIGH ? 'high' : p <= LOW ? 'low' : 'doubt');
/**
 * The int8 kernels of ONNX Runtime Web differ slightly from Python's (similarity
 * up to 0.027, probability up to 0.041 in phase 0), so a task right next to a
 * threshold may cross it. Only a band change further away is a real difference.
 */
const NEAR = 0.05;
const nearThreshold = (p: number) => Math.abs(p - LOW) < NEAR || Math.abs(p - HIGH) < NEAR;

describe.skipIf(!hasModel)('parity with the Python reference', () => {
	it('similarities within 0.03, probabilities within 0.05, same decisions', { timeout: 120_000 }, async () => {
		const ort = await import('onnxruntime-web');
		const transformers = await import('@huggingface/transformers');
		ort.env.wasm.numThreads = 1;
		const json = JSON.parse(readFileSync(join(MODEL_DIR, 'tokenizer.json'), 'utf8'));
		const config = JSON.parse(readFileSync(join(MODEL_DIR, 'tokenizer_config.json'), 'utf8'));
		const Tokenizer = (transformers as unknown as Record<string, typeof transformers.PreTrainedTokenizer>)[
			String(config.tokenizer_class).replace(/Fast$/, '')
		];
		const tokenizer = new Tokenizer(json, config);
		const session = await ort.InferenceSession.create(readFileSync(ONNX), { executionProviders: ['wasm'] });
		const embed = createEmbedder(session, tokenizer as never, ort.Tensor);

		const reference: Reference = JSON.parse(readFileSync(join(process.cwd(), 'tools', 'embed-eval', 'reference.json'), 'utf8'));
		const { importance } = JSON.parse(readFileSync(join(process.cwd(), 'tools', 'embed-eval', 'calibration.json'), 'utf8'));
		const goals = [];
		for (const goal of reference.goals) goals.push(await embed(goal));

		let maxDiff = 0;
		let maxPDiff = 0;
		let flipsAtHalf = 0;
		const changed: string[] = [];
		for (const task of reference.tasks) {
			const vector = await embed(task.title);
			const sims = goals.map((g) => dot(vector, g));
			sims.forEach((s, i) => (maxDiff = Math.max(maxDiff, Math.abs(s - task.similarities[i]))));
			const p = sigmoid(importance.a * Math.max(...sims) + importance.b);
			maxPDiff = Math.max(maxPDiff, Math.abs(p - task.p));
			if (p >= 0.5 !== task.p >= 0.5) flipsAtHalf++;
			if (band(p) !== band(task.p) && !nearThreshold(task.p)) changed.push(`${task.title}: ${task.p.toFixed(3)} -> ${p.toFixed(3)}`);
		}
		await session.release();
		expect(maxDiff).toBeLessThan(0.03);
		expect(maxPDiff).toBeLessThan(NEAR);
		expect(flipsAtHalf).toBe(0);
		expect(changed).toEqual([]);
	});
});
