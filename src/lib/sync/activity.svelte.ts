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

/** Whether this device is syncing right now, in every tab (the small ring in the Matrix). */
export const syncActivity = $state({ busy: false });

type Message = { ids?: unknown; busy?: unknown };

const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('qadrant-sync-activity') : null;
channel?.addEventListener('message', (event: MessageEvent<Message>) => {
	if (Array.isArray(event.data?.ids)) arrivals.mark(event.data.ids.filter((id): id is string => typeof id === 'string'));
	if (typeof event.data?.busy === 'boolean') syncActivity.busy = event.data.busy;
});

/** Called by the syncing tab around each cycle. */
export function announceBusy(busy: boolean) {
	syncActivity.busy = busy;
	channel?.postMessage({ busy });
}

/** Called by the syncing tab: tints the rows here and in the other tabs. */
export function announceArrivals(ids: readonly string[]) {
	if (!ids.length) return;
	arrivals.mark(ids);
	channel?.postMessage({ ids: [...ids] });
}
