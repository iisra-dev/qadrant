import { describe, expect, it } from 'vitest';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import { syncStatusLine } from './status';

const now = new Date('2026-10-07T10:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe('syncStatusLine', () => {
	it('says how long ago it synced', () => {
		expect(syncStatusLine(es.server, { lastSyncAt: ago(20_000) }, 0, now, 'es')).toBe('Sincronizado ahora mismo.');
		expect(syncStatusLine(es.server, { lastSyncAt: ago(60_000) }, 0, now, 'es')).toBe('Sincronizado hace 1 min.');
		expect(syncStatusLine(en.server, { lastSyncAt: ago(3 * 3600_000) }, 0, now, 'en')).toBe('Synced 3 hours ago.');
		expect(syncStatusLine(es.server, { lastSyncAt: '2026-10-01T08:00:00Z' }, 0, now, 'es')).toMatch(/^Sincronizado el /);
		expect(syncStatusLine(es.server, undefined, 0, now, 'es')).toBe('Todavía sin sincronizar.');
	});

	it('counts what is waiting and says when there is no connection', () => {
		expect(syncStatusLine(es.server, { lastSyncAt: ago(60_000), lastError: 'offline' }, 3, now, 'es')).toBe('3 cambios pendientes, sin conexión.');
		expect(syncStatusLine(en.server, { lastSyncAt: ago(60_000) }, 1, now, 'en')).toBe('Synced 1 min ago. 1 change pending.');
	});

	it('explains a server without sync and other failures', () => {
		expect(syncStatusLine(es.server, { lastError: 'unsupported' }, 0, now, 'es')).toMatch(/no sincroniza\. Actualízalo/);
		expect(syncStatusLine(en.server, { lastError: 'unauthorized' }, 0, now, 'en')).toMatch(/access key/);
		expect(syncStatusLine(en.server, { lastError: 'failed' }, 0, now, 'en')).toBe('Could not sync; it will try again.');
	});
});
