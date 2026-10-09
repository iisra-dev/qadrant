// The browser's own install prompt (Chrome, Edge, Android), kept so the
// welcome can offer an "Install" button. Safari and Firefox never send it:
// there the welcome shows the steps instead.
interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

class Install {
	/** The browser will show its install dialog on request. */
	available = $state(false);
	installed = $state(false);
	#event: BeforeInstallPromptEvent | undefined;

	start(): () => void {
		const offered = (event: Event) => {
			// Only the welcome replaces Chrome's own banner; elsewhere it still shows.
			if (location.pathname.startsWith('/welcome')) event.preventDefault();
			this.#event = event as BeforeInstallPromptEvent;
			this.available = true;
		};
		const done = () => {
			this.#event = undefined;
			this.available = false;
			this.installed = true;
		};
		addEventListener('beforeinstallprompt', offered);
		addEventListener('appinstalled', done);
		return () => {
			removeEventListener('beforeinstallprompt', offered);
			removeEventListener('appinstalled', done);
		};
	}

	/** Shows the browser's dialog; true if the user installed. The event works once. */
	async prompt(): Promise<boolean> {
		const event = this.#event;
		if (!event) return false;
		this.#event = undefined;
		this.available = false;
		await event.prompt();
		return (await event.userChoice).outcome === 'accepted';
	}
}

export const install = new Install();
