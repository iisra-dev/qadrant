import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QadrantDB } from '$lib/db/schema';
import { createRepositories } from '$lib/db/repositories';
import { ServerError } from '$lib/ownserver/client';
import { SyncError } from './engine';
import { startSyncRunner } from './runner';

let db: QadrantDB;
let stops: (() => void)[];

beforeEach(async () => {
	db = new QadrantDB(`runner-${crypto.randomUUID()}`);
	await db.open();
	stops = [];
});

afterEach(async () => {
	for (const stop of stops) stop();
	await db.delete();
});

const quick = { local: 20, retry: 20, maxRetry: 40, reconnect: 20, maxReconnect: 40 };

/** A stream that stays open until aborted, after sending the given versions. */
function events(versions: number[][]) {
	let call = 0;
	return vi.fn(async (signal: AbortSignal) => {
		const list = versions[Math.min(call++, versions.length - 1)];
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				for (const v of list) controller.enqueue(new TextEncoder().encode(`event: version\ndata: {"version":${v}}\n\n`));
				signal.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
			}
		});
		return new Response(body);
	});
}

function start(cycle: () => Promise<void>, openEvents = events([[]])) {
	const target = new EventTarget();
	const stop = startSyncRunner({ db, engine: { cycle }, openEvents, target, visible: () => true, delays: quick });
	stops.push(stop);
	return { target, stop, openEvents };
}

describe('sync runner', () => {
	it('runs a cycle on start and clears the last error', async () => {
		await db.syncState.put({ id: 'sync', cursor: 0, lastError: 'offline' });
		const cycle = vi.fn(async () => {});
		start(cycle);
		await vi.waitFor(() => expect(cycle).toHaveBeenCalled());
		await vi.waitFor(async () => expect((await db.syncState.get('sync'))?.lastError).toBeUndefined());
	});

	it('runs again shortly after a local change', async () => {
		const cycle = vi.fn(async () => {});
		start(cycle);
		await vi.waitFor(() => expect(cycle).toHaveBeenCalledTimes(1));
		await createRepositories(db).tasks.create({ title: 'a', rawInput: 'a', quadrant: 'do', quadrantSource: 'ai', status: 'open' });
		await vi.waitFor(() => expect(cycle.mock.calls.length).toBeGreaterThanOrEqual(2));
	});

	it('runs when the server announces a newer version, not an older one', async () => {
		await db.syncState.put({ id: 'sync', cursor: 5 });
		const cycle = vi.fn(async () => {});
		start(cycle, events([[5, 7]]));
		await vi.waitFor(() => expect(cycle.mock.calls.length).toBeGreaterThanOrEqual(2));
	});

	it('reconnects the stream when it ends', async () => {
		const openEvents = vi.fn(async () => new Response('event: version\ndata: {"version":0}\n\n'));
		start(vi.fn(async () => {}), openEvents);
		await vi.waitFor(() => expect(openEvents.mock.calls.length).toBeGreaterThanOrEqual(3));
	});

	it('notes why it failed and retries while offline', async () => {
		const cycle = vi.fn(async () => {
			throw new ServerError('unreachable');
		});
		start(cycle);
		await vi.waitFor(async () => expect((await db.syncState.get('sync'))?.lastError).toBe('offline'));
		await vi.waitFor(() => expect(cycle.mock.calls.length).toBeGreaterThanOrEqual(3));
	});

	it('says when the server does not sync and does not insist', async () => {
		const cycle = vi.fn(async () => {
			throw new SyncError('unsupported');
		});
		start(cycle);
		await vi.waitFor(async () => expect((await db.syncState.get('sync'))?.lastError).toBe('unsupported'));
		await new Promise((resolve) => setTimeout(resolve, 150));
		expect(cycle).toHaveBeenCalledTimes(1);
	});

	it('runs on coming back online and stops when asked', async () => {
		const cycle = vi.fn(async () => {});
		const { target, stop } = start(cycle);
		await vi.waitFor(() => expect(cycle).toHaveBeenCalledTimes(1));
		target.dispatchEvent(new Event('online'));
		await vi.waitFor(() => expect(cycle).toHaveBeenCalledTimes(2));
		stop();
		target.dispatchEvent(new Event('online'));
		await new Promise((resolve) => setTimeout(resolve, 60));
		expect(cycle).toHaveBeenCalledTimes(2);
	});
});
