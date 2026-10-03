import { expect, test } from '@playwright/test';
import { startApp } from './helpers';

test.beforeEach(async ({ page }) => {
	await page.clock.setFixedTime(new Date('2026-10-02T10:00:00+02:00')); // Friday
});

test('an assignment waits on others with a follow-up date', async ({ page }) => {
	await startApp(page);
	await page.getByRole('link', { name: 'Ajustes' }).click();
	await page.getByRole('textbox', { name: 'Nueva persona' }).fill('Luis');
	await page.getByRole('button', { name: '+ Añadir persona' }).click();
	await expect(page.getByRole('textbox', { name: 'Nombre' })).toHaveValue('Luis');
	await page.getByRole('link', { name: 'Matriz' }).click();

	await page.getByRole('button', { name: '¿Qué tienes en mente?' }).click();
	const sheet = page.getByRole('dialog', { name: 'Nueva tarea' });
	await sheet.getByRole('textbox', { name: 'Tarea' }).fill('Pedirle a Luis que compre material de oficina');
	await expect(sheet.getByText('VA A')).toBeVisible();
	await sheet.getByRole('button', { name: 'Guardar' }).click();

	await page.getByRole('link', { name: 'Agenda' }).click();
	const waiting = page.getByRole('region', { name: 'Esperando a otros' });
	// Two working days after Friday 2 Oct: Tuesday 6.
	await expect(waiting.getByRole('link')).toContainText('Luis · Pedirle a Luis que compre material de oficina');
	await expect(waiting.getByRole('link')).toContainText('Revisar mar');

	await waiting.getByRole('link').click();
	await expect(page.getByLabel('Revisar el')).toHaveValue('2026-10-06');
	await page.getByLabel('Revisar el').fill('2026-10-20');
	await page.getByLabel('Revisar el').blur();
	await page.getByRole('button', { name: 'Volver' }).click();
	await expect(waiting.getByRole('link')).toContainText('Revisar 20 oct');
});
