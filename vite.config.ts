/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			strategies: 'injectManifest',
			srcDir: 'src',
			filename: 'service-worker.ts',
			registerType: 'prompt',
			injectRegister: false,
			manifest: {
				name: 'Cuadrante',
				short_name: 'Cuadrante',
				description: 'Agenda basada en la matriz de Eisenhower que funciona en tu dispositivo.',
				lang: 'es-ES',
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
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff2,webmanifest}']
			}
		})
	],
	// Component tests mount Svelte in jsdom, which needs the browser build.
	resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
