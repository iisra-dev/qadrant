import type { ClassifyContext, Decision } from '$lib/domain/types';
import type { ClassifyRequest, ClassifyResponse } from './protocol';
import { classifyWithRules } from './rules-classifier';

/** The subset of Worker the client needs, so tests can pass a fake. */
export interface WorkerLike {
	postMessage(message: ClassifyRequest): void;
	addEventListener(type: 'message', listener: (event: MessageEvent<ClassifyResponse>) => void): void;
	addEventListener(type: 'error', listener: (event: Event) => void): void;
	terminate(): void;
}

/** Maximum time per classification before falling back to rules (docs/03). */
export const LOCAL_TIMEOUT_MS = 1500;

export class EngineClient {
	private worker: WorkerLike | null = null;
	private nextId = 1;
	private pending = new Map<number, (decision: Decision | null) => void>();

	constructor(
		private readonly createWorker: () => WorkerLike | null,
		private readonly timeoutMs = LOCAL_TIMEOUT_MS
	) {}

	private ensureWorker(): WorkerLike | null {
		if (this.worker) return this.worker;
		try {
			this.worker = this.createWorker();
		} catch {
			this.worker = null;
		}
		if (!this.worker) return null;
		this.worker.addEventListener('message', (event) => {
			const response = event.data;
			const resolve = this.pending.get(response.id);
			if (!resolve) return;
			this.pending.delete(response.id);
			resolve(response.type === 'decision' ? response.decision : null);
		});
		this.worker.addEventListener('error', () => {
			// A broken worker: answer everything pending with rules and start over next time.
			for (const resolve of this.pending.values()) resolve(null);
			this.pending.clear();
			this.worker?.terminate();
			this.worker = null;
		});
		return this.worker;
	}

	/**
	 * The engine's public API. Never rejects: if the worker is missing, fails
	 * or is too slow, the task is classified with rules.
	 */
	classify(text: string, ctx: ClassifyContext): Promise<Decision> {
		const worker = this.ensureWorker();
		if (!worker) return Promise.resolve(classifyWithRules(text, ctx));

		const id = this.nextId++;
		return new Promise<Decision>((resolve) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				resolve(classifyWithRules(text, ctx));
			}, this.timeoutMs);
			this.pending.set(id, (decision) => {
				clearTimeout(timer);
				resolve(decision ?? classifyWithRules(text, ctx));
			});
			worker.postMessage({ type: 'classify', id, text, ctx: cloneable(ctx) });
		});
	}

	/**
	 * A classifier for one input field: each call gets a request number and
	 * resolves to null when a newer call has been made since (the text changed).
	 */
	latest(): (text: string, ctx: ClassifyContext) => Promise<Decision | null> {
		let current = 0;
		return async (text, ctx) => {
			const request = ++current;
			const decision = await this.classify(text, ctx);
			return request === current ? decision : null;
		};
	}

	dispose(): void {
		this.worker?.terminate();
		this.worker = null;
		for (const resolve of this.pending.values()) resolve(null);
		this.pending.clear();
	}
}

/** Plain copy that survives structured clone (Svelte state proxies do not). */
function cloneable(ctx: ClassifyContext): ClassifyContext {
	return {
		now: new Date(ctx.now.getTime()),
		goals: JSON.parse(JSON.stringify(ctx.goals)),
		people: JSON.parse(JSON.stringify(ctx.people)),
		settings: JSON.parse(JSON.stringify(ctx.settings))
	};
}
