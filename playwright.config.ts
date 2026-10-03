import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'tests',
	// Serves build/ as a static site, like Cloudflare Pages, so the service worker behaves as deployed.
	webServer: {
		command: 'pnpm build && pnpm preview',
		port: 4173,
		reuseExistingServer: !process.env.CI
	},
	use: {
		baseURL: 'http://localhost:4173',
		locale: 'es-ES',
		timezoneId: 'Europe/Madrid',
		// Mobile first; tests/web.test.ts switches to a desktop viewport.
		viewport: { width: 390, height: 844 }
	}
});
