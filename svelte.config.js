import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	compilerOptions: {
		// Force runes mode for the project, except for libraries.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// SPA: every route falls back to index.html (docs/02-arquitectura.md).
		adapter: adapter({ fallback: 'index.html' }),
		// @vite-pwa/sveltekit builds and registers src/service-worker.ts (injectManifest).
		serviceWorker: { register: false }
	}
};

export default config;
