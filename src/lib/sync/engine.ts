import type { Table } from 'dexie';
import type { Base } from '$lib/domain/types';
import { defaultSettings } from '$lib/db/defaults';
import type { QadrantDB } from '$lib/db/schema';
import { SYNC_API_VERSION, type PushItem, type SyncApi, type SyncRecord } from './api';
import { mergeCopies, type SyncCopy } from './merge';
import { baseline, trackedFields } from './track';
import { SYNC_COLLECTIONS, syncKey, type OutboxEntry, type SyncCollection } from './types';

export type SyncErrorCode = 'unsupported';

/** The interface turns the code into a message in its language. */
export class SyncError extends Error {
	constructor(readonly code: SyncErrorCode) {
		super(code);
	}
}

const PUSH_BATCH = 200;
const PUSH_ROUNDS = 5;

export interface SyncEngineOptions {
	/**
	 * Runs after each download that changed something: the passage of time
	 * (docs/02). It runs inside the download's transaction, so Dexie only.
	 */
	afterPull?: () => Promise<void>;
	/** Tasks whose content changed here because of another device, to tint them on screen. */
	onArrived?: (taskIds: string[]) => void;
	now?: () => Date;
}

/**
 * The sync cycle (docs/02): upload what changed here, download what changed
 * elsewhere and merge field by field. Screens update through liveQuery.
 */
export function createSyncEngine(db: QadrantDB, api: SyncApi, options: SyncEngineOptions = {}) {
	const now = options.now ?? (() => new Date());
	let arrived = new Set<string>();
	const tables = [db.tasks, db.goals, db.people, db.corrections, db.settings, db.syncMeta, db.outbox, db.syncState];

	function table(collection: SyncCollection): Table<Base, string> {
		return db[collection] as unknown as Table<Base, string>;
	}

	/** What travels for a record: settings without the fields that stay on the device. */
	function shareable(collection: SyncCollection, copy: SyncCopy): SyncCopy {
		const fields = trackedFields(collection);
		if (!fields) return copy;
		const source = copy.record as unknown as Record<string, unknown>;
		const record: Record<string, unknown> = { id: source.id, createdAt: source.createdAt, updatedAt: source.updatedAt };
		const changedAt: Record<string, string> = {};
		for (const field of fields) {
			if (source[field] !== undefined) record[field] = source[field];
			if (copy.changedAt[field]) changedAt[field] = copy.changedAt[field];
		}
		return { record: record as unknown as Base, changedAt };
	}

	async function localCopy(collection: SyncCollection, id: string): Promise<SyncCopy | undefined> {
		const record = await table(collection).get(id);
		if (!record) return undefined;
		const meta = await db.syncMeta.get(syncKey(collection, id));
		return { record, changedAt: meta?.changedAt ?? baseline(collection, record) };
	}

	function parse(content: string): SyncCopy | undefined {
		try {
			const copy = JSON.parse(content) as SyncCopy;
			if (typeof copy?.record?.id !== 'string' || typeof copy.changedAt !== 'object' || copy.changedAt === null) return undefined;
			return copy;
		} catch {
			return undefined;
		}
	}

	/** Merges a server copy into this device. Call it inside a transaction over `tables`. */
	async function applyRemote(collection: SyncCollection, id: string, remote: SyncCopy, version: number): Promise<void> {
		let local = await localCopy(collection, id);
		if (!local && collection === 'settings') {
			// Defaults never chosen by the user: whatever the server has wins.
			local = { record: defaultSettings(now()), changedAt: {} };
		}
		const merged = local ? mergeCopies(local, remote, trackedFields(collection)) : remote;
		if (collection === 'tasks' && JSON.stringify(local?.record) !== JSON.stringify(merged.record)) arrived.add(id);
		await table(collection).put(merged.record);
		await db.syncMeta.put({ key: syncKey(collection, id), changedAt: merged.changedAt, version });
	}

	async function push(rounds: number): Promise<void> {
		for (let round = 0; round < rounds; round++) {
			const entries = (await db.outbox.toArray()).slice(0, PUSH_BATCH);
			if (!entries.length) return;
			const sent: { entry: OutboxEntry; item: PushItem }[] = [];
			const missing: string[] = [];
			for (const entry of entries) {
				const copy = await localCopy(entry.collection, entry.id);
				if (!copy) {
					missing.push(entry.key);
					continue;
				}
				const meta = await db.syncMeta.get(entry.key);
				const content = JSON.stringify(shareable(entry.collection, copy));
				sent.push({ entry, item: { collection: entry.collection, id: entry.id, baseVersion: meta?.version ?? 0, content } });
			}
			if (missing.length) await db.outbox.bulkDelete(missing);
			if (!sent.length) continue;

			const response = await api.push(sent.map((s) => s.item));
			await db.transaction('rw', tables, async () => {
				for (const [index, result] of response.results.entries()) {
					const { entry } = sent[index];
					if (result.ok) {
						const meta = await db.syncMeta.get(entry.key);
						await db.syncMeta.put({ key: entry.key, changedAt: meta?.changedAt ?? {}, version: result.version });
						// A change made during the upload keeps the record queued.
						const current = await db.outbox.get(entry.key);
						if (current?.rev === entry.rev) await db.outbox.delete(entry.key);
						continue;
					}
					const remote = result.content ? parse(result.content) : undefined;
					if (remote) await applyRemote(entry.collection, entry.id, remote, result.version);
					else {
						const meta = await db.syncMeta.get(entry.key);
						await db.syncMeta.put({ key: entry.key, changedAt: meta?.changedAt ?? {}, version: result.version });
					}
				}
			});
		}
	}

	/**
	 * Downloads every page first and then applies them all, with the passage
	 * of time, in one transaction: open screens change once, not page by page.
	 * afterPull must only touch Dexie (no network, no timers) or the
	 * transaction would close under it.
	 */
	async function pull(): Promise<void> {
		const state = await db.syncState.get('sync');
		const since = state?.cursor ?? 0;
		let cursor = since;
		const records: SyncRecord[] = [];
		for (;;) {
			const page = await api.pull(cursor);
			records.push(...page.records);
			for (const record of page.records) cursor = Math.max(cursor, record.version);
			if (!page.more) {
				cursor = Math.max(cursor, page.version);
				break;
			}
		}
		await db.transaction('rw', tables, async () => {
			let changed = false;
			for (const record of records) {
				if (!SYNC_COLLECTIONS.includes(record.collection)) continue;
				const meta = await db.syncMeta.get(syncKey(record.collection, record.id));
				if (meta && meta.version >= record.version) continue; // our own upload
				const remote = parse(record.content);
				if (!remote || remote.record.id !== record.id) continue;
				await applyRemote(record.collection, record.id, remote, record.version);
				changed = true;
			}
			const current = await db.syncState.get('sync');
			await db.syncState.put({ ...current, id: 'sync', cursor });
			if (changed) await options.afterPull?.();
		});
	}

	return {
		/** One cycle: check the server, upload, download and merge. Throws when offline. */
		async cycle({ rounds = PUSH_ROUNDS }: { rounds?: number } = {}): Promise<void> {
			arrived = new Set();
			const info = await api.info();
			if (info.version < SYNC_API_VERSION || !info.syncId) throw new SyncError('unsupported');
			const state = await db.syncState.get('sync');
			if (state?.syncId !== info.syncId) await startOver(db, info.syncId);
			await push(rounds);
			await pull();
			// Records merged during the download that still differ from the server go up now.
			await push(rounds);
			const done = await db.syncState.get('sync');
			await db.syncState.put({ ...done, id: 'sync', cursor: done?.cursor ?? 0, lastSyncAt: now().toISOString(), syncId: info.syncId });
			if (arrived.size) options.onArrived?.([...arrived]);
		},
		/** Turning sync on: everything goes up again and the next cycle downloads everything. */
		enable: () => startOver(db),
		pending: () => db.outbox.count()
	};
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;

/**
 * Starts over (docs/04): every record enters the outbox and everything is
 * downloaded again. On turning sync on and when the server's data changed
 * identity (emptied, or another server).
 */
export async function startOver(db: QadrantDB, syncId?: string): Promise<void> {
	const collections = SYNC_COLLECTIONS.map((collection) => db[collection] as unknown as Table<Base, string>);
	await db.transaction('rw', [...collections, db.syncMeta, db.outbox, db.syncState], async () => {
		for (const meta of await db.syncMeta.toArray()) await db.syncMeta.put({ ...meta, version: 0 });
		for (const [index, collection] of SYNC_COLLECTIONS.entries()) {
			const records = await collections[index].toArray();
			await db.outbox.bulkPut(
				records.map((record) => ({ key: syncKey(collection, record.id), collection, id: record.id, rev: crypto.randomUUID() }))
			);
		}
		await db.syncState.clear();
		if (syncId !== undefined) await db.syncState.put({ id: 'sync', cursor: 0, syncId });
	});
}
