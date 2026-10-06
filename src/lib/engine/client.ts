import type { LabeledTask } from '$lib/domain/learning';
import type { ClassifyContext, Decision, Goal } from '$lib/domain/types';
import type { Backend, EngineEvent, EngineRequest, EngineStatus } from './protocol';
import { classifyWithRules } from './rules-classifier';

/** The subset of Worker the client needs, so tests can pass a fake. */
export interface WorkerLike {
	postMessage(message: EngineRequest): void;
	addEventListener(type: 'message', listener: (event: MessageEvent<EngineEvent>) => void): void;
	addEventListener(type: 'error', listener: (event: Event) => void): void;
	terminate(): void;
}

/** Where the crash guard keeps its two keys (localStorage in the app). */
export interface GuardStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

/** Maximum time per classification before falling back to rules (docs/03). */
export const LOCAL_TIMEOUT_MS = 1500;

const LOADING_KEY = 'qadrant.engineLoading';
const BLOCKED_KEY = 'qadrant.engineBlocked';

function safeStorage(): GuardStorage | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}

export class EngineClient {
	private worker: WorkerLike | null = null;
	private nextId = 1;
	private pending = new Map<number, (decision: Decision | null) => void>();
	private statusListeners: ((status: EngineStatus) => void)[] = [];

	constructor(
		private readonly createWorker: () => WorkerLike | null,
		private readonly timeoutMs = LOCAL_TIMEOUT_MS,
		private readonly guard: GuardStorage | null = safeStorage()
	) {}

	private ensureWorker(): WorkerLike | null {
		if (this.worker) return this.worker;
		try {
			this.worker = this.createWorker();
		} catch {
			this.worker = null;
		}
		if (!this.worker) return null;
		this.worker.addEventListener('message', (event) => this.onEvent(event.data));
		this.worker.addEventListener('error', () => {
			// A broken worker: answer everything pending with rules and start over next time.
			for (const resolve of this.pending.values()) resolve(null);
			this.pending.clear();
			this.worker?.terminate();
			this.worker = null;
		});
		return this.worker;
	}

	private onEvent(event: EngineEvent) {
		switch (event.type) {
			case 'decision':
			case 'error': {
				const resolve = this.pending.get(event.id);
				if (!resolve) return;
				this.pending.delete(event.id);
				resolve(event.type === 'decision' ? event.decision : null);
				break;
			}
			case 'status':
				for (const listener of this.statusListeners) listener(event.status);
				break;
			case 'loading':
				this.guard?.setItem(LOADING_KEY, event.backend);
				break;
			case 'loaded':
				this.guard?.removeItem(LOADING_KEY);
				break;
		}
	}

	/**
	 * Backends that must not be tried again on this device. If the tab was
	 * closed while a session was being created (an iPhone out of memory reloads
	 * the page, docs/07), that backend goes on the list instead of crashing again.
	 */
	blockedBackends(): Backend[] {
		const blocked = new Set<Backend>(JSON.parse(this.guard?.getItem(BLOCKED_KEY) ?? '[]') as Backend[]);
		const crashed = this.guard?.getItem(LOADING_KEY) as Backend | null | undefined;
		if (crashed) {
			blocked.add(crashed);
			this.guard?.setItem(BLOCKED_KEY, JSON.stringify([...blocked]));
			this.guard?.removeItem(LOADING_KEY);
		}
		return [...blocked];
	}

	onStatus(listener: (status: EngineStatus) => void): () => void {
		this.statusListeners.push(listener);
		return () => (this.statusListeners = this.statusListeners.filter((l) => l !== listener));
	}

	/** Opens the model in the background when the app starts (docs/03), downloading it if allowed. */
	start(options: { autoDownload: boolean; wifiOnly: boolean }): void {
		this.ensureWorker()?.postMessage({ type: 'start', blocked: this.blockedBackends(), ...options });
	}

	/** Downloads now, whatever the connection: the user asked for it. */
	download(): void {
		this.ensureWorker()?.postMessage({ type: 'download' });
	}

	/** Deletes the model from the device; the app goes on with rules. */
	remove(): void {
		this.guard?.removeItem(BLOCKED_KEY);
		this.guard?.removeItem(LOADING_KEY);
		this.ensureWorker()?.postMessage({ type: 'remove' });
	}

	/** The user's labels, for the classifiers learned on the device. */
	train(examples: LabeledTask[], goals: Goal[]): void {
		this.worker?.postMessage({ type: 'train', examples, goals: JSON.parse(JSON.stringify(goals)) });
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
