import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QadrantDB } from '$lib/db/schema';
import { createRepositories, type Repositories } from '$lib/db/repositories';
import { MemorySync } from '../../../tests/support/memory-sync';
import type { SyncApi } from './api';
import { createSyncEngine, SyncError, type SyncEngine } from './engine';

const T0 = new Date('2026-10-01T08:00:00Z');
const T1 = new Date('2026-10-02T08:00:00Z');
const T2 = new Date('2026-10-03T08:00:00Z');
const T3 = new Date('2026-10-04T08:00:00Z');

function memoryApi(server: MemorySync): SyncApi {
	return {
		info: async () => ({ version: server.apiVersion, syncId: server.syncId }),
		push: async (items) => server.push(structuredClone(items)),
		pull: async (since) => structuredClone(server.pull(since, 2))
	};
}

interface Device {
	db: QadrantDB;
	repos: Repositories;
	engine: SyncEngine;
	afterPull: ReturnType<typeof vi.fn>;
}

let server: MemorySync;
let devices: Device[];

function device(api: SyncApi = memoryApi(server)): Device {
	const db = new QadrantDB(`device-${crypto.randomUUID()}`);
	const afterPull = vi.fn(async () => {});
	const d = { db, repos: createRepositories(db), engine: createSyncEngine(db, api, { afterPull }), afterPull };
	devices.push(d);
	return d;
}

function newTask(title: string) {
	return { title, rawInput: title, quadrant: 'do' as const, quadrantSource: 'ai' as const, status: 'open' as const };
}

beforeEach(() => {
	server = new MemorySync();
	devices = [];
});

afterEach(async () => {
	for (const d of devices) await d.db.delete();
});

describe('sync cycle', () => {
	it('carries a new task to the other device', async () => {
		const phone = device();
		const laptop = device();
		const task = await phone.repos.tasks.create(newTask('Llamar al taller'), T0);
		await phone.engine.cycle();
		expect(await phone.db.outbox.count()).toBe(0);
		await laptop.engine.cycle();
		expect(await laptop.repos.tasks.get(task.id)).toEqual(task);
		expect(laptop.afterPull).toHaveBeenCalled();
		// What arrived from the server is not uploaded again.
		expect(await laptop.db.outbox.count()).toBe(0);
	});

	it('keeps both offline edits of the same task', async () => {
		const phone = device();
		const laptop = device();
		const task = await phone.repos.tasks.create(newTask('Llamar al taller'), T0);
		await phone.engine.cycle();
		await laptop.engine.cycle();

		await phone.repos.tasks.complete(task.id, T1);
		await laptop.repos.tasks.update(task.id, { notes: 'Pedir presupuesto' }, T2);
		await phone.engine.cycle();
		await laptop.engine.cycle(); // rejected first, merged and uploaded again
		await phone.engine.cycle();

		for (const d of [phone, laptop]) {
			expect(await d.db.tasks.get(task.id)).toMatchObject({ status: 'done', doneAt: T1.toISOString(), notes: 'Pedir presupuesto', updatedAt: T2.toISOString() });
		}
		expect(await laptop.db.outbox.count()).toBe(0);
	});

	it('lets a deletion win over a later edit', async () => {
		const phone = device();
		const laptop = device();
		const task = await phone.repos.tasks.create(newTask('Llamar al taller'), T0);
		await phone.engine.cycle();
		await laptop.engine.cycle();
		await phone.repos.tasks.remove(task.id, T1);
		await laptop.repos.tasks.update(task.id, { title: 'Llamar al taller mañana' }, T2);
		await phone.engine.cycle();
		await laptop.engine.cycle();
		await phone.engine.cycle();
		expect(await phone.repos.tasks.get(task.id)).toBeUndefined();
		expect(await laptop.repos.tasks.get(task.id)).toBeUndefined();
	});

	it('shares urgency and hours but not theme, language or thresholds', async () => {
		const phone = device();
		const laptop = device();
		await phone.repos.settings.update({ urgencyDays: 4, workHours: { start: '08:00', end: '15:00' }, theme: 'dark', thresholds: { low: 0.2, high: 0.8 } }, T1);
		await laptop.repos.settings.update({ language: 'es' }, T0);
		await phone.engine.cycle();
		await laptop.engine.cycle();
		const settings = await laptop.repos.settings.get();
		expect(settings).toMatchObject({ urgencyDays: 4, workHours: { start: '08:00', end: '15:00' }, theme: 'system', language: 'es', thresholds: { low: 0.35, high: 0.65 } });
		const content = JSON.parse([...server.records.values()].find((r) => r.collection === 'settings')!.content);
		expect(Object.keys(content.record).sort()).toEqual(['createdAt', 'holidays', 'id', 'updatedAt', 'urgencyDays', 'workDays', 'workHours']);
	});

	it('a new device takes the settings on the server instead of its defaults', async () => {
		const phone = device();
		await phone.repos.settings.update({ urgencyDays: 1 }, T1);
		await phone.engine.cycle();
		const tablet = device();
		await tablet.repos.settings.get(T3);
		await tablet.engine.cycle();
		await phone.engine.cycle();
		expect((await tablet.repos.settings.get()).urgencyDays).toBe(1);
		expect((await phone.repos.settings.get()).urgencyDays).toBe(1);
	});

	it('uploads deleted goals and people so the deletion reaches the others', async () => {
		const phone = device();
		const laptop = device();
		const goal = await phone.repos.goals.add('Ventas Q4', T0);
		await phone.engine.cycle();
		await laptop.engine.cycle();
		expect((await laptop.repos.goals.listActive()).map((g) => g.id)).toEqual([goal.id]);
		await laptop.repos.goals.remove(goal.id, T1);
		await laptop.engine.cycle();
		await phone.engine.cycle();
		expect(await phone.repos.goals.listActive()).toEqual([]);
	});

	it('pulls in pages and moves its cursor to the newest version', async () => {
		const phone = device();
		const laptop = device();
		for (const title of ['a', 'b', 'c', 'd', 'e']) await phone.repos.tasks.create(newTask(title), T0);
		await phone.engine.cycle();
		await laptop.engine.cycle();
		expect(await laptop.db.tasks.count()).toBe(5);
		expect((await laptop.db.syncState.get('sync'))?.cursor).toBe(5);
	});

	it('keeps in the outbox a change made while uploading', async () => {
		const base = memoryApi(server);
		let phone!: Device;
		let taskId = '';
		const api: SyncApi = {
			...base,
			push: async (items) => {
				const response = await base.push(items);
				if (server.version === 1) await phone.repos.tasks.update(taskId, { notes: 'durante la subida' }, T2);
				return response;
			}
		};
		phone = device(api);
		taskId = (await phone.repos.tasks.create(newTask('Llamar'), T0)).id;
		await phone.engine.cycle({ rounds: 1 });
		// The second upload of the cycle carries the change made during the first one.
		expect(server.version).toBe(2);
		expect(JSON.parse(server.records.get(`tasks:${taskId}`)!.content).record.notes).toBe('durante la subida');
		expect(await phone.db.outbox.count()).toBe(0);
	});

	it('refuses a server without sync and says so', async () => {
		server.apiVersion = 1;
		const phone = device();
		await expect(phone.engine.cycle()).rejects.toEqual(new SyncError('unsupported'));
	});

	it('uploads everything again when the server data was emptied', async () => {
		const phone = device();
		const task = await phone.repos.tasks.create(newTask('Llamar'), T0);
		await phone.engine.cycle();
		server.reset();
		await phone.engine.cycle();
		expect(server.records.get(`tasks:${task.id}`)).toBeDefined();
		const laptop = device();
		await laptop.engine.cycle();
		expect(await laptop.repos.tasks.get(task.id)).toBeDefined();
	});

	it('enable() queues every record, deleted ones too, and starts from scratch', async () => {
		const phone = device();
		const kept = await phone.repos.tasks.create(newTask('a'), T0);
		const gone = await phone.repos.tasks.create(newTask('b'), T0);
		await phone.repos.tasks.remove(gone.id, T1);
		await phone.engine.cycle();
		await phone.db.outbox.clear();
		await phone.engine.enable();
		expect((await phone.db.outbox.toArray()).map((e) => e.id).sort()).toEqual([kept.id, gone.id].sort());
		expect(await phone.db.syncState.get('sync')).toBeUndefined();
	});

	it('skips content it cannot read', async () => {
		server.push([{ collection: 'tasks', id: 'x', baseVersion: 0, content: 'not json' }]);
		const phone = device();
		await phone.engine.cycle();
		expect(await phone.db.tasks.count()).toBe(0);
		expect((await phone.db.syncState.get('sync'))?.cursor).toBe(1);
	});

	it('tells which tasks changed here because of another device', async () => {
		const phone = device();
		const arrived: string[][] = [];
		const db = new QadrantDB(`device-${crypto.randomUUID()}`);
		const laptop = { db, repos: createRepositories(db), engine: createSyncEngine(db, memoryApi(server), { onArrived: (ids) => arrived.push(ids) }) };
		devices.push({ ...laptop, afterPull: vi.fn() });
		const a = await phone.repos.tasks.create(newTask('a'), T0);
		const b = await phone.repos.tasks.create(newTask('b'), T0);
		await phone.engine.cycle();
		await laptop.engine.cycle();
		expect(arrived.at(-1)?.sort()).toEqual([a.id, b.id].sort());

		// Only what really changed; goals and own uploads do not count.
		await phone.repos.tasks.complete(a.id, T1);
		await phone.repos.goals.add('Ventas', T1);
		await phone.engine.cycle();
		await laptop.repos.tasks.update(b.id, { notes: 'aquí' }, T1);
		await laptop.engine.cycle();
		expect(arrived.at(-1)).toEqual([a.id]);
		const calls = arrived.length;
		await laptop.engine.cycle();
		expect(arrived.length).toBe(calls);
	});

	it('pending() counts the changes still to upload', async () => {
		const phone = device();
		await phone.repos.tasks.create(newTask('a'), T0);
		await phone.repos.tasks.create(newTask('b'), T0);
		expect(await phone.engine.pending()).toBe(2);
	});
});
