import { liveQuery } from 'dexie';
import type { QadrantDB } from '$lib/db/schema';
import { ServerError } from '$lib/ownserver/client';
import { SyncError, type SyncEngine } from './engine';
import { readVersions } from './events';
import type { SyncState } from './types';

export interface RunnerDelays {
	/** After a local change (docs/02: 1 s). */
	local: number;
	/** First wait after a failed cycle; doubles up to maxRetry. */
	retry: number;
	maxRetry: number;
	/** First wait before reopening the change stream; doubles up to maxReconnect. */
	reconnect: number;
	maxReconnect: number;
}

const DEFAULT_DELAYS: RunnerDelays = { local: 1000, retry: 2000, maxRetry: 5 * 60_000, reconnect: 1000, maxReconnect: 60_000 };

/** A stream open this long counts as healthy: the next reconnection waits the least again. */
const HEALTHY_STREAM_MS = 30_000;

export interface RunnerOptions {
	db: QadrantDB;
	engine: Pick<SyncEngine, 'cycle'>;
	openEvents: (signal: AbortSignal) => Promise<Response>;
	/** Where 'online' and 'visibilitychange' arrive; window and document by default. */
	target?: EventTarget;
	visible?: () => boolean;
	delays?: Partial<RunnerDelays>;
	/** Told when a cycle starts and ends, for the indicator. */
	onBusy?: (busy: boolean) => void;
}

function errorCode(error: unknown): NonNullable<SyncState['lastError']> {
	if (error instanceof SyncError) return 'unsupported';
	if (error instanceof ServerError) {
		if (error.code === 'unreachable') return 'offline';
		if (error.code === 'unauthorized') return 'unauthorized';
	}
	return 'failed';
}

/**
 * Keeps this device in sync while it runs (docs/02): a cycle on start, on
 * coming back online or to the foreground, on each server announcement and
 * shortly after each local change; retries with growing waits. Only the
 * leading tab runs it. Returns a function that stops everything.
 */
export function startSyncRunner({ db, engine, openEvents, target, visible, delays, onBusy }: RunnerOptions): () => void {
	const wait = { ...DEFAULT_DELAYS, ...delays };
	const isVisible = visible ?? (() => document.visibilityState === 'visible');
	const controller = new AbortController();
	const { signal } = controller;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let running = false;
	let again = false;
	let retry = wait.retry;

	async function note(lastError: SyncState['lastError']) {
		await db.transaction('rw', db.syncState, async () => {
			const current = await db.syncState.get('sync');
			if (current?.lastError === lastError) return;
			const next: SyncState = { ...current, id: 'sync', cursor: current?.cursor ?? 0 };
			if (lastError) next.lastError = lastError;
			else delete next.lastError;
			await db.syncState.put(next);
		});
	}

	function schedule(delay: number) {
		if (signal.aborted) return;
		clearTimeout(timer);
		timer = setTimeout(run, delay);
	}

	async function run() {
		if (signal.aborted) return;
		if (running) {
			again = true;
			return;
		}
		running = true;
		onBusy?.(true);
		try {
			await engine.cycle();
			retry = wait.retry;
			await note(undefined);
		} catch (error) {
			const code = errorCode(error);
			await note(code).catch(() => {});
			// A server without sync or a wrong key will not fix itself: wait for the next trigger.
			if (code === 'offline' || code === 'failed') {
				schedule(retry);
				retry = Math.min(retry * 2, wait.maxRetry);
			}
		} finally {
			running = false;
			onBusy?.(false);
			if (again) {
				again = false;
				schedule(0);
			}
		}
	}

	// Server announcements. The stream is read with fetch and reopened with growing waits.
	let streamAbort: AbortController | undefined;
	let streaming = false;
	async function stream() {
		if (streaming) return;
		streaming = true;
		let pause = wait.reconnect;
		try {
			while (!signal.aborted) {
				streamAbort = new AbortController();
				const onStop = () => streamAbort?.abort();
				signal.addEventListener('abort', onStop);
				const opened = Date.now();
				try {
					const response = await openEvents(streamAbort.signal);
					if (response.body) {
						await readVersions(response.body, (version) => {
							void db.syncState.get('sync').then((state) => {
								if (version > (state?.cursor ?? 0)) schedule(0);
							});
						});
					}
				} catch {
					// Offline, server down or aborted: wait and try again.
				} finally {
					signal.removeEventListener('abort', onStop);
				}
				if (signal.aborted) return;
				pause = Date.now() - opened >= HEALTHY_STREAM_MS ? wait.reconnect : pause;
				await new Promise((resolve) => setTimeout(resolve, pause));
				pause = Math.min(pause * 2, wait.maxReconnect);
				// iOS pauses web apps in the background: reconnect when back.
				while (!signal.aborted && !isVisible()) await new Promise((resolve) => setTimeout(resolve, wait.reconnect));
			}
		} finally {
			streaming = false;
		}
	}

	const onOnline = () => schedule(0);
	const onVisibility = () => {
		if (!isVisible()) return;
		schedule(0);
		void stream();
	};
	const online = target ?? window;
	const visibility = target ?? document;
	online.addEventListener('online', onOnline);
	visibility.addEventListener('visibilitychange', onVisibility);

	// Local changes land in the outbox: a cycle shortly after each one.
	let first = true;
	const outbox = liveQuery(() => db.outbox.toArray()).subscribe({
		next(entries) {
			if (first) {
				first = false;
				return;
			}
			if (entries.length) schedule(wait.local);
		},
		error: () => {}
	});

	schedule(0);
	void stream();

	return () => {
		controller.abort();
		clearTimeout(timer);
		outbox.unsubscribe();
		online.removeEventListener('online', onOnline);
		visibility.removeEventListener('visibilitychange', onVisibility);
	};
}
