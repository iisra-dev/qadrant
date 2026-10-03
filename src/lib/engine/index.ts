import type { ClassifyContext, Decision } from '$lib/domain/types';
import { EngineClient } from './client';

// The only engine entry point the UI and the domain know (CLAUDE.md, "Motor aislado").
const engine = new EngineClient(() =>
	typeof Worker === 'undefined'
		? null
		: (new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as never)
);

export function classify(text: string, ctx: ClassifyContext): Promise<Decision> {
	return engine.classify(text, ctx);
}

/** For a capture field: resolves to null when the text changed before the answer arrived. */
export function latestClassifier() {
	return engine.latest();
}

export type { ClassifyContext, Decision };
