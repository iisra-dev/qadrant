import type { Table } from 'dexie';
import type {
	Base,
	CalendarEvent,
	Correction,
	Goal,
	Person,
	Quadrant,
	Settings,
	Task
} from '$lib/domain/types';
import { changedFields, noteChange, patch } from '$lib/sync/track';
import { SYNCED_SETTINGS } from '$lib/sync/merge';
import type { SyncCollection } from '$lib/sync/types';
import { db as defaultDb, type QadrantDB } from './schema';
import { defaultSettings, GOAL_SUMMARY_MAX, MAX_GOALS } from './defaults';

type NewRecord<T extends Base> = Omit<T, keyof Base>;

function stamp<T extends Base>(data: NewRecord<T>, now: Date): T {
	const iso = now.toISOString();
	return { ...data, id: crypto.randomUUID(), createdAt: iso, updatedAt: iso } as T;
}

function alive<T extends Base>(record: T | undefined): T | undefined {
	return record && !record.deletedAt ? record : undefined;
}

export function createRepositories(db: QadrantDB = defaultDb) {
	/**
	 * Every write goes through here: the record and, in the same transaction,
	 * which of its fields changed and when (docs/04). Automatic changes (the
	 * passage of time) keep the old times and are not queued for upload.
	 */
	function writer<T extends Base>(collection: SyncCollection) {
		const table = db[collection] as unknown as Table<T, string>;

		async function put(before: T | undefined, after: T, time: string, automatic = false): Promise<void> {
			await table.put(after);
			if (!automatic) await noteChange(db, collection, before, after, time);
		}

		return {
			/** Runs `work` in a transaction over the table and the sync tables. */
			run<R>(work: () => Promise<R>): Promise<R> {
				return db.transaction('rw', [table, db.syncMeta, db.outbox], work);
			},
			async add(record: T): Promise<void> {
				await db.transaction('rw', [table, db.syncMeta, db.outbox], () => put(undefined, record, record.updatedAt));
			},
			/** Applies the changes inside the caller's transaction; a missing record is skipped. */
			async change(id: string, changes: Partial<T>, now: Date, automatic = false): Promise<void> {
				const before = await table.get(id);
				if (!before) return;
				const iso = now.toISOString();
				await put(before, patch(before, { ...changes, updatedAt: iso }), iso, automatic);
			}
		};
	}

	const taskTable = writer<Task>('tasks');
	const goalTable = writer<Goal>('goals');
	const personTable = writer<Person>('people');
	const correctionTable = writer<Correction>('corrections');

	const tasks = {
		async create(data: NewRecord<Task>, now = new Date()): Promise<Task> {
			const task = stamp<Task>(data, now);
			await taskTable.add(task);
			return task;
		},
		async get(id: string): Promise<Task | undefined> {
			return alive(await db.tasks.get(id));
		},
		async update(id: string, changes: Partial<NewRecord<Task>>, now = new Date()): Promise<void> {
			await taskTable.run(() => taskTable.change(id, changes, now));
		},
		/** Several updates in one transaction, e.g. reevaluation over time (`automatic`). */
		async updateMany(
			changes: { id: string; changes: Partial<NewRecord<Task>> }[],
			now = new Date(),
			{ automatic = false } = {}
		): Promise<void> {
			await taskTable.run(async () => {
				for (const item of changes) await taskTable.change(item.id, item.changes, now, automatic);
			});
		},
		async complete(id: string, now = new Date()): Promise<void> {
			await tasks.update(id, { status: 'done', doneAt: now.toISOString() }, now);
		},
		async reopen(id: string, now = new Date()): Promise<void> {
			await tasks.update(id, { status: 'open', doneAt: undefined }, now);
		},
		async archive(ids: string[], now = new Date()): Promise<void> {
			await tasks.updateMany(ids.map((id) => ({ id, changes: { status: 'archived' as const } })), now);
		},
		/** Logical delete, kept for sync (docs/04). */
		async remove(id: string, now = new Date()): Promise<void> {
			await tasks.update(id, { deletedAt: now.toISOString() } as Partial<NewRecord<Task>>, now);
		},
		async listOpen(): Promise<Task[]> {
			return db.tasks
				.where('status')
				.equals('open')
				.filter((task) => !task.deletedAt)
				.toArray();
		},
		/** Every task not deleted, done and archived too: what the engine learns from. */
		async listAll(): Promise<Task[]> {
			return db.tasks.filter((task) => !task.deletedAt).toArray();
		},
		async listByQuadrant(quadrant: Quadrant): Promise<Task[]> {
			return db.tasks
				.where('quadrant')
				.equals(quadrant)
				.filter((task) => task.status === 'open' && !task.deletedAt)
				.toArray();
		}
	};

	const goals = {
		/** Active goals in their order; at most MAX_GOALS. */
		async listActive(): Promise<Goal[]> {
			const all = await db.goals.orderBy('order').toArray();
			return all.filter((goal) => goal.active && !goal.deletedAt);
		},
		async list(): Promise<Goal[]> {
			const all = await db.goals.orderBy('order').toArray();
			return all.filter((goal) => !goal.deletedAt);
		},
		async add(title: string, now = new Date()): Promise<Goal> {
			const current = await goals.list();
			if (current.length >= MAX_GOALS) throw new Error(`At most ${MAX_GOALS} goals`);
			const order = current.reduce((max, goal) => Math.max(max, goal.order), -1) + 1;
			const clean = title.trim();
			const goal = stamp<Goal>(
				{ title: clean, summary: clean.slice(0, GOAL_SUMMARY_MAX), active: true, order },
				now
			);
			await goalTable.add(goal);
			return goal;
		},
		async rename(id: string, title: string, now = new Date()): Promise<void> {
			const clean = title.trim();
			await goalTable.run(() => goalTable.change(id, { title: clean, summary: clean.slice(0, GOAL_SUMMARY_MAX) }, now));
		},
		async remove(id: string, now = new Date()): Promise<void> {
			await goalTable.run(() => goalTable.change(id, { deletedAt: now.toISOString() }, now));
		}
	};

	const people = {
		async list(): Promise<Person[]> {
			const all = await db.people.orderBy('name').toArray();
			return all.filter((person) => !person.deletedAt);
		},
		async add(name: string, aliases: string[] = [], now = new Date()): Promise<Person> {
			const person = stamp<Person>({ name: name.trim(), aliases: cleanAliases(aliases) }, now);
			await personTable.add(person);
			return person;
		},
		async update(
			id: string,
			changes: { name?: string; aliases?: string[] },
			now = new Date()
		): Promise<void> {
			await personTable.run(() =>
				personTable.change(
					id,
					{
						...(changes.name !== undefined && { name: changes.name.trim() }),
						...(changes.aliases !== undefined && { aliases: cleanAliases(changes.aliases) })
					},
					now
				)
			);
		},
		async remove(id: string, now = new Date()): Promise<void> {
			await personTable.run(() => personTable.change(id, { deletedAt: now.toISOString() }, now));
		}
	};

	const corrections = {
		async add(data: NewRecord<Correction>, now = new Date()): Promise<Correction> {
			const correction = stamp<Correction>(data, now);
			await correctionTable.add(correction);
			return correction;
		},
		async listForTask(taskId: string): Promise<Correction[]> {
			return db.corrections.where('taskId').equals(taskId).sortBy('createdAt');
		}
	};

	const settings = {
		/** Read-only (usable inside liveQuery): the stored record, or the defaults if there is none yet. */
		async peek(now = new Date()): Promise<Settings> {
			return (await db.settings.get('settings')) ?? defaultSettings(now);
		},
		/** The single settings record, created with defaults on first use (not a change: nothing to sync). */
		async get(now = new Date()): Promise<Settings> {
			return db.transaction('rw', db.settings, async () => {
				const existing = await db.settings.get('settings');
				if (existing) return existing;
				const created = defaultSettings(now);
				await db.settings.add(created);
				return created;
			});
		},
		/** updatedAt moves only with the shared fields, so import and sync compare well (docs/04). */
		async update(
			changes: Partial<Omit<Settings, keyof Base>>,
			now = new Date()
		): Promise<Settings> {
			return db.transaction('rw', [db.settings, db.syncMeta, db.outbox], async () => {
				const current = (await db.settings.get('settings')) ?? defaultSettings(now);
				let next = patch<Settings>(current, changes as Partial<Settings>);
				if (changedFields(current, next, SYNCED_SETTINGS).length) {
					next = { ...next, updatedAt: now.toISOString() };
				}
				await db.settings.put(next);
				await noteChange(db, 'settings', current, next, now.toISOString());
				return next;
			});
		}
	};

	const events = {
		async list(): Promise<CalendarEvent[]> {
			return db.events.orderBy('start').toArray();
		},
		/** The server sends the whole window each time: replace everything. */
		async replace(list: CalendarEvent[]): Promise<void> {
			await db.transaction('rw', db.events, async () => {
				await db.events.clear();
				if (list.length) await db.events.bulkPut(list);
			});
		}
	};

	/** What the sync status line shows, in every tab (docs/01). */
	const sync = {
		state: () => db.syncState.get('sync'),
		pending: () => db.outbox.count()
	};

	/** "Borrar todos los datos" (docs/01): every table; the model lives in OPFS and stays. */
	async function clearAll(): Promise<void> {
		const tables = [db.tasks, db.goals, db.people, db.corrections, db.settings, db.events, db.syncMeta, db.outbox, db.syncState];
		await db.transaction('rw', tables, async () => {
			await Promise.all(tables.map((table) => table.clear()));
		});
	}

	return { tasks, goals, people, corrections, settings, events, sync, clearAll };
}

function cleanAliases(aliases: string[]): string[] {
	return [...new Set(aliases.map((alias) => alias.trim()).filter(Boolean))];
}

export const repos = createRepositories();
export type Repositories = ReturnType<typeof createRepositories>;
