/// <reference types="vite-plugin-pwa/svelte" />
/// <reference types="vite-plugin-pwa/info" />
// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	/** package.json version, replaced at build time. */
	const __APP_VERSION__: string;
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface PageState {
			/** Task shown in the web side panel (shallow routing). */
			taskId?: string;
		}
		// interface Platform {}
	}
}

export {};
