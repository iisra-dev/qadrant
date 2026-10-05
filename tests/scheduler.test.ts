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
	const next = page.getByRole('link', { name: /^10:00 45 min SIGUIENTE\s*Llamar al taller/ });
	await expect(next).toBeVisible();
	await next.click();
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
	await page.getByRole('region', { name: 'Eliminar' }).getByRole('link', { name: 'Estudiar el tema 4' }).click();
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
	// The block's time; the "Now" line shows the same hour at 10:00.
	await expect(page.getByText('10:00').first()).toBeVisible();
	await expect(pending.getByText('Todas las tareas de Hacer y Programar tienen hora.')).toBeVisible();
});

test.describe('web week view', () => {
	test.use({ viewport: { width: 1280, height: 900 } });

	test('shows the working week with today highlighted and the scheduled tasks', async ({ page }) => {
		await startApp(page);
		await page.getByRole('textbox', { name: 'Nueva tarea' }).fill('Llamar al taller hoy');
		await page.getByRole('button', { name: 'Añadir' }).click();
		const modal = page.getByRole('dialog', { name: 'Nueva tarea' });
		await expect(modal.getByText('Hoy 10:00 · 30 min')).toBeVisible();
		await modal.getByRole('textbox', { name: 'Tarea' }).press('Enter');

		await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Agenda' }).click();
		await expect(page.getByRole('heading', { name: 'Esta semana', level: 1 })).toBeVisible();
		await expect(page.getByText('5 oct – 9 oct')).toBeVisible();
		await expect(page.getByRole('group', { name: 'Vista' }).getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'true');
		const monday = page.getByRole('list', { name: 'lunes 5' });
		await expect(monday.getByRole('link', { name: /Llamar al taller/ })).toContainText('10:00 · Hacer · 30 min');
		await expect(page.getByRole('list', { name: 'sábado 10' })).toHaveCount(0);

		await page.getByRole('button', { name: 'Semana siguiente' }).click();
		await expect(page.getByRole('heading', { name: 'La semana que viene', level: 1 })).toBeVisible();
		// Monday 12 Oct is a holiday but still a weekday column.
		await expect(page.getByText('12 oct – 16 oct')).toBeVisible();

		await page.getByRole('button', { name: 'Día', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible();
	});
});
