import { db } from '$lib/db/schema';
import { serverApi, type ServerConfig } from '$lib/ownserver/client';
import { httpSyncApi } from './api';
import { createSyncEngine, startOver } from './engine';
import { startSyncRunner } from './runner';

/** Keeps this device in sync with the own server until the returned function is called. */
export function startDeviceSync(server: ServerConfig, afterPull: () => Promise<void>): () => void {
	const engine = createSyncEngine(db, httpSyncApi(server), { afterPull });
	return startSyncRunner({ db, engine, openEvents: (signal) => serverApi.syncEvents(server, signal) });
}

/** Turning sync on: everything goes up again and everything comes down (docs/04). */
export function prepareSync(): Promise<void> {
	return startOver(db);
}

/** One cycle now, for joining from the welcome: throws if it cannot sync. */
export function syncOnce(server: ServerConfig, afterPull: () => Promise<void>): Promise<void> {
	return createSyncEngine(db, httpSyncApi(server), { afterPull }).cycle();
}

export { SyncError } from './engine';
export { SYNC_API_VERSION } from './api';
