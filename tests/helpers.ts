import { expect, type Page } from '@playwright/test';

/**
 * Completes the first-run welcome and lands on the Matrix. The app starts in
 * English; most tests are written in Spanish, so they pick it on the welcome.
 */
export async function startApp(page: Page, goal = 'Ventas Q4', lang: 'en' | 'es' = 'es') {
	await page.goto('/');
	await expect(page).toHaveURL(/\/welcome$/);
	if (lang === 'es') await page.getByLabel('Español').check();
	await page.getByRole('textbox', { name: lang === 'es' ? 'Objetivo 1' : 'Goal 1' }).fill(goal);
	await page.getByRole('button', { name: lang === 'es' ? 'Empezar' : 'Start' }).click();
	await expect(page.getByRole('heading', { name: lang === 'es' ? 'Hoy' : 'Today', level: 1 })).toBeVisible();
}
