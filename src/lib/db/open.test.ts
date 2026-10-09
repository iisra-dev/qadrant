import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { QadrantDB } from './schema';
import { openStorage } from './open';

let opened: QadrantDB[] = [];

afterEach(async () => {
	for (const db of opened) await db.delete();
	opened = [];
});

function diskThat(open: () => Promise<unknown>): () => QadrantDB {
	return () => {
		const db = new QadrantDB(`disk-${crypto.randomUUID()}`);
		db.open = open as QadrantDB['open'];
		return db;
	};
}

describe('openStorage', () => {
	it('uses the browser storage when it opens', async () => {
		const { db, mode } = await openStorage(() => new QadrantDB(`disk-${crypto.randomUUID()}`));
		opened.push(db);
		expect(mode).toBe('disk');
		expect(db.isOpen()).toBe(true);
	});

	it('keeps the data in memory when the browser storage is blocked', async () => {
		const blocked = diskThat(() => Promise.reject(new DOMException('blocked', 'SecurityError')));
		const { db, mode } = await openStorage(blocked);
		opened.push(db);
		expect(mode).toBe('memory');
		await db.settings.put({ id: 'settings' } as never);
		expect(await db.settings.get('settings')).toEqual({ id: 'settings' });
	});

	it('keeps the data in memory when the browser storage never answers', async () => {
		const hung = diskThat(() => new Promise(() => {}));
		const { db, mode } = await openStorage(hung, 10);
		opened.push(db);
		expect(mode).toBe('memory');
		expect(db.isOpen()).toBe(true);
	});
});
