import { expect, test } from '@playwright/test';
import { startApp } from './helpers';

test('suggests archiving Eliminar tasks untouched for 14 days', async ({ page }) => {
	await page.clock.setFixedTime(new Date('2026-10-02T10:00:00+02:00'));
	await startApp(page);
	await page.getByRole('button', { name: '¿Qué tienes en mente?' }).click();
	const sheet = page.getByRole('dialog', { name: 'Nueva tarea' });
	await sheet.getByRole('textbox', { name: 'Tarea' }).fill('Ordenar marcadores del navegador');
	await sheet.getByRole('button', { name: /No, no lo es/ }).click();
	const eliminar = page.getByRole('region', { name: 'Eliminar' });
	await expect(eliminar.getByRole('link', { name: 'Ordenar marcadores del navegador' })).toBeVisible();
	await expect(eliminar.getByText(/14 días sin tocarse/)).toHaveCount(0);

	await page.clock.setFixedTime(new Date('2026-10-16T10:00:00+02:00'));
	await page.reload();
	await expect(eliminar.getByText('Una lleva 14 días sin tocarse.')).toBeVisible();
	await eliminar.getByRole('button', { name: 'Archivarla' }).click();
	await expect(eliminar.getByRole('link', { name: 'Ordenar marcadores del navegador' })).toBeHidden();
	await page.getByRole('button', { name: 'Deshacer' }).click();
	await expect(eliminar.getByRole('link', { name: 'Ordenar marcadores del navegador' })).toBeVisible();
});
