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

test('"How?" shows the install steps, or the browser install button when offered', async ({ page }) => {
	await page.goto('/welcome');
	await page.getByLabel('Español').check();
	await page.getByRole('button', { name: '¿Cómo?' }).click();
	const sheet = page.getByRole('dialog', { name: 'Instala Qadrant' });
	await expect(sheet.getByRole('listitem')).not.toHaveCount(0);
	await sheet.getByRole('button', { name: 'Entendido' }).click();
	await expect(sheet).toBeHidden();

	// What Chrome sends when the app can be installed.
	await page.evaluate(() => {
		const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
			prompt: async () => {
				(window as unknown as { prompted: boolean }).prompted = true;
			},
			userChoice: Promise.resolve({ outcome: 'accepted' })
		});
		dispatchEvent(event);
	});
	await page.getByRole('button', { name: '¿Cómo?' }).click();
	await sheet.getByRole('button', { name: 'Instalar ahora' }).click();
	await expect.poll(() => page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(true);
	await page.evaluate(() => dispatchEvent(new Event('appinstalled')));
	await expect(page.getByRole('button', { name: '¿Cómo?' })).toHaveCount(0);
});
