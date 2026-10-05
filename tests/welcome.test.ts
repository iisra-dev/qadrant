import { expect, test } from '@playwright/test';
import { MAIN_GOAL, startApp } from './helpers';

test('first run asks for a goal, saves it and is shown only once', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/welcome$/);
	await page.getByLabel('Español').check();
	await page.getByRole('button', { name: 'Empezar' }).click();
	await expect(page.getByRole('alert')).toHaveText('Escribe al menos un objetivo.');
	await expect(page.getByRole('textbox', { name: MAIN_GOAL.es })).toBeFocused();

	await page.getByRole('textbox', { name: MAIN_GOAL.es }).fill('Ventas Q4');
	// More goals only on request.
	await expect(page.getByRole('textbox', { name: 'Objetivo 2' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Añadir otro objetivo' }).click();
	await expect(page.getByRole('textbox', { name: 'Objetivo 2' })).toBeFocused();
	await page.getByRole('textbox', { name: 'Objetivo 2' }).fill('Aprobar la oposición');
	await page.getByRole('button', { name: 'Empezar' }).click();
	await expect(page).toHaveURL(/\/$/);

	await page.reload();
	await expect(page.getByRole('heading', { name: 'Hoy', level: 1 })).toBeVisible();
	await page.goto('/welcome');
	await expect(page).toHaveURL(/\/$/);
});

test('helper completes the welcome', async ({ page }) => {
	await startApp(page);
});
