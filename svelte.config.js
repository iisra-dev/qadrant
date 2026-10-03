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
		serviceWorker: { register: false },
		// Nothing from third parties: the browser enforces it (docs/02, "Cabeceras").
		// Emitted as a <meta> tag; frame-ancestors and the isolation headers live in static/_headers.
		csp: {
			mode: 'hash',
			directives: {
				'default-src': ['self'],
				'script-src': ['self', 'wasm-unsafe-eval'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:', 'blob:'],
				'font-src': ['self'],
				'connect-src': ['self', 'https:'],
				'worker-src': ['self', 'blob:'],
				'manifest-src': ['self'],
				'object-src': ['none'],
				'base-uri': ['self'],
				'form-action': ['self']
			}
		}
	}
};

export default config;
