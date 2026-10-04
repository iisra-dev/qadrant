/// <reference lib="webworker" />
// One mode per worker, as the app will run inference in a worker (CLAUDE.md).
import * as ort from 'onnxruntime-web/webgpu';
import { AutoTokenizer, env } from '@huggingface/transformers';

export type Mode = 'webgpu' | 'wasm1' | 'wasmN';
export interface BenchRequest {
	mode: Mode;
	model: ArrayBuffer;
	reference: { goals: string[]; tasks: { title: string; similarities: number[]; p: number }[] };
	calibration: { importance: { a: number; b: number } };
}
export type BenchResult =
	| { mode: Mode; ok: true; median: number; p95: number; loadMs: number; maxDiff: number; flips: number; total: number; threads?: number }
	| { mode: Mode; ok: false; error: string };

const MAX_TOKENS = 128;

// Nothing from third parties: tokenizer and wasm come from our origin.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/';
ort.env.wasm.wasmPaths = '/ort/';

/** The runtime's .wasm comes in parts (Pages limit); join them and hand the binary to ONNX Runtime. */
async function loadRuntimeBinary(): Promise<void> {
	const { bytes, parts } = (await (await fetch('/ort/wasm-parts.json')).json()) as { bytes: number; parts: string[] };
	const binary = new Uint8Array(bytes);
	let offset = 0;
	for (const part of parts) {
		const data = new Uint8Array(await (await fetch(`/ort/${part}`)).arrayBuffer());
		binary.set(data, offset);
		offset += data.length;
	}
	ort.env.wasm.wasmBinary = binary.buffer;
}

function quantile(sorted: number[], q: number): number {
	const i = (sorted.length - 1) * q;
	const lo = Math.floor(i);
	const hi = Math.ceil(i);
	return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

self.onmessage = async (event: MessageEvent<BenchRequest>) => {
	const { mode, model, reference, calibration } = event.data;
	try {
		if (mode === 'webgpu' && !('gpu' in navigator)) throw new Error('sin WebGPU');
		if (mode === 'wasmN' && !crossOriginIsolated) throw new Error('sin aislamiento entre orígenes');
		const threads = mode === 'wasm1' ? 1 : Math.min(4, navigator.hardwareConcurrency || 1);
		ort.env.wasm.numThreads = mode === 'webgpu' ? 1 : threads;

		const start = performance.now();
		await loadRuntimeBinary();
		const tokenizer = await AutoTokenizer.from_pretrained('model');
		const session = await ort.InferenceSession.create(new Uint8Array(model), {
			executionProviders: [mode === 'webgpu' ? 'webgpu' : 'wasm'],
			graphOptimizationLevel: 'all'
		});
		const loadMs = performance.now() - start;

		const embed = async (text: string): Promise<Float32Array> => {
			const enc = tokenizer(text, { truncation: true, max_length: MAX_TOKENS });
			const ids = enc.input_ids as unknown as { data: BigInt64Array; dims: number[] };
			const mask = enc.attention_mask as unknown as { data: BigInt64Array; dims: number[] };
			const feeds = {
				input_ids: new ort.Tensor('int64', ids.data, ids.dims),
				attention_mask: new ort.Tensor('int64', mask.data, mask.dims),
				token_type_ids: new ort.Tensor('int64', new BigInt64Array(ids.data.length), ids.dims)
			};
			const out = (await session.run(feeds)).last_hidden_state;
			const hidden = out.data as Float32Array;
			const [, tokens, dim] = out.dims;
			const pooled = new Float32Array(dim);
			let count = 0;
			for (let t = 0; t < tokens; t++) {
				if (mask.data[t] === 0n) continue;
				count++;
				for (let d = 0; d < dim; d++) pooled[d] += hidden[t * dim + d];
			}
			let norm = 0;
			for (let d = 0; d < dim; d++) norm += (pooled[d] /= count) ** 2;
			norm = Math.sqrt(norm);
			for (let d = 0; d < dim; d++) pooled[d] /= norm;
			return pooled;
		};
		const dot = (a: Float32Array, b: Float32Array) => a.reduce((sum, v, i) => sum + v * b[i], 0);

		const goals = [];
		for (const goal of reference.goals) goals.push(await embed(goal));
		await embed('warm-up');

		const times: number[] = [];
		let maxDiff = 0;
		let flips = 0;
		const { a, b } = calibration.importance;
		for (const task of reference.tasks) {
			const t0 = performance.now();
			const vec = await embed(task.title);
			const sims = goals.map((g) => dot(vec, g));
			times.push(performance.now() - t0);
			sims.forEach((s, i) => (maxDiff = Math.max(maxDiff, Math.abs(s - task.similarities[i]))));
			// Same decision as the phase 0 reference at the 0.5 cut?
			const p = 1 / (1 + Math.exp(-(a * Math.max(...sims) + b)));
			if (p >= 0.5 !== task.p >= 0.5) flips++;
		}
		times.sort((a, b) => a - b);
		const result: BenchResult = {
			mode,
			ok: true,
			median: quantile(times, 0.5),
			p95: quantile(times, 0.95),
			loadMs,
			maxDiff,
			flips,
			total: reference.tasks.length,
			...(mode !== 'webgpu' && { threads })
		};
		self.postMessage(result);
	} catch (error) {
		self.postMessage({ mode, ok: false, error: error instanceof Error ? error.message : String(error) } satisfies BenchResult);
	}
};
