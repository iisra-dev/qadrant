/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig, type Plugin } from 'vite';

// ONNX Runtime and Transformers.js reference their own .wasm (≈ 27 MB, over the
// 25 MiB Pages limit). The engine loads the runtime from /ort/ in parts instead
// (scripts/prepare-ort.mjs), so the bundled copies are dropped.
const dropBundledWasm: Plugin = {
	name: 'drop-bundled-ort-wasm',
	generateBundle(_options, bundle) {
		for (const name of Object.keys(bundle)) if (/ort-wasm.*\.wasm$/.test(name)) delete bundle[name];
	}
};

export default defineConfig({
	plugins: [
		dropBundledWasm,
		sveltekit(),
		SvelteKitPWA({
			strategies: 'injectManifest',
			srcDir: 'src',
			filename: 'service-worker.ts',
			registerType: 'prompt',
			injectRegister: false,
			manifest: {
				name: 'Qadrant Calendar',
				short_name: 'Qadrant',
				description: 'An Eisenhower matrix agenda that runs on your device.',
				lang: 'en-US',
				display: 'standalone',
				start_url: '/',
				scope: '/',
				background_color: '#FAF9F6',
				theme_color: '#FAF9F6',
				icons: [
					{ src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
					{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
					{ src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
					{ src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
				]
			},
			// Precaches the adapter-static fallback (index.html) so the SPA opens offline.
			kit: { adapterFallback: 'index.html', spa: true },
			injectManifest: {
				// The runtime's small .mjs glue too, so the model works offline; its .wasm
				// and the model live in OPFS, never in the precache (docs/02).
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff2,webmanifest}', 'client/ort/*.mjs'],
				maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
			}
		})
	],
	worker: { format: 'es', plugins: () => [dropBundledWasm] },
	// Component tests mount Svelte in jsdom, which needs the browser build.
	resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
