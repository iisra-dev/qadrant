import { expect, test } from '@playwright/test';

test('home page renders without CSP violations', async ({ page }) => {
	const violations: string[] = [];
	page.on('console', (message) => {
		if (message.text().includes('Content Security Policy')) violations.push(message.text());
	});
	await page.goto('/');
	await expect(page.locator('h1')).toBeVisible();
	await expect(page.locator('meta[http-equiv="content-security-policy"]')).toHaveCount(1);
	expect(violations).toEqual([]);
});
