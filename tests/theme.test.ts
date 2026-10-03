import { expect, test } from '@playwright/test';

test('uses the light theme by default', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'light' });
	await page.goto('/');
	await expect(page.locator('html')).not.toHaveAttribute('data-theme');
	await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(250, 249, 246)');
});

test('follows the system dark scheme', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto('/');
	await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(9, 13, 22)');
});

test('applies the saved theme before the app starts', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'light' });
	await page.addInitScript(() => localStorage.setItem('cuadrante.theme', 'dark'));
	// Block the app bundle: only the inline script in app.html can set the theme.
	await page.route('**/_app/**', (route) => route.abort());
	await page.goto('/');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', '#090D16');
});

test('a saved theme overrides the system scheme', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.addInitScript(() => localStorage.setItem('cuadrante.theme', 'light'));
	await page.goto('/');
	await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(250, 249, 246)');
});

test('serves the fonts from our origin', async ({ page }) => {
	const external: string[] = [];
	page.on('request', (request) => {
		if (!request.url().startsWith('http://localhost:4173')) external.push(request.url());
	});
	await page.goto('/');
	const loaded = await page.evaluate(async () => {
		const faces = await Promise.all([
			document.fonts.load('700 16px "Bricolage Grotesque"'),
			document.fonts.load('400 16px "IBM Plex Sans"'),
			document.fonts.load('500 16px "IBM Plex Mono"')
		]);
		return faces.map((list) => list.length);
	});
	expect(loaded).toEqual([1, 1, 1]);
	expect(external).toEqual([]);
});
