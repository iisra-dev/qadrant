import type { ChangedAt } from './merge';

/** The collections that travel to the own server (docs/04). */
export type SyncCollection = 'tasks' | 'goals' | 'people' | 'corrections' | 'settings';

export const SYNC_COLLECTIONS: readonly SyncCollection[] = ['tasks', 'goals', 'people', 'corrections', 'settings'];

/** One per synced record. */
export interface SyncMeta {
	key: string; // `${collection}:${id}`
	changedAt: ChangedAt; // automatic moves keep the old time
	version: number; // server version this copy is based on; 0 = never uploaded
}

/** Changed here, not uploaded yet. `rev` tells a change made during an upload from the one uploaded. */
export interface OutboxEntry {
	key: string;
	collection: SyncCollection;
	id: string;
	rev: string;
}

/** Highest server version already pulled. */
export interface SyncState {
	id: 'sync';
	cursor: number;
	lastSyncAt?: string;
}

export function syncKey(collection: SyncCollection, id: string): string {
	return `${collection}:${id}`;
}
