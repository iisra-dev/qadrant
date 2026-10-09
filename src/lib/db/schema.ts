import Dexie, { type DexieOptions, type EntityTable } from 'dexie';
import type { CalendarEvent, Correction, Goal, Person, Settings, Task } from '$lib/domain/types';
import type { OutboxEntry, SyncMeta, SyncState } from '$lib/sync/types';

export class QadrantDB extends Dexie {
	tasks!: EntityTable<Task, 'id'>;
	goals!: EntityTable<Goal, 'id'>;
	people!: EntityTable<Person, 'id'>;
	corrections!: EntityTable<Correction, 'id'>;
	settings!: EntityTable<Settings, 'id'>;
	/** Read-only copy of the calendar; replaced on every download, never exported or synced (docs/04). */
	events!: EntityTable<CalendarEvent, 'id'>;
	/** Sync (phase 4, docs/04): never exported nor synced themselves. */
	syncMeta!: EntityTable<SyncMeta, 'key'>;
	outbox!: EntityTable<OutboxEntry, 'key'>;
	syncState!: EntityTable<SyncState, 'id'>;

	constructor(name = 'qadrant', options?: DexieOptions) {
		super(name, options);
		// Booleans are not valid IndexedDB keys, so goals.active is filtered in memory (docs/04).
		this.version(1).stores({
			tasks: 'id, quadrant, status, dueAt, scheduledAt, delegatedTo, followUpAt, updatedAt',
			goals: 'id, order, updatedAt',
			people: 'id, name, *aliases, updatedAt',
			corrections: 'id, taskId, createdAt, updatedAt',
			settings: 'id'
		});
		this.version(2).stores({ events: 'id, start' });
		this.version(3).stores({ syncMeta: 'key', outbox: 'key', syncState: 'id' });
	}
}
