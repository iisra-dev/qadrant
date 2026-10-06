/// <reference lib="webworker" />
// The engine worker: rules always, the embedding model when it is on the device
// (docs/03). Inference never runs on the main thread (CLAUDE.md).
import { goalSimilarities, importanceFeatures, classifyWithModel, type LoadedModel } from './model/classify-model';
import { canTrain, trainLogistic } from './model/logistic';
import { totalBytes, MODEL_BASE, RUNTIME_BASE, type ModelManifest, type RuntimeManifest } from './model/manifest';
import { hasWebGpu, openSession, type Session } from './model/runtime';
import { download, fetchJson, removeAll, storedManifests } from './model/storage';
import type { Backend, EngineEvent, EngineRequest, EngineStatus } from './protocol';
import { classifyWithRules } from './rules-classifier';
import type { LabeledTask } from '$lib/domain/learning';
import type { Goal } from '$lib/domain/types';

/** Default calibration if a manifest comes without one (fitted in phase 0). */
const DEFAULT_CALIBRATION = { a: 14.4653277175699, b: -3.784506404687903 };

let status: EngineStatus = { model: 'checking', engine: 'rules' };
let session: Session | null = null;
let loaded: LoadedModel | null = null;
let blocked: Backend[] = [];
let busy = false;
let examples: LabeledTask[] = [];
let goals: Goal[] = [];
let trainRun = 0;

function post(event: EngineEvent) {
	self.postMessage(event);
}

function setStatus(next: Partial<EngineStatus>) {
	status = { ...status, ...next };
	if (status.model !== 'downloading') delete status.progress;
	if (status.model !== 'error') delete status.error;
	post({ type: 'status', status });
}

function onWifi(): boolean {
	const connection = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } }).connection;
	if (!connection) return true; // unknown (Safari): the user chose to download
	if (connection.saveData) return false;
	return connection.type === undefined || connection.type === 'wifi' || connection.type === 'ethernet';
}

async function remote(): Promise<{ model: ModelManifest; runtime: RuntimeManifest } | null> {
	const [model, runtime] = await Promise.all([
		fetchJson<ModelManifest>(`${MODEL_BASE}manifest.json`),
		fetchJson<RuntimeManifest>(`${RUNTIME_BASE}wasm-parts.json`)
	]);
	return model && runtime ? { model, runtime } : null;
}

async function load(model: ModelManifest, runtime: RuntimeManifest): Promise<void> {
	const order: Backend[] = (await hasWebGpu()) ? ['webgpu', 'wasm'] : ['wasm'];
	for (const backend of order.filter((b) => !blocked.includes(b))) {
		try {
			post({ type: 'loading', backend });
			const next = await openSession(model, runtime, backend);
			post({ type: 'loaded' });
			await session?.release();
			session = next;
			loaded = {
				engine: backend === 'webgpu' ? 'model-webgpu' : 'model-wasm',
				version: model.version,
				embed: next.embed,
				calibration: model.calibration?.importance ?? DEFAULT_CALIBRATION
			};
			setStatus({ model: 'ready', engine: loaded.engine, version: model.version, sizeBytes: totalBytes(model, runtime) });
			void train();
			return;
		} catch (error) {
			post({ type: 'loaded' });
			console.warn(`engine: ${backend} failed`, error);
		}
	}
	// No backend works here: the files stay, the app classifies with rules.
	setStatus({ model: 'ready', engine: 'rules', version: model.version, sizeBytes: totalBytes(model, runtime) });
}

async function fetchAndLoad(found: { model: ModelManifest; runtime: RuntimeManifest }) {
	const total = totalBytes(found.model, found.runtime);
	setStatus({ model: 'downloading', progress: 0, sizeBytes: total, version: found.model.version });
	await download(found.model, found.runtime, (bytes) => setStatus({ model: 'downloading', progress: bytes / total }));
	await load(found.model, found.runtime);
}

async function guarded(task: () => Promise<void>) {
	if (busy) return;
	busy = true;
	try {
		await task();
	} catch (error) {
		setStatus({ model: 'error', error: error instanceof Error ? error.message : String(error) });
	} finally {
		busy = false;
	}
}

async function start(autoDownload: boolean, wifiOnly: boolean) {
	await guarded(async () => {
		const stored = await storedManifests();
		if (stored) await load(stored.model, stored.runtime);
		const found = await remote();
		if (!found) {
			if (!stored) setStatus({ model: 'unavailable' });
			return;
		}
		const current = stored?.model.version === found.model.version && stored.runtime.version === found.runtime.version;
		if (current) return;
		// A first download or an update: on its own only if the user wants it and the connection allows it.
		if (autoDownload && (!wifiOnly || onWifi())) await fetchAndLoad(found);
		else if (!stored) setStatus({ model: 'absent', sizeBytes: totalBytes(found.model, found.runtime), version: found.model.version });
	});
}

/** Learns importance and delegability from the user's labels (docs/03, step 6). */
async function train() {
	const model = loaded;
	if (!model) return;
	const run = ++trainRun;
	const importanceSet = examples.filter((e) => e.important !== undefined);
	const delegableSet = examples.filter((e) => e.delegable !== undefined);
	const ctx = { goals } as Parameters<typeof goalSimilarities>[2];

	let importance: LoadedModel['importance'];
	if (canTrain(importanceSet.map((e) => e.important!))) {
		const xs: number[][] = [];
		for (const example of importanceSet) {
			const vector = await model.embed(example.title);
			const sims = await goalSimilarities(model, vector, ctx);
			xs.push(importanceFeatures(vector, Math.max(0, ...sims.map((s) => s.similarity))));
			if (run !== trainRun) return; // newer labels arrived
		}
		importance = trainLogistic(xs, importanceSet.map((e) => e.important!));
	}
	let delegable: LoadedModel['delegable'];
	if (canTrain(delegableSet.map((e) => e.delegable!))) {
		const xs: Float32Array[] = [];
		for (const example of delegableSet) {
			xs.push(await model.embed(example.title));
			if (run !== trainRun) return;
		}
		delegable = trainLogistic(xs, delegableSet.map((e) => e.delegable!));
	}
	if (loaded === model) loaded = { ...model, importance, delegable };
}

self.onmessage = async (event: MessageEvent<EngineRequest>) => {
	const request = event.data;
	switch (request.type) {
		case 'classify': {
			try {
				const decision = loaded
					? await classifyWithModel(request.text, request.ctx, loaded)
					: classifyWithRules(request.text, request.ctx);
				post({ type: 'decision', id: request.id, decision });
			} catch (error) {
				post({ type: 'error', id: request.id, message: String(error) });
			}
			break;
		}
		case 'start':
			blocked = request.blocked;
			await start(request.autoDownload, request.wifiOnly);
			break;
		case 'download':
			await guarded(async () => {
				const found = await remote();
				if (!found) {
					setStatus({ model: 'unavailable' });
					return;
				}
				await fetchAndLoad(found);
			});
			break;
		case 'remove':
			await session?.release();
			session = null;
			loaded = null;
			await removeAll();
			setStatus({ model: (await remote()) ? 'absent' : 'unavailable', engine: 'rules' });
			break;
		case 'train':
			examples = request.examples;
			goals = request.goals;
			await train();
			break;
	}
};
