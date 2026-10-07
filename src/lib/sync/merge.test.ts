import { describe, expect, it } from 'vitest';
import type { Settings, Task } from '$lib/domain/types';
import { defaultSettings } from '$lib/db/defaults';
import { mergeCopies, SYNCED_SETTINGS, type SyncCopy } from './merge';

const T0 = '2026-10-01T08:00:00.000Z';
const T1 = '2026-10-02T08:00:00.000Z';
const T2 = '2026-10-03T08:00:00.000Z';
const T3 = '2026-10-04T08:00:00.000Z';

function task(overrides: Partial<Task> = {}): Task {
	return {
		id: 'a',
		createdAt: T0,
		updatedAt: T0,
		title: 'Llamar al taller',
		rawInput: 'Llamar al taller',
		quadrant: 'do',
		quadrantSource: 'ai',
		status: 'open',
		...overrides
	};
}

function copy<T extends Task | Settings>(record: T, changedAt: Record<string, string> = {}): SyncCopy<T> {
	const all: Record<string, string> = {};
	for (const key of Object.keys(record)) all[key] = T0;
	return { record, changedAt: { ...all, ...changedAt } };
}

describe('mergeCopies', () => {
	it('keeps the newest change of each field, so offline edits on two devices both survive', () => {
		const phone = copy(task({ status: 'done', doneAt: T1, updatedAt: T1 }), { status: T1, doneAt: T1 });
		const laptop = copy(task({ notes: 'Pedir presupuesto', updatedAt: T2 }), { notes: T2 });
		const merged = mergeCopies(phone, laptop);
		expect(merged.record).toMatchObject({ status: 'done', doneAt: T1, notes: 'Pedir presupuesto' });
		expect(merged.changedAt).toMatchObject({ status: T1, doneAt: T1, notes: T2 });
		expect(mergeCopies(laptop, phone).record).toEqual(merged.record);
	});

	it('takes the server copy when both changed a field at the same time', () => {
		const local = copy(task({ title: 'Local' }), { title: T1 });
		const server = copy(task({ title: 'Server' }), { title: T1 });
		expect(mergeCopies(local, server).record.title).toBe('Server');
	});

	it('carries a removed field when its removal is the newest change', () => {
		const local = copy(task({ updatedAt: T2 }), { dueAt: T2 });
		const server = copy(task({ dueAt: T3, updatedAt: T1 }), { dueAt: T1 });
		const merged = mergeCopies(local, server);
		expect('dueAt' in merged.record).toBe(false);
		expect(merged.changedAt.dueAt).toBe(T2);
		const back = mergeCopies(server, local);
		expect('dueAt' in back.record).toBe(false);
	});

	it('lets a deletion win over any edit, older or newer', () => {
		const deleted = copy(task({ deletedAt: T1, updatedAt: T1 }), { deletedAt: T1 });
		const edited = copy(task({ title: 'Nuevo', updatedAt: T3 }), { title: T3 });
		expect(mergeCopies(deleted, edited).record.deletedAt).toBe(T1);
		expect(mergeCopies(edited, deleted).record.deletedAt).toBe(T1);
		expect(mergeCopies(edited, deleted).record.title).toBe('Nuevo');
	});

	it('does not let an automatic move undo a hand change made elsewhere', () => {
		// The passage of time moved the task here but kept the old time of the field.
		const auto = copy(task({ quadrant: 'do', movedAt: T3, updatedAt: T3 }), { quadrant: T0, movedAt: T0 });
		const byHand = copy(task({ quadrant: 'eliminate', quadrantSource: 'user', updatedAt: T1 }), {
			quadrant: T1,
			quadrantSource: T1
		});
		const merged = mergeCopies(auto, byHand);
		expect(merged.record).toMatchObject({ quadrant: 'eliminate', quadrantSource: 'user' });
	});

	it('keeps the newest updatedAt of the two copies, never the time of arrival', () => {
		const local = copy(task({ updatedAt: T1 }), {});
		const server = copy(task({ updatedAt: T2 }), {});
		expect(mergeCopies(local, server).record.updatedAt).toBe(T2);
		expect(mergeCopies(server, local).record.updatedAt).toBe(T2);
	});

	it('treats a field without a time as the oldest change', () => {
		const local: SyncCopy<Task> = { record: task({ notes: 'local' }), changedAt: {} };
		const server = copy(task({ notes: 'server' }), { notes: T1 });
		expect(mergeCopies(local, server).record.notes).toBe('server');
		expect(mergeCopies(server, local).record.notes).toBe('server');
	});

	it('merges only the shared settings and leaves the device ones alone', () => {
		const here: Settings = { ...defaultSettings(new Date(T0)), theme: 'dark', language: 'es', urgencyDays: 3, updatedAt: T2 };
		const local = copy(here, { urgencyDays: T2, workDays: T0 });
		const fromServer = {
			id: 'settings',
			createdAt: T0,
			updatedAt: T1,
			urgencyDays: 1,
			workHours: { start: '08:00', end: '15:00' },
			workDays: [1, 2, 3, 4],
			holidays: { national: false, extra: ['2026-12-24'] },
			theme: 'light'
		} as unknown as Settings;
		const server = copy(fromServer, { urgencyDays: T1, workHours: T1, workDays: T1, holidays: T1, theme: T3 });
		const merged = mergeCopies(local, server, SYNCED_SETTINGS);
		expect(merged.record).toMatchObject({
			urgencyDays: 3,
			workHours: { start: '08:00', end: '15:00' },
			workDays: [1, 2, 3, 4],
			holidays: { national: false, extra: ['2026-12-24'] },
			theme: 'dark',
			language: 'es',
			thresholds: here.thresholds,
			updatedAt: T2
		});
	});

	it('does not change the copies it merges', () => {
		const local = copy(task({ notes: 'a' }), { notes: T2 });
		const server = copy(task({ notes: 'b' }), { notes: T1 });
		const before = JSON.stringify([local, server]);
		mergeCopies(local, server);
		expect(JSON.stringify([local, server])).toBe(before);
	});
});
