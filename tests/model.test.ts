import { expect, test } from '@playwright/test';
import { openGroup, startApp } from './helpers';

// Phase 2: the model downloads to OPFS, opens in the worker (WASM in headless
// Chromium) and classifies. Needs a build with static/models (pnpm model:prepare).
test('downloads the model, classifies with it and deletes it', async ({ page, request }) => {
	test.skip(!(await request.get('/models/manifest.json')).ok(), 'build without the model');
	test.setTimeout(180_000);
	await page.clock.setFixedTime(new Date('2026-10-02T10:00:00+02:00'));
	await startApp(page, 'Cerrar las ventas del trimestre', 'es', { model: true });

	await page.getByRole('link', { name: 'Ajustes', exact: true }).click();
	await openGroup(page, 'Asistente');
	await expect(page.getByRole('status').filter({ hasText: 'Listo' })).toBeVisible({ timeout: 150_000 });
	await expect(page.getByText('WASM', { exact: true })).toBeVisible();

	await page.getByRole('link', { name: 'Matriz', exact: true }).click();
	await page.getByRole('button', { name: '¿Qué tienes en mente?' }).click();
	const sheet = page.getByRole('dialog', { name: 'Nueva tarea' });
	await sheet.getByRole('textbox', { name: 'Tarea' }).fill('Llamar al cliente para cerrar la venta mañana');
	// With the model the importance line shows a percentage instead of "Sin asistente".
	await expect(sheet.getByText(/\d+ % · objetivo «Cerrar las ventas del trimestre»/)).toBeVisible();
	await expect(sheet.getByRole('button', { name: 'Hacer', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await sheet.getByRole('button', { name: 'Guardar en Hacer' }).click();

	await page.getByRole('link', { name: 'Ajustes', exact: true }).click();
	await openGroup(page, 'Asistente');
	await page.getByRole('button', { name: 'Borrar el modelo' }).click();
	await page.getByRole('dialog', { name: 'Borrar el modelo' }).getByRole('button', { name: 'Borrar el modelo' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'No descargado' })).toBeVisible();
	await expect(page.getByText('Reglas', { exact: true })).toBeVisible();
});
