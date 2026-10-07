import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { openGroup, startApp } from './helpers';
import { startSyncServer, SYNC_KEY, type FakeSyncServer } from './support/sync-server';

// Two browser contexts are two devices; the fake server is shared (docs/06, phase 4).
// Chromium only: the WebKit run (pnpm test:e2e:webkit) shares the host network
// but not this process's certificate trust.

test.skip(({ browserName }) => browserName !== 'chromium', 'The fake server runs in this process (Chromium project only)');

let server: FakeSyncServer;

test.beforeEach(async () => {
	server = await startSyncServer();
});

test.afterEach(async () => {
	await server.close();
});

async function newDevice(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
	const context = await browser.newContext({
		baseURL: 'http://localhost:4173',
		locale: 'es-ES',
		timezoneId: 'Europe/Madrid',
		viewport: { width: 390, height: 844 },
		ignoreHTTPSErrors: true
	});
	return { context, page: await context.newPage() };
}

/** The row of a task in the Matrix (the "Siguiente" pill may name it too). */
function taskRow(page: Page, title: string) {
	return page.locator('a[href^="/task/"]', { hasText: title });
}

async function addTask(page: Page, text: string) {
	await page.getByRole('button', { name: '¿Qué tienes en mente?' }).click();
	const sheet = page.getByRole('dialog', { name: 'Nueva tarea' });
	await sheet.getByRole('textbox', { name: 'Tarea' }).fill(text);
	await expect(sheet.getByText('Va a', { exact: true })).toBeVisible();
	await sheet.getByRole('button', { name: 'Guardar' }).click();
	await expect(sheet).toBeHidden();
}

/** Settings > Servidor propio: connect and turn sync on. */
async function connectAndSync(page: Page) {
	await page.getByRole('link', { name: 'Ajustes' }).click();
	await openGroup(page, 'Servidor propio');
	await page.getByLabel('Dirección').fill(server.url);
	await page.getByLabel('Clave de acceso').fill(SYNC_KEY);
	await page.getByRole('button', { name: 'Conectar' }).click();
	await expect(page.getByText(server.url)).toBeVisible();
	await page.getByLabel('Sincronizar mis tareas').check();
	await expect(page.getByText(/^Sincronizado (ahora mismo|hace)/)).toBeVisible();
	await expect(page.getByText('Tus tareas se guardan en este dispositivo y en tu servidor.')).toBeVisible();
}

/** The welcome's "Ya uso Qadrant en otro dispositivo". */
async function joinFromWelcome(page: Page) {
	await page.goto('/');
	await expect(page).toHaveURL(/\/welcome$/);
	await page.getByLabel('Español').check();
	await page.getByLabel('Descargar cuando haya wifi').uncheck();
	await page.getByRole('button', { name: 'Ya uso Qadrant en otro dispositivo' }).click();
	await page.getByLabel('Dirección').fill(server.url);
	await page.getByLabel('Clave de acceso').fill(SYNC_KEY);
	await page.getByRole('button', { name: 'Conectar y sincronizar' }).click();
	await expect(page.getByRole('heading', { name: 'Hoy', level: 1 })).toBeVisible();
}

test('a second device joins from the welcome and sees completions from the first', async ({ browser }) => {
	const phone = await newDevice(browser);
	await startApp(phone.page, 'Ventas Q4');
	await addTask(phone.page, 'Llamar al taller mañana, media hora');
	await connectAndSync(phone.page);

	const laptop = await newDevice(browser);
	await joinFromWelcome(laptop.page);
	// No goal asked: the one from the phone came down with the tasks.
	await expect(taskRow(laptop.page, 'Llamar al taller')).toBeVisible();
	await laptop.page.getByRole('link', { name: 'Ajustes' }).click();
	await expect(laptop.page.getByRole('textbox', { name: 'Objetivo 1' })).toHaveValue('Ventas Q4');
	await laptop.page.getByRole('link', { name: 'Matriz' }).click();

	// Completed on the phone, it shows up on the open laptop on its own (SSE).
	await phone.page.getByRole('link', { name: 'Matriz' }).click();
	await phone.page.getByRole('checkbox', { name: 'Completar: Llamar al taller' }).check();
	await expect(laptop.page.getByRole('checkbox', { name: 'Completar: Llamar al taller' })).toBeChecked();

	await phone.context.close();
	await laptop.context.close();
});

test('offline edits on two devices are merged field by field', async ({ browser }) => {
	const phone = await newDevice(browser);
	await startApp(phone.page, 'Ventas Q4');
	await addTask(phone.page, 'Revisar el contrato mañana, media hora');
	await connectAndSync(phone.page);
	const laptop = await newDevice(browser);
	await joinFromWelcome(laptop.page);
	await expect(taskRow(laptop.page, 'Revisar el contrato')).toBeVisible();

	await phone.context.setOffline(true);
	await laptop.context.setOffline(true);
	await phone.page.getByRole('link', { name: 'Matriz' }).click();
	await phone.page.getByRole('checkbox', { name: 'Completar: Revisar el contrato' }).check();
	await taskRow(laptop.page, 'Revisar el contrato').click();
	await laptop.page.getByLabel('Notas').fill('Cláusula de permanencia');
	await laptop.page.getByLabel('Notas').blur();
	await expect(laptop.page.getByText('Guardado')).toBeVisible();

	await phone.context.setOffline(false);
	await laptop.context.setOffline(false);
	// Both changes survive on both devices.
	await expect(laptop.page.getByRole('button', { name: 'Marcar como pendiente' })).toBeVisible({ timeout: 15_000 });
	await expect(laptop.page.getByLabel('Notas')).toHaveValue('Cláusula de permanencia');
	await taskRow(phone.page, 'Revisar el contrato').click();
	await expect(phone.page.getByLabel('Notas')).toHaveValue('Cláusula de permanencia', { timeout: 15_000 });
	await expect(phone.page.getByRole('button', { name: 'Marcar como pendiente' })).toBeVisible();

	await phone.context.close();
	await laptop.context.close();
});

test('only one tab per device talks to the server, and another takes over when it closes', async ({ browser }) => {
	const device = await newDevice(browser);
	await startApp(device.page, 'Ventas Q4');
	await connectAndSync(device.page);
	await expect.poll(() => server.streams()).toBe(1);

	const second = await device.context.newPage();
	await second.goto('/');
	await expect(second.getByRole('heading', { name: 'Hoy', level: 1 })).toBeVisible();
	await addTask(second, 'Pagar recibo mañana, media hora');
	// The second tab writes; the first one uploads it.
	await expect.poll(() => [...server.state.records.values()].some((r) => r.content.includes('Pagar recibo'))).toBe(true);
	expect(server.streams()).toBe(1);

	await device.page.close();
	await expect.poll(() => server.streams(), { timeout: 10_000 }).toBe(1);
	await addTask(second, 'Llamar a Ana mañana, media hora');
	await expect.poll(() => [...server.state.records.values()].some((r) => r.content.includes('Llamar a Ana'))).toBe(true);

	await device.context.close();
});

test('says when the server does not sync', async ({ browser }) => {
	await server.close();
	server = await startSyncServer({ apiVersion: 1 });
	const device = await newDevice(browser);
	await startApp(device.page, 'Ventas Q4');
	await device.page.getByRole('link', { name: 'Ajustes' }).click();
	await openGroup(device.page, 'Servidor propio');
	await device.page.getByLabel('Dirección').fill(server.url);
	await device.page.getByLabel('Clave de acceso').fill(SYNC_KEY);
	await device.page.getByRole('button', { name: 'Conectar' }).click();
	await expect(device.page.getByText('Este servidor no sincroniza. Actualízalo a la última versión para sincronizar tus tareas.')).toBeVisible();
	await expect(device.page.getByLabel('Sincronizar mis tareas')).toBeDisabled();
	await device.context.close();
});
