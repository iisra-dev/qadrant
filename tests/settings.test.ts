import { expect, test } from '@playwright/test';
import { MAIN_GOAL, openGroup, startApp } from './helpers';

test('people added in settings turn assignments into Delegar', async ({ page }) => {
	await startApp(page);
	await page.getByRole('link', { name: 'Ajustes' }).click();
	await expect(page.getByRole('textbox', { name: 'Objetivo 1' })).toHaveValue('Ventas Q4');
	await openGroup(page, 'Personas para delegar');
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
	await openGroup(page, 'Urgencia y horario');
	await page.getByRole('button', { name: 'Un día más' }).click();
	await expect(page.locator('output')).toContainText('3 días');

	await page.getByLabel('Día no laborable').fill('2026-12-24');
	await page.getByRole('button', { name: '+ Añadir', exact: true }).click();
	await expect(page.getByText('jue 24 dic 2026')).toBeVisible();
	await page.getByRole('button', { name: 'Quitar jue 24 dic' }).click();
	await expect(page.getByText('jue 24 dic 2026')).toBeHidden();

	await openGroup(page, 'Apariencia');
	await page.getByLabel('Oscuro').check();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	// Leaving and coming back reads the stored settings, so the write has landed.
	await page.getByRole('link', { name: 'Matriz' }).click();
	await page.getByRole('link', { name: 'Ajustes' }).click();
	await openGroup(page, 'Apariencia');
	await expect(page.getByLabel('Oscuro')).toBeChecked();
	await page.reload();
	await openGroup(page, 'Apariencia');
	await expect(page.getByLabel('Oscuro')).toBeChecked();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await page.getByLabel('Sistema').check();
	await expect(page.locator('html')).not.toHaveAttribute('data-theme');
});

test('deleting all data needs two confirmations and returns to the welcome', async ({ page }) => {
	await startApp(page);
	await page.getByRole('link', { name: 'Ajustes' }).click();
	await openGroup(page, 'Datos');
	await page.getByRole('button', { name: 'Borrar todos los datos' }).click();
	const dialog = page.getByRole('dialog', { name: 'Borrar todos los datos' });
	await dialog.getByRole('button', { name: 'Continuar' }).click();
	const confirm = dialog.getByRole('button', { name: 'Borrar todo' });
	await expect(confirm).toBeDisabled();
	await dialog.getByLabel('Escribe BORRAR para confirmar.').fill('borrar');
	await confirm.click();
	await expect(page).toHaveURL(/\/welcome$/);
	// Settings are gone too, so the app is back to its default language.
	await expect(page.getByRole('textbox', { name: MAIN_GOAL.en })).toHaveValue('');
});

test('exports and imports tasks as JSON', async ({ page }) => {
	await startApp(page);
	await page.getByRole('button', { name: '¿Qué tienes en mente?' }).click();
	const sheet = page.getByRole('dialog', { name: 'Nueva tarea' });
	await sheet.getByRole('textbox', { name: 'Tarea' }).fill('Llamar al taller hoy');
	await expect(sheet.getByText('VA A')).toBeVisible();
	await sheet.getByRole('button', { name: 'Guardar' }).click();

	await page.getByRole('link', { name: 'Ajustes' }).click();
	await openGroup(page, 'Datos');
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Exportar tareas' }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toMatch(/^qadrant-\d{4}-\d{2}-\d{2}\.json$/);
	const path = await download.path();
	const { readFileSync } = await import('node:fs');
	const data = JSON.parse(readFileSync(path, 'utf8'));
	expect(data.version).toBe(1);
	expect(data.tasks[0].title).toBe('Llamar al taller');
	expect(data.settings).not.toHaveProperty('theme');

	// Same file again: nothing new.
	await page.getByLabel('Fichero para importar').setInputFiles(path);
	await expect(page.getByRole('status').filter({ hasText: 'Importado' })).toHaveText(/0 nuevos, 0 actualizados/);

	// A new task from another device appears in the Matrix.
	data.tasks.push({ ...data.tasks[0], id: crypto.randomUUID(), title: 'Tarea de otro dispositivo' });
	await page.getByLabel('Fichero para importar').setInputFiles({
		name: 'otra.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(data))
	});
	await expect(page.getByRole('status').filter({ hasText: 'Importado' })).toHaveText(/1 nuevos/);
	await page.getByRole('link', { name: 'Matriz' }).click();
	await expect(page.getByRole('region', { name: 'Hacer' }).getByRole('link', { name: 'Tarea de otro dispositivo' })).toBeVisible();
});

test('the footer links the licenses and the author', async ({ page, request }) => {
	await startApp(page);
	await page.getByRole('link', { name: 'Ajustes', exact: true }).click();
	await expect(page.getByRole('link', { name: 'Licencias de terceros' })).toHaveAttribute('href', '/licenses.txt');
	await expect(page.getByRole('link', { name: 'Autor: iisra-dev en GitHub' })).toHaveAttribute('href', 'https://github.com/iisra-dev');
	const licenses = await (await request.get('/licenses.txt')).text();
	expect(licenses).toContain('onnxruntime-web');
	expect(licenses).toContain('paraphrase-multilingual-MiniLM-L12-v2');
});
