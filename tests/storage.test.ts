import { expect, test } from '@playwright/test';
import { startApp } from './helpers';

test('runs in memory and says so when the browser blocks its storage', async ({ page }) => {
	// Like blocked site data: every IndexedDB open is refused.
	await page.addInitScript(() => {
		IDBFactory.prototype.open = () => {
			throw new DOMException('The operation is insecure.', 'SecurityError');
		};
	});
	await startApp(page);
	await expect(page.getByRole('status').filter({ hasText: 'solo duran hasta que cierres la app' })).toBeVisible();
	await expect(page.getByRole('alert')).toBeHidden();

	await page.getByRole('button', { name: '¿Qué tienes en mente?' }).click();
	const sheet = page.getByRole('dialog', { name: 'Nueva tarea' });
	await sheet.getByRole('textbox', { name: 'Tarea' }).fill('Llamar al taller mañana');
	await sheet.getByRole('button', { name: 'Guardar en Hacer' }).click();
	await expect(page.getByRole('region', { name: 'Hacer' }).getByRole('link', { name: 'Llamar al taller' })).toBeVisible();
});

test('shows no memory notice when the storage works', async ({ page }) => {
	await startApp(page);
	await expect(page.getByText('solo duran hasta que cierres la app')).toBeHidden();
});
