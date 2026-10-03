import { expect, test } from '@playwright/test';
import { startApp } from './helpers';

test('people added in settings turn assignments into Delegar', async ({ page }) => {
	await startApp(page);
	await page.getByRole('link', { name: 'Ajustes' }).click();
	await expect(page.getByRole('textbox', { name: 'Objetivo 1' })).toHaveValue('Ventas Q4');
	await page.getByRole('textbox', { name: 'Nueva persona' }).fill('Ana');
	await page.getByRole('button', { name: '+ Añadir persona' }).click();
	await expect(page.getByRole('textbox', { name: 'Nombre' })).toHaveValue('Ana');

	await page.getByRole('link', { name: 'Matriz' }).click();
	await page.getByRole('button', { name: '¿Qué tienes en mente?' }).click();
	const sheet = page.getByRole('dialog', { name: 'Nueva tarea' });
	await sheet.getByRole('textbox', { name: 'Tarea' }).fill('Que Ana reserve la sala');
	await expect(sheet.getByText('VA A')).toBeVisible();
	await sheet.getByRole('button', { name: 'Guardar' }).click();
	await expect(page.getByRole('region', { name: 'Delegar' }).getByRole('link', { name: /Que Ana reserve la sala · Ana/ })).toBeVisible();
});

test('urgency stepper, holidays and theme', async ({ page }) => {
	await startApp(page);
	await page.getByRole('link', { name: 'Ajustes' }).click();
	await page.getByRole('button', { name: 'Un día más' }).click();
	await expect(page.locator('output')).toContainText('3 días');

	await page.getByLabel('Día no laborable').fill('2026-12-24');
	await page.getByRole('button', { name: '+ Añadir', exact: true }).click();
	await expect(page.getByText('jue 24 dic 2026')).toBeVisible();
	await page.getByRole('button', { name: 'Quitar jue 24 dic' }).click();
	await expect(page.getByText('jue 24 dic 2026')).toBeHidden();

	await page.getByLabel('Oscuro').check();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	// Leaving and coming back reads the stored settings, so the write has landed.
	await page.getByRole('link', { name: 'Matriz' }).click();
	await page.getByRole('link', { name: 'Ajustes' }).click();
	await expect(page.getByLabel('Oscuro')).toBeChecked();
	await page.reload();
	await expect(page.getByLabel('Oscuro')).toBeChecked();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await page.getByLabel('Sistema').check();
	await expect(page.locator('html')).not.toHaveAttribute('data-theme');
});

test('deleting all data needs two confirmations and returns to the welcome', async ({ page }) => {
	await startApp(page);
	await page.getByRole('link', { name: 'Ajustes' }).click();
	await page.getByRole('button', { name: 'Borrar todos los datos' }).click();
	const dialog = page.getByRole('dialog', { name: 'Borrar todos los datos' });
	await dialog.getByRole('button', { name: 'Continuar' }).click();
	const confirm = dialog.getByRole('button', { name: 'Borrar todo' });
	await expect(confirm).toBeDisabled();
	await dialog.getByLabel('Escribe BORRAR para confirmar.').fill('borrar');
	await confirm.click();
	await expect(page).toHaveURL(/\/welcome$/);
	await expect(page.getByRole('textbox', { name: 'Objetivo 1' })).toHaveValue('');
});
