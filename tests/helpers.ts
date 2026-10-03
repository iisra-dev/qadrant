import { expect, type Page } from '@playwright/test';

/** Completes the first-run welcome and lands on the Matrix. */
export async function startApp(page: Page, goal = 'Ventas Q4') {
	await page.goto('/');
	await expect(page).toHaveURL(/\/welcome$/);
	await page.getByRole('textbox', { name: 'Objetivo 1' }).fill(goal);
	await page.getByRole('button', { name: 'Empezar' }).click();
	await expect(page.getByRole('heading', { name: 'Hoy', level: 1 })).toBeVisible();
}
