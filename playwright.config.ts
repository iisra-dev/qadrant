import { defineConfig, devices } from '@playwright/test';

// Mobile first: both projects use a 390 x 844 phone; tests/web.test.ts switches
// to a desktop viewport. WebKit stands in for Safari on iPhone, where the app is
// used most (memory, OPFS, icons); it runs in the official Playwright container
// on hosts that lack its libraries (pnpm test:e2e:webkit, docs/07).
const phone = { viewport: { width: 390, height: 844 } };

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
		timezoneId: 'Europe/Madrid'
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...phone } },
		{ name: 'webkit', use: { ...devices['iPhone 13'], ...phone } }
	]
});
