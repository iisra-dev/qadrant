import type { LabeledTask } from '$lib/domain/learning';
import type { ClassifyContext, Decision, Goal } from '$lib/domain/types';
import { EngineClient } from './client';
import { engineState } from './status.svelte';

// The only engine entry point the UI and the domain know (CLAUDE.md, "Motor aislado").
const engine = new EngineClient(() =>
	typeof Worker === 'undefined'
		? null
		: (new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as never)
);
engine.onStatus((status) => (engineState.status = status));

export function classify(text: string, ctx: ClassifyContext): Promise<Decision> {
	return engine.classify(text, ctx);
}

/** For a capture field: resolves to null when the text changed before the answer arrived. */
export function latestClassifier() {
	return engine.latest();
}

/** Called once when the app starts: the session is created in the background (docs/03). */
export function startEngine(options: { autoDownload: boolean; wifiOnly: boolean }): void {
	engine.start(options);
}

export function downloadModel(): void {
	engine.download();
}

export function removeModel(): void {
	engine.remove();
}

export function teachEngine(examples: LabeledTask[], goals: Goal[]): void {
	engine.train(examples, goals);
}

export { engineState };
export type { ClassifyContext, Decision };
export type { EngineStatus } from './protocol';
