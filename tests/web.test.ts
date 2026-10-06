import { expect, test } from '@playwright/test';
import { startApp } from './helpers';

test.use({ viewport: { width: 1280, height: 900 } });

test('web: header capture, shortcuts, side agenda and detail panel', async ({ page }) => {
	await startApp(page);
	await expect(page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Matriz' })).toHaveAttribute('aria-current', 'page');
	await expect(page.getByRole('button', { name: '¿Qué tienes en mente?' })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Agenda de hoy' })).toBeVisible();

	await page.getByRole('textbox', { name: 'Nueva tarea' }).fill('Llamar al taller hoy');
	await page.getByRole('button', { name: 'Añadir' }).click();
	const modal = page.getByRole('dialog', { name: 'Nueva tarea' });
	await expect(modal.getByText('Va a', { exact: true })).toBeVisible();
	// 1-4 change the quadrant when the focus is not in the text field.
	await modal.getByRole('button', { name: 'Cerrar' }).focus();
	await page.keyboard.press('2');
	await expect(modal.getByRole('button', { name: 'Programar', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(modal.getByRole('button', { name: 'Guardar en Programar' })).toBeVisible();
	await modal.getByRole('textbox', { name: 'Tarea' }).press('Enter');
	await expect(modal).toBeHidden();

	await page.getByRole('region', { name: 'Programar' }).getByRole('link', { name: 'Llamar al taller' }).click();
	const panel = page.getByRole('dialog', { name: 'Detalle de tarea' });
	await expect(panel.getByText('POR QUÉ ESTÁ EN PROGRAMAR')).toBeVisible();
	await expect(page).toHaveURL(/\/task\//);
	await page.keyboard.press('Escape');
	await expect(panel).toBeHidden();
	await expect(page).toHaveURL(/\/$/);
});

test('web: Esc closes the capture modal', async ({ page }) => {
	await startApp(page);
	await page.getByRole('textbox', { name: 'Nueva tarea' }).fill('Algo');
	await page.getByRole('textbox', { name: 'Nueva tarea' }).press('Enter');
	const modal = page.getByRole('dialog', { name: 'Nueva tarea' });
	await expect(modal).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(modal).toBeHidden();
});
