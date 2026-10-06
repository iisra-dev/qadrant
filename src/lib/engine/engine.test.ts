import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '$lib/db/defaults';
import type { ClassifyContext, Person } from '$lib/domain/types';
import { EngineClient, type WorkerLike } from './client';
import type { ClassifyRequest, ClassifyResponse } from './protocol';
import { classifyWithRules } from './rules-classifier';

const ana: Person = { id: 'p-ana', createdAt: '', updatedAt: '', name: 'Ana', aliases: [] };
const luis: Person = { id: 'p-luis', createdAt: '', updatedAt: '', name: 'Luis', aliases: [] };
const ctx: ClassifyContext = {
	now: new Date(2026, 9, 2, 10, 0),
	goals: [],
	people: [ana, luis],
	settings: defaultSettings()
};

describe('classifyWithRules (docs/03, "Modo solo reglas")', () => {
	it('urgent assignment -> delegate', () => {
		const d = classifyWithRules('Que Ana reserve la sala para el martes', ctx);
		expect(d).toMatchObject({ quadrant: 'delegate', engine: 'rules', delegable: { p: null, personId: 'p-ana' } });
		expect(d.ask).toBeUndefined();
	});

	it('non-urgent assignment -> delegate', () => {
		expect(classifyWithRules('Pedirle a Luis que compre material de oficina', ctx).quadrant).toBe('delegate');
	});

	it('urgent without assignment -> do, without asking', () => {
		const d = classifyWithRules('Llamar al taller hoy, media hora', ctx);
		expect(d).toMatchObject({ quadrant: 'do', title: 'Llamar al taller', durationMin: 30 });
		expect(d.ask).toBeUndefined();
		expect(d.urgent).toMatchObject({ value: true, reason: 'due-soon' });
	});

	it('not urgent without assignment -> ask importance', () => {
		const d = classifyWithRules('Mirar cursos de inglés', ctx);
		expect(d).toMatchObject({ quadrant: null, ask: 'importance', importance: { p: null } });
		expect(d.urgent).toEqual({ value: false, reason: 'no-date' });
	});
});

/** A worker that answers when told to, in any order. */
class FakeWorker implements WorkerLike {
	requests: ClassifyRequest[] = [];
	private listeners: { message: ((e: MessageEvent<ClassifyResponse>) => void)[]; error: ((e: Event) => void)[] } = {
		message: [],
		error: []
	};
	terminated = false;

	postMessage(message: ClassifyRequest) {
		this.requests.push(message);
	}
	addEventListener(type: 'message' | 'error', listener: never) {
		this.listeners[type].push(listener);
	}
	terminate() {
		this.terminated = true;
	}
	answer(index: number, title = this.requests[index].text) {
		const request = this.requests[index];
		const decision = { ...classifyWithRules(request.text, request.ctx), title };
		for (const l of this.listeners.message) l({ data: { type: 'decision', id: request.id, decision } } as never);
	}
	fail() {
		for (const l of this.listeners.error) l(new Event('error'));
	}
}

describe('EngineClient', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('sends the request to the worker and resolves with its decision', async () => {
		const worker = new FakeWorker();
		const client = new EngineClient(() => worker);
		const promise = client.classify('Mirar cursos de inglés', ctx);
		expect(worker.requests).toHaveLength(1);
		expect(worker.requests[0].ctx.now).toBeInstanceOf(Date);
		worker.answer(0, 'from worker');
		expect((await promise).title).toBe('from worker');
	});

	it('discards answers for text that has changed', async () => {
		const worker = new FakeWorker();
		const classify = new EngineClient(() => worker).latest();
		const first = classify('Mirar', ctx);
		const second = classify('Mirar cursos', ctx);
		worker.answer(1);
		worker.answer(0);
		expect(await first).toBeNull();
		expect((await second)?.title).toBe('Mirar cursos');
	});

	it('falls back to rules on the main thread without a worker', async () => {
		const client = new EngineClient(() => null);
		expect((await client.classify('Mirar cursos de inglés', ctx)).engine).toBe('rules');
	});

	it('falls back to rules when the worker is too slow', async () => {
		vi.useFakeTimers();
		const worker = new FakeWorker();
		const client = new EngineClient(() => worker, 1500);
		const promise = client.classify('Llamar al taller hoy', ctx);
		vi.advanceTimersByTime(1500);
		expect((await promise).quadrant).toBe('do');
	});

	it('falls back to rules and restarts the worker after an error', async () => {
		const workers: FakeWorker[] = [];
		const client = new EngineClient(() => {
			workers.push(new FakeWorker());
			return workers.at(-1)!;
		});
		const promise = client.classify('Llamar al taller hoy', ctx);
		workers[0].fail();
		expect((await promise).quadrant).toBe('do');
		expect(workers[0].terminated).toBe(true);
		void client.classify('Otra', ctx);
		expect(workers).toHaveLength(2);
	});
});

/** In-memory stand-in for localStorage. */
function memoryStorage() {
	const map = new Map<string, string>();
	return {
		map,
		getItem: (k: string) => map.get(k) ?? null,
		setItem: (k: string, v: string) => void map.set(k, v),
		removeItem: (k: string) => void map.delete(k)
	};
}

/** A worker that records every message and lets the test emit events. */
class EventWorker implements WorkerLike {
	sent: unknown[] = [];
	private listeners: ((e: MessageEvent) => void)[] = [];
	postMessage(message: unknown) {
		this.sent.push(message);
	}
	addEventListener(type: 'message' | 'error', listener: never) {
		if (type === 'message') this.listeners.push(listener);
	}
	terminate() {}
	emit(data: unknown) {
		for (const l of this.listeners) l({ data } as MessageEvent);
	}
}

describe('EngineClient crash guard and status', () => {
	it('a backend that was loading when the tab closed is blocked from then on', () => {
		const storage = memoryStorage();
		const first = new EventWorker();
		const client = new EngineClient(() => first, 1500, storage);
		client.start({ autoDownload: true, wifiOnly: true });
		expect(first.sent[0]).toMatchObject({ type: 'start', blocked: [] });
		first.emit({ type: 'loading', backend: 'wasm' });
		// The tab dies here: no 'loaded'. Next start, on a fresh page.
		const second = new EventWorker();
		new EngineClient(() => second, 1500, storage).start({ autoDownload: true, wifiOnly: true });
		expect(second.sent[0]).toMatchObject({ type: 'start', blocked: ['wasm'] });
	});

	it('a backend that finished loading is not blocked', () => {
		const storage = memoryStorage();
		const worker = new EventWorker();
		const client = new EngineClient(() => worker, 1500, storage);
		client.start({ autoDownload: false, wifiOnly: true });
		worker.emit({ type: 'loading', backend: 'webgpu' });
		worker.emit({ type: 'loaded' });
		expect(client.blockedBackends()).toEqual([]);
	});

	it('removing the model clears the blocked list', () => {
		const storage = memoryStorage();
		storage.setItem('qadrant.engineBlocked', '["wasm"]');
		const client = new EngineClient(() => new EventWorker(), 1500, storage);
		client.remove();
		expect(client.blockedBackends()).toEqual([]);
	});

	it('passes status events to listeners', () => {
		const worker = new EventWorker();
		const client = new EngineClient(() => worker, 1500, memoryStorage());
		const seen: string[] = [];
		client.onStatus((status) => seen.push(status.model));
		client.start({ autoDownload: false, wifiOnly: true });
		worker.emit({ type: 'status', status: { model: 'downloading', progress: 0.5, engine: 'rules' } });
		expect(seen).toEqual(['downloading']);
	});
});
