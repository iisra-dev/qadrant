import type {
	Base,
	Correction,
	Goal,
	Person,
	Quadrant,
	Settings,
	Task
} from '$lib/domain/types';
import { db as defaultDb, type CuadranteDB } from './schema';
import { defaultSettings, GOAL_SUMMARY_MAX, MAX_GOALS } from './defaults';

type NewRecord<T extends Base> = Omit<T, keyof Base>;

function stamp<T extends Base>(data: NewRecord<T>, now: Date): T {
	const iso = now.toISOString();
	return { ...data, id: crypto.randomUUID(), createdAt: iso, updatedAt: iso } as T;
}

function alive<T extends Base>(record: T | undefined): T | undefined {
	return record && !record.deletedAt ? record : undefined;
}

export function createRepositories(db: CuadranteDB = defaultDb) {
	const tasks = {
		async create(data: NewRecord<Task>, now = new Date()): Promise<Task> {
			const task = stamp<Task>(data, now);
			await db.tasks.add(task);
			return task;
		},
		async get(id: string): Promise<Task | undefined> {
			return alive(await db.tasks.get(id));
		},
		async update(id: string, changes: Partial<NewRecord<Task>>, now = new Date()): Promise<void> {
			await db.tasks.update(id, { ...changes, updatedAt: now.toISOString() });
		},
		/** Several updates in one transaction, e.g. reevaluation over time. */
		async updateMany(
			changes: { id: string; changes: Partial<NewRecord<Task>> }[],
			now = new Date()
		): Promise<void> {
			const updatedAt = now.toISOString();
			await db.transaction('rw', db.tasks, async () => {
				for (const item of changes) await db.tasks.update(item.id, { ...item.changes, updatedAt });
			});
		},
		async complete(id: string, now = new Date()): Promise<void> {
			const iso = now.toISOString();
			await db.tasks.update(id, { status: 'done', doneAt: iso, updatedAt: iso });
		},
		async reopen(id: string, now = new Date()): Promise<void> {
			const task = await db.tasks.get(id);
			if (!task) return;
			const { doneAt: _doneAt, ...rest } = task;
			await db.tasks.put({ ...rest, status: 'open', updatedAt: now.toISOString() });
		},
		async archive(ids: string[], now = new Date()): Promise<void> {
			const updatedAt = now.toISOString();
			await db.transaction('rw', db.tasks, async () => {
				for (const id of ids) await db.tasks.update(id, { status: 'archived', updatedAt });
			});
		},
		/** Logical delete, kept for sync (docs/04). */
		async remove(id: string, now = new Date()): Promise<void> {
			const iso = now.toISOString();
			await db.tasks.update(id, { deletedAt: iso, updatedAt: iso });
		},
		async listOpen(): Promise<Task[]> {
			return db.tasks
				.where('status')
				.equals('open')
				.filter((task) => !task.deletedAt)
				.toArray();
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
			await db.goals.add(goal);
			return goal;
		},
		async rename(id: string, title: string, now = new Date()): Promise<void> {
			const clean = title.trim();
			await db.goals.update(id, {
				title: clean,
				summary: clean.slice(0, GOAL_SUMMARY_MAX),
				updatedAt: now.toISOString()
			});
		},
		async remove(id: string, now = new Date()): Promise<void> {
			const iso = now.toISOString();
			await db.goals.update(id, { deletedAt: iso, updatedAt: iso });
		}
	};

	const people = {
		async list(): Promise<Person[]> {
			const all = await db.people.orderBy('name').toArray();
			return all.filter((person) => !person.deletedAt);
		},
		async add(name: string, aliases: string[] = [], now = new Date()): Promise<Person> {
			const person = stamp<Person>({ name: name.trim(), aliases: cleanAliases(aliases) }, now);
			await db.people.add(person);
			return person;
		},
		async update(
			id: string,
			changes: { name?: string; aliases?: string[] },
			now = new Date()
		): Promise<void> {
			await db.people.update(id, {
				...(changes.name !== undefined && { name: changes.name.trim() }),
				...(changes.aliases !== undefined && { aliases: cleanAliases(changes.aliases) }),
				updatedAt: now.toISOString()
			});
		},
		async remove(id: string, now = new Date()): Promise<void> {
			const iso = now.toISOString();
			await db.people.update(id, { deletedAt: iso, updatedAt: iso });
		}
	};

	const corrections = {
		async add(data: NewRecord<Correction>, now = new Date()): Promise<Correction> {
			const correction = stamp<Correction>(data, now);
			await db.corrections.add(correction);
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
		/** The single settings record, created with defaults on first use. */
		async get(now = new Date()): Promise<Settings> {
			return db.transaction('rw', db.settings, async () => {
				const existing = await db.settings.get('settings');
				if (existing) return existing;
				const created = defaultSettings(now);
				await db.settings.add(created);
				return created;
			});
		},
		async update(
			changes: Partial<Omit<Settings, keyof Base>>,
			now = new Date()
		): Promise<Settings> {
			return db.transaction('rw', db.settings, async () => {
				const current = (await db.settings.get('settings')) ?? defaultSettings(now);
				const next: Settings = { ...current, ...changes, updatedAt: now.toISOString() };
				await db.settings.put(next);
				return next;
			});
		}
	};

	/** "Borrar todos los datos" (docs/01): every table; the model lives in OPFS and stays. */
	async function clearAll(): Promise<void> {
		await db.transaction('rw', [db.tasks, db.goals, db.people, db.corrections, db.settings], async () => {
			await Promise.all([db.tasks.clear(), db.goals.clear(), db.people.clear(), db.corrections.clear(), db.settings.clear()]);
		});
	}

	return { tasks, goals, people, corrections, settings, clearAll };
}

function cleanAliases(aliases: string[]): string[] {
	return [...new Set(aliases.map((alias) => alias.trim()).filter(Boolean))];
}

export const repos = createRepositories();
export type Repositories = ReturnType<typeof createRepositories>;
