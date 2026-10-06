import { expect, test } from '@playwright/test';
import { startApp } from './helpers';

test('works offline with the service worker active: reload, capture and detail', async ({ page, context, browserName }) => {
	// Playwright's WebKit stops with an internal error when it reloads offline under a service worker.
	test.skip(browserName === 'webkit', 'offline reload not supported by Playwright WebKit');
	await startApp(page);
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
	});
	// The first load is not controlled yet; a reload puts the page under the service worker.
	await page.reload();
	await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

	await context.setOffline(true);
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Hoy', level: 1 })).toBeVisible();

	// Classification runs in the worker, which also comes from the precache.
	await page.getByRole('button', { name: '¿Qué tienes en mente?' }).click();
	const sheet = page.getByRole('dialog', { name: 'Nueva tarea' });
	await sheet.getByRole('textbox', { name: 'Tarea' }).fill('Mirar cursos de inglés');
	await sheet.getByRole('textbox', { name: 'Tarea' }).press('Enter');
	await sheet.getByRole('button', { name: /No, no lo es/ }).click();
	await expect(page.getByRole('region', { name: 'Eliminar' }).getByRole('link', { name: 'Mirar cursos de inglés' })).toBeVisible();

	// Deep links work offline too (SPA fallback from the precache).
	await page.getByRole('link', { name: 'Mirar cursos de inglés' }).click();
	await expect(page).toHaveURL(/\/task\//);
	await page.reload();
	await expect(page.getByText('POR QUÉ ESTÁ EN ELIMINAR')).toBeVisible();
	await expect(page.getByText('Respondiste que no es importante.')).toBeVisible();
	await context.setOffline(false);
});
