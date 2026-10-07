import type { Base } from '$lib/domain/types';

/** Top-level field -> ISO time of its last change by the user (docs/04). */
export type ChangedAt = Record<string, string>;

/** What travels for each record: the record and when each of its fields changed. */
export interface SyncCopy<T extends Base = Base> {
	record: T;
	changedAt: ChangedAt;
}

/** The settings that travel; thresholds and device-local fields stay on each device (docs/04). */
export const SYNCED_SETTINGS = ['urgencyDays', 'workHours', 'workDays', 'holidays'] as const;

/** Handled apart from the field-by-field rule. */
const BASE_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'deletedAt']);

function later(a: string | undefined, b: string | undefined): string | undefined {
	if (a === undefined) return b;
	if (b === undefined) return a;
	return a > b ? a : b;
}

function earlier(a: string | undefined, b: string | undefined): string | undefined {
	if (a === undefined) return b;
	if (b === undefined) return a;
	return a < b ? a : b;
}

/**
 * Field-by-field merge (docs/02, "Sincronización"). Each field keeps its
 * newest change and, at the same time, the server's. A deletion wins over any
 * edit, and updatedAt is the newest of the two copies. With `fields`, only
 * those merge and everything else stays as it is here (settings).
 */
export function mergeCopies<T extends Base>(
	local: SyncCopy<T>,
	server: SyncCopy<T>,
	fields?: readonly string[]
): SyncCopy<T> {
	const keys = fields ?? [
		...new Set([...Object.keys(local.record), ...Object.keys(server.record), ...Object.keys(local.changedAt), ...Object.keys(server.changedAt)])
	].filter((key) => !BASE_FIELDS.has(key));

	const record: Record<string, unknown> = { ...(local.record as unknown as Record<string, unknown>) };
	const changedAt: ChangedAt = { ...local.changedAt };
	const localRecord = local.record as unknown as Record<string, unknown>;
	const serverRecord = server.record as unknown as Record<string, unknown>;

	for (const key of keys) {
		const localTime = local.changedAt[key] ?? '';
		const serverTime = server.changedAt[key] ?? '';
		const source = localTime > serverTime ? localRecord : serverRecord;
		if (key in source && source[key] !== undefined) record[key] = structuredClone(source[key]);
		else delete record[key];
		const time = later(local.changedAt[key], server.changedAt[key]);
		if (time !== undefined) changedAt[key] = time;
	}

	record.createdAt = earlier(local.record.createdAt, server.record.createdAt);
	record.updatedAt = later(local.record.updatedAt, server.record.updatedAt);
	const deletedAt = earlier(local.record.deletedAt, server.record.deletedAt);
	if (deletedAt) {
		record.deletedAt = deletedAt;
		changedAt.deletedAt = later(local.changedAt.deletedAt, server.changedAt.deletedAt) ?? deletedAt;
	}
	return { record: record as T, changedAt };
}
