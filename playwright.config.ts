import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'tests',
	// Runs against the production build so the service worker behaves as deployed.
	webServer: {
		command: 'pnpm build && pnpm preview --port 4173 --strictPort',
		port: 4173,
		reuseExistingServer: !process.env.CI
	},
	use: {
		baseURL: 'http://localhost:4173',
		locale: 'es-ES',
		timezoneId: 'Europe/Madrid'
	}
});
