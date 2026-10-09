import { QadrantDB } from './schema';

/** Where the tasks live: the browser storage, or only this tab's memory when the browser blocks it. */
export type StorageMode = 'disk' | 'memory';

/** Long enough for a slow upgrade, short enough not to leave the app blank. */
const OPEN_TIMEOUT_MS = 10_000;

/**
 * Opens the browser storage. If the browser blocks it (blocked site data, some
 * private modes) or it never answers, the app runs on an in-memory copy instead,
 * so it can still be used and exported; nothing is written to disk (docs/02, "Persistencia").
 */
export async function openStorage(
	disk: () => QadrantDB = () => new QadrantDB(),
	timeoutMs = OPEN_TIMEOUT_MS
): Promise<{ db: QadrantDB; mode: StorageMode }> {
	try {
		const db = disk();
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new Error('IndexedDB did not open in time')), timeoutMs);
		});
		try {
			await Promise.race([db.open(), timeout]);
		} finally {
			clearTimeout(timer);
		}
		return { db, mode: 'disk' };
	} catch (error) {
		console.error('IndexedDB unavailable, keeping the data in memory', error);
	}
	// Loaded only when needed: an IndexedDB written in JavaScript that lives in memory.
	const { IDBFactory, IDBKeyRange } = await import('fake-indexeddb');
	const db = new QadrantDB('qadrant', { indexedDB: new IDBFactory(), IDBKeyRange });
	await db.open();
	return { db, mode: 'memory' };
}
