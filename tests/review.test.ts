import { expect, test } from '@playwright/test';
import { startApp } from './helpers';

test('the weekly review shows the week by quadrant and what waits in Programar', async ({ page }) => {
	// Three weeks ago: an important task without a date goes to Programar.
	await page.clock.setFixedTime(new Date('2026-09-16T10:00:00+02:00'));
	await startApp(page);
	await page.getByRole('button', { name: '¿Qué tienes en mente?' }).click();
	const sheet = page.getByRole('dialog', { name: 'Nueva tarea' });
	await sheet.getByRole('textbox', { name: 'Tarea' }).fill('Preparar la propuesta de ventas');
	await sheet.getByRole('button', { name: /Sí, es importante/ }).click();
	await expect(sheet).toBeHidden();

	// Today (a Wednesday): nothing in the agenda this week, so only the waiting task shows.
	await page.clock.setFixedTime(new Date('2026-10-07T10:00:00+02:00'));
	await page.reload();
	await page.getByRole('link', { name: 'Agenda' }).click();
	const review = page.getByRole('region', { name: 'Revisión semanal' });
	await expect(review.getByRole('link', { name: 'Preparar la propuesta de ventas · 3 semanas' })).toBeVisible();
	await expect(review.getByText('Horas en la agenda esta semana')).toBeHidden();

	// A task with a time tomorrow counts in Hacer.
	await page.getByRole('link', { name: 'Matriz' }).click();
	await page.getByRole('button', { name: '¿Qué tienes en mente?' }).click();
	await sheet.getByRole('textbox', { name: 'Tarea' }).fill('Llamar al taller mañana, media hora');
	await expect(sheet.getByText('Va a', { exact: true })).toBeVisible();
	await sheet.getByRole('button', { name: 'Guardar' }).click();
	await page.getByRole('link', { name: 'Agenda' }).click();
	await expect(review.getByText('Horas en la agenda esta semana')).toBeVisible();
	await expect(review.getByRole('term')).toHaveText(['Hacer', 'Programar', 'Delegar', 'Eliminar']);
	await expect(review.getByRole('definition')).toHaveText(['30 min', '–', '–', '–']);
});
