import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { CuadranteDB } from './schema';
import { createRepositories, type Repositories } from './repositories';
import { live } from '$lib/stores/live';
import type { Task } from '$lib/domain/types';

const NOW = new Date('2026-10-02T08:00:00Z');
const LATER = new Date('2026-10-02T09:00:00Z');

function newTask(overrides: Partial<Task> = {}) {
	return {
		title: 'Llamar al taller',
		rawInput: 'Llamar al taller hoy',
		quadrant: 'do' as const,
		quadrantSource: 'ai' as const,
		status: 'open' as const,
		...overrides
	};
}

let db: CuadranteDB;
let repos: Repositories;

beforeEach(async () => {
	db = new CuadranteDB(`test-${crypto.randomUUID()}`);
	await db.open();
	repos = createRepositories(db);
});

afterEach(async () => {
	await db.delete();
});

describe('tasks', () => {
	it('creates tasks with id and timestamps', async () => {
		const task = await repos.tasks.create(newTask(), NOW);
		expect(task.id).toMatch(/^[0-9a-f-]{36}$/);
		expect(task.createdAt).toBe(NOW.toISOString());
		expect(task.updatedAt).toBe(NOW.toISOString());
		expect(await repos.tasks.get(task.id)).toEqual(task);
	});

	it('bumps updatedAt on update', async () => {
		const task = await repos.tasks.create(newTask(), NOW);
		await repos.tasks.update(task.id, { title: 'Llamar al mecánico' }, LATER);
		const stored = await repos.tasks.get(task.id);
		expect(stored?.title).toBe('Llamar al mecánico');
		expect(stored?.updatedAt).toBe(LATER.toISOString());
		expect(stored?.createdAt).toBe(NOW.toISOString());
	});

	it('lists only open, not deleted tasks', async () => {
		const open = await repos.tasks.create(newTask(), NOW);
		const done = await repos.tasks.create(newTask(), NOW);
		const deleted = await repos.tasks.create(newTask(), NOW);
		await repos.tasks.complete(done.id, LATER);
		await repos.tasks.remove(deleted.id, LATER);
		expect((await repos.tasks.listOpen()).map((t) => t.id)).toEqual([open.id]);
		expect(await repos.tasks.get(deleted.id)).toBeUndefined();
		expect((await db.tasks.get(deleted.id))?.deletedAt).toBe(LATER.toISOString());
	});

	it('completes and reopens', async () => {
		const task = await repos.tasks.create(newTask(), NOW);
		await repos.tasks.complete(task.id, LATER);
		expect(await repos.tasks.get(task.id)).toMatchObject({ status: 'done', doneAt: LATER.toISOString() });
		await repos.tasks.reopen(task.id, LATER);
		const reopened = await repos.tasks.get(task.id);
		expect(reopened?.status).toBe('open');
		expect(reopened?.doneAt).toBeUndefined();
	});

	it('archives several tasks at once', async () => {
		const a = await repos.tasks.create(newTask({ quadrant: 'eliminate' }), NOW);
		const b = await repos.tasks.create(newTask({ quadrant: 'eliminate' }), NOW);
		await repos.tasks.archive([a.id, b.id], LATER);
		expect(await repos.tasks.listByQuadrant('eliminate')).toEqual([]);
	});

	it('does not index tasks without dueAt', async () => {
		await repos.tasks.create(newTask(), NOW);
		await repos.tasks.create(newTask({ dueAt: '2026-10-05T07:00:00.000Z' }), NOW);
		expect(await db.tasks.where('dueAt').above('').count()).toBe(1);
	});
});

describe('goals', () => {
	it('keeps order and trims the summary to 80 characters', async () => {
		const long = 'a'.repeat(100);
		await repos.goals.add('Ventas Q4', NOW);
		await repos.goals.add(`  ${long}  `, NOW);
		const goals = await repos.goals.listActive();
		expect(goals.map((g) => g.order)).toEqual([0, 1]);
		expect(goals[0].title).toBe('Ventas Q4');
		expect(goals[1].summary).toHaveLength(80);
	});

	it('allows at most 5 goals', async () => {
		for (let i = 0; i < 5; i++) await repos.goals.add(`Objetivo ${i}`, NOW);
		await expect(repos.goals.add('Sexto', NOW)).rejects.toThrow();
	});

	it('filters inactive goals in memory', async () => {
		const goal = await repos.goals.add('Ventas Q4', NOW);
		await db.goals.update(goal.id, { active: false });
		expect(await repos.goals.listActive()).toEqual([]);
	});
});

describe('people', () => {
	it('finds people by alias and dedupes aliases', async () => {
		const ana = await repos.people.add('Ana', [' Anita ', 'Anita', ''], NOW);
		expect(ana.aliases).toEqual(['Anita']);
		const found = await db.people.where('aliases').equals('Anita').first();
		expect(found?.id).toBe(ana.id);
	});
});

describe('corrections', () => {
	it('stores corrections per task', async () => {
		const task = await repos.tasks.create(newTask(), NOW);
		await repos.corrections.add(
			{ taskId: task.id, from: 'do', to: 'delegate', pImportance: null, pDelegable: null, engine: 'rules' },
			NOW
		);
		const list = await repos.corrections.listForTask(task.id);
		expect(list).toHaveLength(1);
		expect(list[0]).toMatchObject({ from: 'do', to: 'delegate', engine: 'rules' });
	});
});

describe('settings', () => {
	it('creates the defaults on first read', async () => {
		const settings = await repos.settings.get(NOW);
		expect(settings).toMatchObject({
			id: 'settings',
			urgencyDays: 2,
			workHours: { start: '09:00', end: '18:00' },
			workDays: [1, 2, 3, 4, 5],
			holidays: { national: true, extra: [] },
			thresholds: { low: 0.35, high: 0.65 },
			theme: 'system',
			model: { state: 'absent', wifiOnly: true },
			onboardingDone: false
		});
		expect(await db.settings.count()).toBe(1);
	});

	it('peek returns the defaults without writing', async () => {
		expect((await repos.settings.peek(NOW)).onboardingDone).toBe(false);
		expect(await db.settings.count()).toBe(0);
	});

	it('merges updates', async () => {
		await repos.settings.get(NOW);
		const next = await repos.settings.update({ urgencyDays: 3 }, LATER);
		expect(next.urgencyDays).toBe(3);
		expect(next.workDays).toEqual([1, 2, 3, 4, 5]);
		expect(next.updatedAt).toBe(LATER.toISOString());
	});
});

describe('live stores', () => {
	it('emits again when the table changes', async () => {
		const store = live(() => repos.tasks.listOpen(), [] as Task[]);
		const seen: number[] = [];
		const unsubscribe = store.subscribe((tasks) => seen.push(tasks.length));
		await vi.waitFor(() => expect(seen).toEqual([0]));
		await repos.tasks.create(newTask(), NOW);
		await vi.waitFor(() => expect(get(store)).toHaveLength(1));
		unsubscribe();
		expect(seen[0]).toBe(0);
		expect(seen.at(-1)).toBe(1);
	});
});

