import type { Base, Correction, Goal, Person, Settings, SharedSettings, Task } from '$lib/domain/types';
import { DEVICE_LOCAL_SETTINGS } from '$lib/domain/types';
import { dateKey } from '$lib/domain/dates';
import { db as defaultDb, type QadrantDB } from './schema';
import { defaultSettings } from './defaults';
import { noteChange } from '$lib/sync/track';
import type { SyncCollection } from '$lib/sync/types';

export const EXPORT_VERSION = 1;

export interface ExportFile {
	version: typeof EXPORT_VERSION;
	exportedAt: string;
	tasks: Task[];
	goals: Goal[];
	people: Person[];
	corrections: Correction[];
	settings: SharedSettings;
}

export interface ImportResult {
	added: number;
	updated: number;
	unchanged: number;
	settingsUpdated: boolean;
}

export type ImportErrorCode = 'notAFile' | 'badVersion' | 'damaged';

/** The interface turns the code into a message in its language. */
export class ImportError extends Error {
	constructor(readonly code: ImportErrorCode) {
		super(code);
	}
}

function sharedSettings(settings: Settings): SharedSettings {
	const copy: Record<string, unknown> = { ...settings };
	for (const key of DEVICE_LOCAL_SETTINGS) delete copy[key];
	return copy as unknown as SharedSettings;
}

/** Everything, deleted records included (they carry deletions to other devices), minus device-local settings. */
export async function exportData(db: QadrantDB = defaultDb, now = new Date()): Promise<ExportFile> {
	const [tasks, goals, people, corrections, settings] = await Promise.all([
		db.tasks.toArray(),
		db.goals.toArray(),
		db.people.toArray(),
		db.corrections.toArray(),
		db.settings.get('settings')
	]);
	return {
		version: EXPORT_VERSION,
		exportedAt: now.toISOString(),
		tasks,
		goals,
		people,
		corrections,
		settings: sharedSettings(settings ?? defaultSettings(now))
	};
}

export function exportFileName(now = new Date()): string {
	return `qadrant-${dateKey(now)}.json`;
}

function isRecord(value: unknown): value is Base {
	const v = value as Partial<Base> | null;
	return typeof v === 'object' && v !== null && typeof v.id === 'string' && typeof v.updatedAt === 'string';
}

function validate(data: unknown): ExportFile {
	const file = data as Partial<ExportFile> | null;
	if (typeof file !== 'object' || file === null) throw new ImportError('notAFile');
	if (file.version !== EXPORT_VERSION) throw new ImportError('badVersion');
	for (const key of ['tasks', 'goals', 'people', 'corrections'] as const) {
		const list = file[key];
		if (!Array.isArray(list) || !list.every(isRecord)) throw new ImportError('damaged');
	}
	return file as ExportFile;
}

/** Merge by id keeping the newest updatedAt (docs/04). Device-local settings are never touched. */
export async function importData(data: unknown, db: QadrantDB = defaultDb): Promise<ImportResult> {
	const file = validate(data);
	const result: ImportResult = { added: 0, updated: 0, unchanged: 0, settingsUpdated: false };

	const scope = [db.tasks, db.goals, db.people, db.corrections, db.settings, db.syncMeta, db.outbox];
	await db.transaction('rw', scope, async () => {
		const tables = [
			['tasks', file.tasks],
			['goals', file.goals],
			['people', file.people],
			['corrections', file.corrections]
		] as const;
		for (const [collection, records] of tables) {
			const table = db[collection as SyncCollection] as unknown as QadrantDB['tasks'];
			const existing = await table.bulkGet(records.map((r) => r.id));
			const toPut: [Base | undefined, Base][] = [];
			records.forEach((record, index) => {
				const current = existing[index];
				if (!current) {
					result.added++;
					toPut.push([undefined, record]);
				} else if (record.updatedAt > current.updatedAt) {
					result.updated++;
					toPut.push([current, record]);
				} else {
					result.unchanged++;
				}
			});
			if (!toPut.length) continue;
			await table.bulkPut(toPut.map(([, record]) => record) as Task[]);
			// The imported fields changed when the imported copy did, not now.
			for (const [before, after] of toPut) await noteChange(db, collection, before, after, after.updatedAt);
		}

		if (file.settings && typeof file.settings.updatedAt === 'string') {
			const current = (await db.settings.get('settings')) ?? defaultSettings();
			if (file.settings.updatedAt > current.updatedAt || !(await db.settings.get('settings'))) {
				const incoming = sharedSettings({ ...current, ...file.settings } as Settings);
				const local = Object.fromEntries(DEVICE_LOCAL_SETTINGS.map((key) => [key, current[key]]));
				const next = { ...current, ...incoming, ...local, id: 'settings' } as Settings;
				await db.settings.put(next);
				await noteChange(db, 'settings', current, next, next.updatedAt);
				result.settingsUpdated = true;
			}
		}
	});
	return result;
}
