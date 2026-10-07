// In-memory copy of the own server's sync and reminders rules (server/sync.go),
// for unit tests and the e2e fake server. Content stays opaque, as there.
import type { PushItem, PushResult, SyncRecord } from '../../src/lib/sync/api';

export class MemorySync {
	version = 0;
	syncId = 'sync-1';
	apiVersion = 2;
	records = new Map<string, SyncRecord>();
	remindersVersion: number | undefined;
	reminders: unknown[] = [];
	private listeners = new Set<(version: number) => void>();

	push(items: PushItem[]): { results: PushResult[]; version: number } {
		let accepted = false;
		const results = items.map((item): PushResult => {
			const key = `${item.collection}:${item.id}`;
			const current = this.records.get(key);
			const version = current?.version ?? 0;
			if (version !== item.baseVersion) {
				return { collection: item.collection, id: item.id, ok: false, version, ...(current && { content: current.content }) };
			}
			this.version++;
			accepted = true;
			this.records.set(key, { collection: item.collection, id: item.id, version: this.version, content: item.content });
			return { collection: item.collection, id: item.id, ok: true, version: this.version };
		});
		if (accepted) for (const listener of this.listeners) listener(this.version);
		return { results, version: this.version };
	}

	pull(since: number, limit = 200): { records: SyncRecord[]; version: number; more: boolean } {
		const newer = [...this.records.values()].filter((r) => r.version > since).sort((a, b) => a.version - b.version);
		return { records: newer.slice(0, limit), version: this.version, more: newer.length > limit };
	}

	/** Lists from an older sync version are ignored; lists without one always replace. */
	putReminders(list: unknown[], version?: number): boolean {
		if (version !== undefined) {
			if (this.remindersVersion !== undefined && version < this.remindersVersion) return false;
			this.remindersVersion = version;
		}
		this.reminders = list;
		return true;
	}

	reset() {
		this.records.clear();
		this.syncId = `sync-${Math.random().toString(36).slice(2)}`;
	}

	onChange(listener: (version: number) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
}
