import { serverApi, type ServerConfig, type ServerInfo } from '$lib/ownserver/client';
import type { SyncCollection } from './types';

/** API version from which a server syncs (server/sync.go). */
export const SYNC_API_VERSION = 2;

/** One record uploaded: the server version it started from and its opaque content. */
export interface PushItem {
	collection: SyncCollection;
	id: string;
	baseVersion: number;
	content: string;
}

/** Not ok: the server had another version; it comes with its content (none if the server has no copy). */
export interface PushResult {
	collection: SyncCollection;
	id: string;
	ok: boolean;
	version: number;
	content?: string;
}

export interface PushResponse {
	results: PushResult[];
	version: number;
}

export interface SyncRecord {
	collection: SyncCollection;
	id: string;
	version: number;
	content: string;
}

export interface PullPage {
	records: SyncRecord[];
	version: number;
	more: boolean;
}

/** What the sync engine needs from the server; tests use one in memory. */
export interface SyncApi {
	info(): Promise<ServerInfo>;
	push(items: PushItem[]): Promise<PushResponse>;
	pull(since: number): Promise<PullPage>;
}

export function httpSyncApi(config: ServerConfig): SyncApi {
	return {
		info: () => serverApi.ping(config),
		push: (items) => serverApi.syncPush(config, items),
		pull: (since) => serverApi.syncPull(config, since)
	};
}
