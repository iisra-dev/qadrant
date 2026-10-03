import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '$lib/db/defaults';
import { createRepositories, type Repositories } from '$lib/db/repositories';
import { QadrantDB } from '$lib/db/schema';
import type { Decision } from '$lib/domain/types';
import { createTaskActions } from './actions';

const settings = defaultSettings();
const now = new Date(2026, 9, 2, 10, 0);

function decision(overrides: Partial<Decision> = {}): Decision {
	return {
		quadrant: 'do',
		title: 'Llamar al taller',
		urgent: { value: true, dueAt: new Date(2026, 9, 2, 18).toISOString(), reason: 'due-soon' },
		importance: { p: 0.8 },
		delegable: { p: null },
		engine: 'laya-wasm',
		...overrides
	};
}

let db: QadrantDB;
let repos: Repositories;
let actions: ReturnType<typeof createTaskActions>;

beforeEach(async () => {
	db = new QadrantDB(`test-${crypto.randomUUID()}`);
	await db.open();
	repos = createRepositories(db);
	actions = createTaskActions(repos);
});

afterEach(async () => {
	await db.delete();
});

describe('saveCapture', () => {
	it('accepted proposal: no correction, important from thresholds', async () => {
		const task = await actions.saveCapture({ rawInput: 'Llamar al taller hoy', decision: decision(), choice: { kind: 'accepted' }, settings, now });
		expect(task).toMatchObject({ quadrant: 'do', quadrantSource: 'ai', important: true, title: 'Llamar al taller', status: 'open' });
		expect(task.dueAt).toBe(decision().urgent.dueAt);
		expect(await db.corrections.count()).toBe(0);
	});

	it('choosing the proposed quadrant again is not a correction', async () => {
		await actions.saveCapture({ rawInput: 'x', decision: decision(), choice: { kind: 'manual', quadrant: 'do' }, settings, now });
		expect(await db.corrections.count()).toBe(0);
	});

	it('changing the quadrant records a correction with the original probabilities', async () => {
		const d = decision({ delegable: { p: 0.3 } });
		const task = await actions.saveCapture({ rawInput: 'x', decision: d, choice: { kind: 'manual', quadrant: 'delegate' }, settings, now });
		expect(task).toMatchObject({ quadrant: 'delegate', quadrantSource: 'user' });
		expect(task.important).toBeUndefined();
		const [correction] = await repos.corrections.listForTask(task.id);
		expect(correction).toMatchObject({ from: 'do', to: 'delegate', pImportance: 0.8, pDelegable: 0.3, engine: 'laya-wasm' });
	});

	it('answering the doubt records a correction from null', async () => {
		const d = decision({
			quadrant: null,
			ask: 'importance',
			urgent: { value: false, reason: 'no-date' },
			importance: { p: null },
			engine: 'rules'
		});
		const task = await actions.saveCapture({ rawInput: 'Mirar cursos de inglés', decision: d, choice: { kind: 'answer', answer: true }, settings, now });
		expect(task).toMatchObject({ quadrant: 'schedule', quadrantSource: 'answer', important: true });
		expect(task.dueAt).toBeUndefined();
		const [correction] = await repos.corrections.listForTask(task.id);
		expect(correction).toMatchObject({ from: null, to: 'schedule', pImportance: null, pDelegable: null, engine: 'rules' });
	});

	it('answering No to delegability sends it to Hacer with important = false', async () => {
		const d = decision({ quadrant: null, ask: 'delegable', importance: { p: 0.2 }, delegable: { p: 0.5 } });
		const task = await actions.saveCapture({ rawInput: 'x', decision: d, choice: { kind: 'answer', answer: false }, settings, now });
		expect(task).toMatchObject({ quadrant: 'do', important: false });
	});

	it('a delegated task gets a follow-up 2 working days later', async () => {
		const d = decision({ quadrant: 'delegate', delegable: { p: null, personId: 'p-ana' }, importance: { p: null }, engine: 'rules' });
		const task = await actions.saveCapture({ rawInput: 'x', decision: d, choice: { kind: 'accepted' }, settings, now });
		expect(task.followUpAt).toBe(new Date(2026, 9, 6, 9, 0).toISOString());
	});

	it('keeps the assignee of an assignment', async () => {
		const d = decision({ quadrant: 'delegate', delegable: { p: null, personId: 'p-ana' }, importance: { p: null }, engine: 'rules' });
		const task = await actions.saveCapture({ rawInput: 'Que Ana…', decision: d, choice: { kind: 'accepted' }, settings, now });
		expect(task).toMatchObject({ quadrant: 'delegate', delegatedTo: 'p-ana' });
		expect(task.important).toBeUndefined();
	});

	it('refuses to save a doubt without answer', async () => {
		const d = decision({ quadrant: null, ask: 'importance' });
		await expect(actions.saveCapture({ rawInput: 'x', decision: d, choice: { kind: 'accepted' }, settings, now })).rejects.toThrow();
	});
});

describe('changeQuadrant', () => {
	it('records the correction, marks it as user and clears movedAt', async () => {
		const task = await actions.saveCapture({ rawInput: 'x', decision: decision(), choice: { kind: 'accepted' }, settings, now });
		await repos.tasks.update(task.id, { movedAt: now.toISOString() });
		await actions.changeQuadrant((await repos.tasks.get(task.id))!, 'eliminate', settings, now);
		const stored = await repos.tasks.get(task.id);
		expect(stored).toMatchObject({ quadrant: 'eliminate', quadrantSource: 'user', important: false });
		expect(stored?.movedAt).toBeUndefined();
		const [correction] = await repos.corrections.listForTask(task.id);
		expect(correction).toMatchObject({ from: 'do', to: 'eliminate' });
	});

	it('sets the follow-up when moved to Delegar and clears it when moved out', async () => {
		const task = await actions.saveCapture({ rawInput: 'x', decision: decision(), choice: { kind: 'accepted' }, settings, now });
		await actions.changeQuadrant(task, 'delegate', settings, now);
		const delegated = (await repos.tasks.get(task.id))!;
		expect(delegated.followUpAt).toBe(new Date(2026, 9, 6, 9, 0).toISOString());
		await actions.changeQuadrant(delegated, 'do', settings, now);
		expect((await repos.tasks.get(task.id))?.followUpAt).toBeUndefined();
	});
});

describe('changeDueDate and reevaluateOpenTasks', () => {
	const scheduleDecision = decision({
		quadrant: 'schedule',
		urgent: { value: false, dueAt: new Date(2026, 9, 20, 18).toISOString(), reason: 'due-later' }
	});

	it('moving the date into the window moves the task to Hacer', async () => {
		const task = await actions.saveCapture({ rawInput: 'x', decision: scheduleDecision, choice: { kind: 'accepted' }, settings, now });
		await actions.changeDueDate(task, new Date(2026, 9, 5, 18).toISOString(), settings, now);
		const stored = await repos.tasks.get(task.id);
		expect(stored).toMatchObject({ quadrant: 'do', movedAt: now.toISOString() });
		expect(await db.corrections.count()).toBe(0);
	});

	it('moves open tasks when time passes', async () => {
		await actions.saveCapture({ rawInput: 'x', decision: scheduleDecision, choice: { kind: 'accepted' }, settings, now });
		const friday16 = new Date(2026, 9, 16, 9, 0);
		expect(await actions.reevaluateOpenTasks(settings, now)).toBe(0);
		expect(await actions.reevaluateOpenTasks(settings, friday16)).toBe(1);
		const [task] = await repos.tasks.listOpen();
		expect(task).toMatchObject({ quadrant: 'do', movedAt: friday16.toISOString(), updatedAt: friday16.toISOString() });
	});
});
