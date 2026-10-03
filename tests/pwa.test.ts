import { expect, test } from '@playwright/test';

test('links the manifest and registers the service worker', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest$/);
	const manifest = await (await page.request.get('/manifest.webmanifest')).json();
	expect([manifest.name, manifest.short_name]).toEqual(['Qadrant Calendar', 'Qadrant']);
	const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
	expect(scope).toMatch(/\/$/);
});

test('opens offline once the service worker is active', async ({ page, context }) => {
	await page.goto('/');
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
	});
	await context.setOffline(true);
	await page.goto('/agenda');
	await expect(page.locator('h1')).toBeVisible();
	await context.setOffline(false);
});
