/** How long a row that came from another device stays tinted (TaskRow's landing). */
const ARRIVAL_MS = 1800;

/**
 * Tasks changed by the last download, so the Matrix can tint them as they
 * arrive (docs/05, "Movimiento"). The tab that syncs tells the others over a
 * BroadcastChannel: it may not be the one on screen.
 */
class Arrivals {
	ids = $state<ReadonlySet<string>>(new Set());
	#timers = new Map<string, ReturnType<typeof setTimeout>>();

	has(id: string): boolean {
		return this.ids.has(id);
	}

	mark(ids: readonly string[]) {
		if (!ids.length) return;
		this.ids = new Set([...this.ids, ...ids]);
		for (const id of ids) {
			clearTimeout(this.#timers.get(id));
			this.#timers.set(
				id,
				setTimeout(() => {
					this.#timers.delete(id);
					const next = new Set(this.ids);
					next.delete(id);
					this.ids = next;
				}, ARRIVAL_MS)
			);
		}
	}
}

export const arrivals = new Arrivals();

const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('qadrant-arrivals') : null;
channel?.addEventListener('message', (event: MessageEvent<{ ids?: unknown }>) => {
	if (Array.isArray(event.data?.ids)) arrivals.mark(event.data.ids.filter((id): id is string => typeof id === 'string'));
});

/** Called by the syncing tab: tints the rows here and in the other tabs. */
export function announceArrivals(ids: readonly string[]) {
	if (!ids.length) return;
	arrivals.mark(ids);
	channel?.postMessage({ ids: [...ids] });
}
