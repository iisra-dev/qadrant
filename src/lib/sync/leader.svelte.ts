/**
 * One tab per device syncs, sends the reminders and refreshes the calendar
 * (docs/02): the one holding this Web Lock. When it closes, another takes it.
 */
export const leader = $state({ active: false });

const LOCK = 'qadrant-leader';

export function claimLeadership(): () => void {
	if (!('locks' in navigator)) {
		leader.active = true;
		return () => (leader.active = false);
	}
	const release = new AbortController();
	navigator.locks
		.request(LOCK, () => {
			leader.active = true;
			return new Promise<void>((resolve) => release.signal.addEventListener('abort', () => resolve()));
		})
		.catch(() => {});
	return () => {
		release.abort();
		leader.active = false;
	};
}
