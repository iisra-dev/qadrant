import { repos } from '$lib/db/repositories';
import type { Settings } from '$lib/domain/types';
import { serverApi } from './client';

export const CALENDAR_REFRESH_MS = 15 * 60_000;

/** Downloads the expanded events from the own server into the local copy. Without server, no events. */
export async function refreshCalendar(server: Settings['server']): Promise<void> {
	if (!server) {
		await repos.events.replace([]);
		return;
	}
	try {
		const state = await serverApi.calendar(server);
		await repos.events.replace(state.connected ? state.events : []);
	} catch {
		// Offline: keep the last copy until the next try.
	}
}
