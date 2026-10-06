import { expect, test } from '@playwright/test';
import { startApp } from './helpers';

test('a task with a manual time appears in the day agenda', async ({ page }) => {
	await startApp(page);
	await page.getByRole('button', { name: '¿Qué tienes en mente?' }).click();
	const sheet = page.getByRole('dialog', { name: 'Nueva tarea' });
	await sheet.getByRole('textbox', { name: 'Tarea' }).fill('Llamar al taller hoy, media hora');
	await expect(sheet.getByText('Va a', { exact: true })).toBeVisible();
	await sheet.getByRole('button', { name: 'Guardar' }).click();
	await page.getByRole('region', { name: 'Hacer' }).getByRole('link', { name: 'Llamar al taller' }).click();
	const tomorrow = new Date(Date.now() + 86_400_000);
	const pad = (n: number) => String(n).padStart(2, '0');
	await page
		.getByLabel('En la agenda')
		.fill(`${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T09:00`);
	await page.getByLabel('En la agenda').blur();
	await page.getByRole('button', { name: 'Volver' }).click();

	await page.getByRole('link', { name: 'Agenda' }).click();
	await expect(page.getByText(/Nada en la agenda/)).toBeVisible();
	await page.getByRole('button', { name: 'Día siguiente' }).click();
	const block = page.getByRole('link', { name: /Llamar al taller/ });
	await expect(block).toContainText('Hacer · 30 min');
	await expect(page.getByText('09:00')).toBeVisible();
	await page.getByRole('button', { name: 'Hoy' }).click();
	await expect(page.getByText(/Nada en la agenda/)).toBeVisible();
});
