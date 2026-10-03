import { dateKey } from '$lib/domain/dates';

// Shared "now", refreshed every minute, so overdue labels and the passage of
// time follow the clock while the app stays open.
class Clock {
	now = $state(new Date());
	today = $derived(dateKey(this.now));
	private timer: ReturnType<typeof setInterval> | undefined;

	start(): () => void {
		this.now = new Date();
		this.timer ??= setInterval(() => (this.now = new Date()), 60_000);
		return () => {
			clearInterval(this.timer);
			this.timer = undefined;
		};
	}
}

export const clock = new Clock();
