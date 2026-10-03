import { expect, test } from '@playwright/test';
import { startApp } from './helpers';

// Monday 5 Oct 2026, 10:00 in Madrid: inside working hours, so the result does not depend on the real clock.
test.beforeEach(async ({ page }) => {
	await page.clock.setFixedTime(new Date('2026-10-05T10:00:00+02:00'));
});

test('the capture proposes a slot, saves it and the Matrix shows "Siguiente"', async ({ page }) => {
	await startApp(page);
	await page.getByRole('button', { name: '¿Qué tienes en mente?' }).click();
	const sheet = page.getByRole('dialog', { name: 'Nueva tarea' });
	await sheet.getByRole('textbox', { name: 'Tarea' }).fill('Llamar al taller hoy, 45 min');
	await expect(sheet.getByText('Hoy 10:00 · 45 min')).toBeVisible();
	await sheet.getByRole('button', { name: 'Guardar' }).click();
	const pill = page.getByRole('link', { name: 'Siguiente: Llamar al taller · 10:00' });
	await expect(pill).toBeVisible();
	await pill.click();
	await expect(page).toHaveURL(/\/agenda$/);
	await expect(page.getByRole('link', { name: /Llamar al taller/ })).toContainText('Hacer · 45 min');
});

test('"Buscarles hueco" schedules tasks without a time into a focus block', async ({ page }) => {
	await startApp(page);
	// A task moved to Programar by hand has no time yet.
	await page.getByRole('button', { name: '¿Qué tienes en mente?' }).click();
	const sheet = page.getByRole('dialog', { name: 'Nueva tarea' });
	await sheet.getByRole('textbox', { name: 'Tarea' }).fill('Estudiar el tema 4, una hora');
	await sheet.getByRole('button', { name: 'Elegir cuadrante a mano' }).click();
	await sheet.getByRole('group', { name: 'Elegir cuadrante' }).getByRole('button', { name: 'Eliminar' }).click();
	await sheet.getByRole('button', { name: 'Guardar' }).click();
	await page.getByRole('link', { name: 'Estudiar el tema 4' }).click();
	await page.getByRole('group', { name: 'Cuadrante' }).getByRole('button', { name: 'Programar' }).click();
	await page.getByRole('button', { name: 'Volver' }).click();

	await page.getByRole('link', { name: 'Agenda' }).click();
	const pending = page.getByRole('region', { name: 'Sin hueco todavía' });
	await expect(pending.getByRole('link', { name: /Estudiar el tema 4/ })).toBeVisible();
	await pending.getByRole('button', { name: 'Buscarles hueco' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Colocada' })).toHaveText('Colocada 1 tarea.');
	const block = page.getByRole('link', { name: /BLOQUE DE FOCO/ });
	await expect(block).toContainText('Estudiar el tema 4');
	await expect(block).toContainText('Programar · 1 h');
	await expect(page.getByText('10:00')).toBeVisible();
	await expect(pending.getByText('Todas las tareas de Hacer y Programar tienen hora.')).toBeVisible();
});
