import type { Base } from '$lib/domain/types';
import type { QadrantDB } from '$lib/db/schema';
import { SYNCED_SETTINGS, type ChangedAt } from './merge';
import { syncKey, type SyncCollection } from './types';

/** Never merged field by field: they belong to the record as a whole. */
const UNTRACKED = new Set(['id', 'createdAt', 'updatedAt']);

/** The fields that travel for a collection; undefined = all of them. */
export function trackedFields(collection: SyncCollection): readonly string[] | undefined {
	return collection === 'settings' ? SYNCED_SETTINGS : undefined;
}

function same(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

/** Top-level fields whose value differs; a missing field and an undefined one are the same. */
export function changedFields(before: Base | undefined, after: Base, fields?: readonly string[]): string[] {
	const a = (before ?? {}) as Record<string, unknown>;
	const b = after as unknown as Record<string, unknown>;
	const keys = fields ?? [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => !UNTRACKED.has(key));
	return keys.filter((key) => !same(a[key], b[key]));
}

/**
 * Field times for a record that has none yet (made before schema v3, or never
 * changed since): its updatedAt for every field (docs/04). Settings that were
 * never changed get none, so a new device takes the ones on the server.
 */
export function baseline(collection: SyncCollection, record: Base): ChangedAt {
	if (collection === 'settings' && record.updatedAt === record.createdAt) return {};
	const values = record as unknown as Record<string, unknown>;
	const keys = trackedFields(collection) ?? Object.keys(values).filter((key) => !UNTRACKED.has(key));
	const changedAt: ChangedAt = {};
	for (const key of keys) if (values[key] !== undefined) changedAt[key] = record.updatedAt;
	return changedAt;
}

/** A copy of the record with the changes applied; undefined removes a field. */
export function patch<T extends Base>(record: T, changes: Partial<T>): T {
	const next: Record<string, unknown> = { ...(record as unknown as Record<string, unknown>), ...changes };
	for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
	return next as T;
}

/**
 * Notes which fields changed and when, and queues the record for upload.
 * Call it inside the transaction that writes the record, with syncMeta and
 * outbox in its scope. Automatic changes (the passage of time) do not call it.
 */
export async function noteChange(
	db: QadrantDB,
	collection: SyncCollection,
	before: Base | undefined,
	after: Base,
	time: string
): Promise<void> {
	const fields = changedFields(before, after, trackedFields(collection));
	if (!fields.length) return;
	const key = syncKey(collection, after.id);
	const meta = await db.syncMeta.get(key);
	const changedAt = { ...(meta?.changedAt ?? (before ? baseline(collection, before) : {})) };
	for (const field of fields) changedAt[field] = time;
	await db.syncMeta.put({ key, changedAt, version: meta?.version ?? 0 });
	await db.outbox.put({ key, collection, id: after.id, rev: crypto.randomUUID() });
}
