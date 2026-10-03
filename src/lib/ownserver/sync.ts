import type { Settings, Task } from '$lib/domain/types';
import { serverApi } from './client';
import { fingerprint, remindersFor } from './reminders';

const DEBOUNCE_MS = 1500;

/**
 * Keeps the server's reminder list in step with the tasks: every change
 * sends the full list again, so completed or deleted tasks drop out.
 */
export function createReminderSync() {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let lastSent = '';

	function update(tasks: Task[], server: Settings['server']) {
		clearTimeout(timer);
		if (!server) {
			lastSent = '';
			return;
		}
		timer = setTimeout(async () => {
			const list = remindersFor(tasks, new Date());
			const key = server.url + fingerprint(list);
			if (key === lastSent) return;
			try {
				await serverApi.putReminders(server, list);
				lastSent = key;
			} catch {
				// Offline or server down: the next change (or the next start) tries again.
			}
		}, DEBOUNCE_MS);
	}

	return { update, stop: () => clearTimeout(timer) };
}
