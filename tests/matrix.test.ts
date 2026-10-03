import { expect, test, type Page } from '@playwright/test';
import { startApp } from './helpers';

async function openCapture(page: Page) {
	await startApp(page);
	await page.getByRole('button', { name: '¿Qué tienes en mente?' }).click();
	return page.getByRole('dialog', { name: 'Nueva tarea' });
}

function quadrant(page: Page, name: string) {
	return page.getByRole('region', { name });
}

test('captures a task, shows the proposal and saves it in Hacer', async ({ page }) => {
	const sheet = await openCapture(page);
	await expect(sheet.getByRole('textbox', { name: 'Tarea' })).toBeFocused();
	await sheet.getByRole('textbox', { name: 'Tarea' }).fill('Llamar al taller hoy, media hora');
	await expect(sheet.getByText('VA A')).toBeVisible();
	await expect(sheet.getByText('Sí · vence')).toBeVisible();
	await expect(sheet.getByText('30 min')).toBeVisible();
	await expect(sheet.getByRole('button', { name: 'Hacer' })).toHaveAttribute('aria-pressed', 'true');
	await sheet.getByRole('button', { name: 'Guardar' }).click();
	await expect(sheet).toBeHidden();
	await expect(quadrant(page, 'Hacer').getByRole('link', { name: 'Llamar al taller' })).toBeVisible();
});

test('Enter saves and a doubt is asked instead of saving', async ({ page }) => {
	const sheet = await openCapture(page);
	const field = sheet.getByRole('textbox', { name: 'Tarea' });
	await field.fill('Mirar cursos de inglés');
	await field.press('Enter');
	await expect(sheet.getByText('NO LO TENGO CLARO')).toBeVisible();
	await expect(sheet.getByText('¿Te acerca a alguno de tus objetivos?')).toBeVisible();
	await sheet.getByRole('button', { name: /Sí, es importante.*va a Programar/ }).click();
	await expect(sheet).toBeHidden();
	await expect(quadrant(page, 'Programar').getByRole('link', { name: 'Mirar cursos de inglés' })).toBeVisible();
});

test('adding a date from the doubt recalculates the proposal', async ({ page }) => {
	const sheet = await openCapture(page);
	await sheet.getByRole('textbox', { name: 'Tarea' }).fill('Revisar el contrato');
	await sheet.getByRole('button', { name: 'Añadir fecha' }).click();
	const tomorrow = new Date(Date.now() + 86_400_000);
	const key = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
	await sheet.getByLabel('Fecha límite').fill(key);
	await expect(sheet.getByText('VA A')).toBeVisible();
	await sheet.getByRole('button', { name: 'Guardar' }).click();
	await expect(quadrant(page, 'Hacer').getByRole('link', { name: 'Revisar el contrato' })).toBeVisible();
});

test('choosing a quadrant by hand from the doubt', async ({ page }) => {
	const sheet = await openCapture(page);
	await sheet.getByRole('textbox', { name: 'Tarea' }).fill('Ordenar marcadores del navegador');
	await sheet.getByRole('button', { name: 'Elegir cuadrante a mano' }).click();
	await sheet.getByRole('group', { name: 'Elegir cuadrante' }).getByRole('button', { name: 'Eliminar' }).click();
	await sheet.getByRole('button', { name: 'Guardar' }).click();
	await expect(quadrant(page, 'Eliminar').getByRole('link', { name: 'Ordenar marcadores del navegador' })).toBeVisible();
});

test('corrects the quadrant in the detail and explains it', async ({ page }) => {
	const sheet = await openCapture(page);
	await sheet.getByRole('textbox', { name: 'Tarea' }).fill('Llamar al taller hoy');
	await expect(sheet.getByText('VA A')).toBeVisible();
	await sheet.getByRole('button', { name: 'Guardar' }).click();
	await quadrant(page, 'Hacer').getByRole('link', { name: 'Llamar al taller' }).click();
	await expect(page).toHaveURL(/\/task\//);
	await expect(page.getByText('POR QUÉ ESTÁ EN HACER')).toBeVisible();
	await expect(page.getByText(/Sin asistente, va a Hacer/)).toBeVisible();
	await page.getByRole('group', { name: 'Cuadrante' }).getByRole('button', { name: 'Delegar' }).click();
	await expect(page.getByText('POR QUÉ ESTÁ EN DELEGAR')).toBeVisible();
	await expect(page.getByText('Lo moviste tú.')).toBeVisible();
	await page.getByRole('button', { name: 'Volver' }).click();
	await expect(quadrant(page, 'Delegar').getByRole('link', { name: 'Llamar al taller' })).toBeVisible();
});

test('completes a task from the matrix', async ({ page }) => {
	const sheet = await openCapture(page);
	await sheet.getByRole('textbox', { name: 'Tarea' }).fill('Pagar recibo, venció ayer');
	await expect(sheet.getByText('VA A')).toBeVisible();
	await sheet.getByRole('button', { name: 'Guardar' }).click();
	const hacer = quadrant(page, 'Hacer');
	await expect(hacer.getByText('Vencida')).toBeVisible();
	await hacer.getByRole('checkbox', { name: 'Completar: Pagar recibo' }).check();
	await expect(hacer.getByRole('link', { name: /Pagar recibo/ })).toBeHidden();
	await expect(hacer.getByText('Nada urgente. Buen momento para Programar.')).toBeVisible();
});

test('archives Eliminar with confirmation and undo', async ({ page }) => {
	const sheet = await openCapture(page);
	await sheet.getByRole('textbox', { name: 'Tarea' }).fill('Ver webinar sin agenda');
	await sheet.getByRole('button', { name: 'Elegir cuadrante a mano' }).click();
	await sheet.getByRole('group', { name: 'Elegir cuadrante' }).getByRole('button', { name: 'Eliminar' }).click();
	await sheet.getByRole('button', { name: 'Guardar' }).click();
	const eliminar = quadrant(page, 'Eliminar');
	await eliminar.getByRole('button', { name: 'Archivar' }).click();
	await page.getByRole('dialog', { name: 'Archivar tareas' }).getByRole('button', { name: 'Archivar' }).click();
	await expect(eliminar.getByRole('link', { name: 'Ver webinar sin agenda' })).toBeHidden();
	await page.getByRole('button', { name: 'Deshacer' }).click();
	await expect(eliminar.getByRole('link', { name: 'Ver webinar sin agenda' })).toBeVisible();
});
