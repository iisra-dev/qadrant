import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QadrantDB } from './schema';
import { createRepositories, type Repositories } from './repositories';
import { exportData, importData } from './backup';
import { createTaskActions } from '$lib/tasks/actions';
import { defaultSettings } from './defaults';

const T0 = new Date('2026-10-01T08:00:00Z');
const T1 = new Date('2026-10-02T08:00:00Z');
const T2 = new Date('2026-10-03T08:00:00Z');

let db: QadrantDB;
let repos: Repositories;

beforeEach(async () => {
	db = new QadrantDB(`tracking-${crypto.randomUUID()}`);
	await db.open();
	repos = createRepositories(db);
});

afterEach(async () => {
	await db.delete();
});

function newTask(title = 'Llamar al taller') {
	return { title, rawInput: title, quadrant: 'do' as const, quadrantSource: 'ai' as const, status: 'open' as const };
}

async function meta(key: string) {
	return db.syncMeta.get(key);
}

describe('schema v3', () => {
	it('has the sync tables, starting empty', async () => {
		expect(db.verno).toBe(3);
		expect(await db.syncMeta.count()).toBe(0);
		expect(await db.outbox.count()).toBe(0);
		expect(await db.syncState.get('sync')).toBeUndefined();
	});
});

describe('change tracking', () => {
	it('notes every field of a new record and queues it', async () => {
		const task = await repos.tasks.create(newTask(), T0);
		const m = await meta(`tasks:${task.id}`);
		expect(m?.version).toBe(0);
		expect(m?.changedAt).toMatchObject({ title: T0.toISOString(), quadrant: T0.toISOString(), status: T0.toISOString() });
		expect(m?.changedAt).not.toHaveProperty('id');
		expect(await db.outbox.get(`tasks:${task.id}`)).toMatchObject({ collection: 'tasks', id: task.id });
	});

	it('moves the time only of the fields that change, removals included', async () => {
		const task = await repos.tasks.create({ ...newTask(), dueAt: '2026-10-09T10:00:00.000Z' }, T0);
		await repos.tasks.update(task.id, { notes: 'Pedir presupuesto', dueAt: undefined }, T1);
		const m = await meta(`tasks:${task.id}`);
		expect(m?.changedAt).toMatchObject({ title: T0.toISOString(), notes: T1.toISOString(), dueAt: T1.toISOString() });
		expect(await repos.tasks.get(task.id)).not.toHaveProperty('dueAt');
	});

	it('notes completing, reopening, archiving and deleting', async () => {
		const task = await repos.tasks.create(newTask(), T0);
		await repos.tasks.complete(task.id, T1);
		expect((await meta(`tasks:${task.id}`))?.changedAt).toMatchObject({ status: T1.toISOString(), doneAt: T1.toISOString() });
		await repos.tasks.reopen(task.id, T2);
		expect((await meta(`tasks:${task.id}`))?.changedAt.doneAt).toBe(T2.toISOString());
		await repos.tasks.archive([task.id], T2);
		await repos.tasks.remove(task.id, T2);
		expect((await meta(`tasks:${task.id}`))?.changedAt.deletedAt).toBe(T2.toISOString());
	});

	it('the passage of time moves tasks without touching the times of the fields it moves', async () => {
		const actions = createTaskActions(repos);
		const settings = defaultSettings(T0);
		const task = await repos.tasks.create({ ...newTask(), quadrant: 'schedule', important: true, dueAt: '2026-10-05T10:00:00.000Z' }, T0);
		await db.outbox.clear();
		const moved = await actions.reevaluateOpenTasks(settings, new Date('2026-10-02T08:00:00Z'));
		expect(moved).toBe(1);
		expect((await repos.tasks.get(task.id))?.quadrant).toBe('do');
		expect((await meta(`tasks:${task.id}`))?.changedAt.quadrant).toBe(T0.toISOString());
		expect(await db.outbox.count()).toBe(0);
	});

	it('starts from updatedAt for records made before schema v3', async () => {
		const id = crypto.randomUUID();
		await db.tasks.add({ id, createdAt: T0.toISOString(), updatedAt: T0.toISOString(), ...newTask() });
		await repos.tasks.update(id, { notes: 'x' }, T2);
		expect((await meta(`tasks:${id}`))?.changedAt).toMatchObject({ title: T0.toISOString(), notes: T2.toISOString() });
	});

	it('tracks goals, people and corrections', async () => {
		const goal = await repos.goals.add('Terminar la tesis', T0);
		await repos.goals.rename(goal.id, 'Acabar la tesis', T1);
		expect((await meta(`goals:${goal.id}`))?.changedAt).toMatchObject({ title: T1.toISOString(), order: T0.toISOString() });
		const person = await repos.people.add('Ana', [], T0);
		await repos.people.update(person.id, { aliases: ['Anita'] }, T1);
		expect((await meta(`people:${person.id}`))?.changedAt.aliases).toBe(T1.toISOString());
		const correction = await repos.corrections.add({ taskId: 'x', from: null, to: 'do', pImportance: null, pDelegable: null, engine: 'rules' }, T0);
		expect(await db.outbox.get(`corrections:${correction.id}`)).toBeDefined();
	});
});

describe('settings tracking', () => {
	it('changes updatedAt and notes times only for the shared fields', async () => {
		await repos.settings.get(T0);
		await repos.settings.update({ theme: 'dark', language: 'es', model: { state: 'ready', wifiOnly: true } }, T1);
		expect((await repos.settings.get()).updatedAt).toBe(T0.toISOString());
		expect(await db.outbox.get('settings:settings')).toBeUndefined();
		await repos.settings.update({ thresholds: { low: 0.3, high: 0.7 } }, T1);
		expect((await repos.settings.get()).updatedAt).toBe(T0.toISOString());

		await repos.settings.update({ urgencyDays: 3 }, T2);
		expect((await repos.settings.get()).updatedAt).toBe(T2.toISOString());
		const m = await meta('settings:settings');
		expect(m?.changedAt).toEqual({ urgencyDays: T2.toISOString() });
		expect(await db.outbox.get('settings:settings')).toBeDefined();
	});

	it('the sync switch is device-local: never exported', async () => {
		await repos.settings.update({ sync: true }, T1);
		expect((await exportData(db, T1)).settings).not.toHaveProperty('sync');
	});
});

describe('import tracking', () => {
	it('notes the fields an import changes, at the time of the imported copy', async () => {
		const other = new QadrantDB(`other-${crypto.randomUUID()}`);
		const otherRepos = createRepositories(other);
		const task = await repos.tasks.create(newTask(), T0);
		await db.outbox.clear();
		const copy = (await exportData(db, T0)).tasks[0];
		await other.tasks.add({ ...copy, notes: 'Desde el otro', updatedAt: T2.toISOString() });
		const file = await exportData(other, T2);
		await importData(file, db);
		expect((await meta(`tasks:${task.id}`))?.changedAt).toMatchObject({ notes: T2.toISOString(), title: T0.toISOString() });
		expect(await db.outbox.get(`tasks:${task.id}`)).toBeDefined();
		await otherRepos.clearAll();
		await other.delete();
	});
});

describe('clearAll', () => {
	it('empties the sync tables too', async () => {
		await repos.tasks.create(newTask(), T0);
		await db.syncState.put({ id: 'sync', cursor: 5 });
		await repos.clearAll();
		expect(await db.syncMeta.count()).toBe(0);
		expect(await db.outbox.count()).toBe(0);
		expect(await db.syncState.count()).toBe(0);
	});
});
