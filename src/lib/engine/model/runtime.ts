/// <reference lib="webworker" />
// ONNX session and tokenizer inside the engine worker (docs/03, "Orden de
// respaldo"): WebGPU when the device has it, otherwise WASM. Everything comes
// from OPFS; the runtime's small .mjs glue is precached by the service worker.
import * as ort from 'onnxruntime-web/webgpu';
import * as transformers from '@huggingface/transformers';
import { createEmbedder, withCache, type Embed, type TokenizerLike } from './embedder';
import { RUNTIME_BASE, type ModelManifest, type RuntimeManifest } from './manifest';
import { readModel, readModelText, readRuntime } from './storage';

export type Backend = 'webgpu' | 'wasm';

// Nothing from third parties (CLAUDE.md, "Local-first").
transformers.env.allowRemoteModels = false;
transformers.env.allowLocalModels = false;
ort.env.wasm.wasmPaths = RUNTIME_BASE;

export async function hasWebGpu(): Promise<boolean> {
	const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
	if (!gpu) return false;
	try {
		return Boolean(await gpu.requestAdapter());
	} catch {
		return false;
	}
}

async function loadTokenizer(model: ModelManifest): Promise<TokenizerLike> {
	const json = JSON.parse(await readModelText(model, 'tokenizer.json'));
	const config = JSON.parse(await readModelText(model, 'tokenizer_config.json'));
	const name = String(config.tokenizer_class ?? '').replace(/Fast$/, '');
	const classes = transformers as unknown as Record<string, typeof transformers.PreTrainedTokenizer | undefined>;
	const Tokenizer = classes[name] ?? transformers.PreTrainedTokenizer;
	return new Tokenizer(json, config) as unknown as TokenizerLike;
}

export interface Session {
	backend: Backend;
	embed: Embed;
	release(): Promise<void>;
}

/**
 * Builds the session from the copies in OPFS. Only one session lives at a time
 * and the model bytes are dropped once it exists: on an iPhone two copies of
 * the model made iOS close the tab (docs/07).
 */
export async function openSession(model: ModelManifest, runtime: RuntimeManifest, backend: Backend): Promise<Session> {
	ort.env.wasm.wasmBinary = (await readRuntime(runtime)).buffer as ArrayBuffer;
	ort.env.wasm.numThreads = backend === 'wasm' && crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
	const tokenizer = await loadTokenizer(model);
	let bytes: Uint8Array | null = await readModel(model);
	const session = await ort.InferenceSession.create(bytes, {
		executionProviders: [backend],
		graphOptimizationLevel: 'all'
	});
	bytes = null;
	ort.env.wasm.wasmBinary = undefined;
	return {
		backend,
		embed: withCache(createEmbedder(session, tokenizer, ort.Tensor)),
		release: () => session.release()
	};
}
