import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportData, exportFileName, ImportError, importData } from './backup';
import { createRepositories, type Repositories } from './repositories';
import { CuadranteDB } from './schema';

const NOW = new Date('2026-10-02T08:00:00Z');
const LATER = new Date('2026-10-03T08:00:00Z');

let a: CuadranteDB;
let b: CuadranteDB;
let ra: Repositories;
let rb: Repositories;

beforeEach(async () => {
	a = new CuadranteDB(`a-${crypto.randomUUID()}`);
	b = new CuadranteDB(`b-${crypto.randomUUID()}`);
	ra = createRepositories(a);
	rb = createRepositories(b);
});

afterEach(async () => {
	await a.delete();
	await b.delete();
});

function task(title: string) {
	return { title, rawInput: title, quadrant: 'do' as const, quadrantSource: 'ai' as const, status: 'open' as const };
}

describe('exportData', () => {
	it('exports every table and leaves out device-local settings', async () => {
		await ra.tasks.create(task('Uno'), NOW);
		await ra.goals.add('Ventas Q4', NOW);
		await ra.people.add('Ana', [], NOW);
		await ra.settings.update({ theme: 'dark', onboardingDone: true, server: { url: 'https://x', token: 't' }, urgencyDays: 3 }, NOW);
		const file = await exportData(a, NOW);
		expect(file.version).toBe(1);
		expect(file.exportedAt).toBe(NOW.toISOString());
		expect(file.tasks).toHaveLength(1);
		expect(file.goals).toHaveLength(1);
		expect(file.people).toHaveLength(1);
		expect(file.settings.urgencyDays).toBe(3);
		for (const key of ['theme', 'model', 'server', 'onboardingDone']) expect(file.settings).not.toHaveProperty(key);
		expect(JSON.parse(JSON.stringify(file))).toEqual(file);
	});

	it('names the file by date', () => {
		expect(exportFileName(new Date(2026, 9, 2))).toBe('cuadrante-2026-10-02.json');
	});
});

describe('importData', () => {
	it('merges by id keeping the newest updatedAt', async () => {
		const shared = await ra.tasks.create(task('Original'), NOW);
		await b.tasks.add({ ...shared, title: 'Newer in B', updatedAt: LATER.toISOString() });
		const onlyInA = await ra.tasks.create(task('Only in A'), NOW);
		const result = await importData(JSON.parse(JSON.stringify(await exportData(a, NOW))), b);
		expect(result).toMatchObject({ added: 1, updated: 0, unchanged: 1 });
		expect((await rb.tasks.get(shared.id))?.title).toBe('Newer in B');
		expect((await rb.tasks.get(onlyInA.id))?.title).toBe('Only in A');

		await ra.tasks.update(shared.id, { title: 'Newest in A' }, new Date('2026-10-04T08:00:00Z'));
		const second = await importData(await exportData(a, NOW), b);
		expect(second.updated).toBe(1);
		expect((await rb.tasks.get(shared.id))?.title).toBe('Newest in A');
	});

	it('never touches device-local settings', async () => {
		await ra.settings.update({ urgencyDays: 4 }, LATER);
		await rb.settings.update({ theme: 'dark', onboardingDone: true, model: { state: 'absent', wifiOnly: false } }, NOW);
		const file = await exportData(a, LATER);
		// A file that claims the model is ready must not make it ready here.
		const tampered = { ...file, settings: { ...file.settings, model: { state: 'ready', wifiOnly: true }, theme: 'light' } };
		const result = await importData(tampered, b);
		expect(result.settingsUpdated).toBe(true);
		const settings = await rb.settings.get();
		expect(settings.urgencyDays).toBe(4);
		expect(settings.theme).toBe('dark');
		expect(settings.onboardingDone).toBe(true);
		expect(settings.model).toEqual({ state: 'absent', wifiOnly: false });
	});

	it('rejects other versions and damaged files', async () => {
		await expect(importData({ version: 2 }, b)).rejects.toThrow(ImportError);
		await expect(importData('nope', b)).rejects.toThrow(ImportError);
		await expect(importData({ version: 1, tasks: [{}], goals: [], people: [], corrections: [] }, b)).rejects.toThrow(
			'El fichero está dañado.'
		);
		expect(await b.tasks.count()).toBe(0);
	});
});
