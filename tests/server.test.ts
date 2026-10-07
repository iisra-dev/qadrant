import { expect, test, type Page } from '@playwright/test';
import { openGroup, startApp } from './helpers';

const SERVER = 'https://qadrant.test';
const KEY = 'clave-de-prueba';
// A valid P-256 public key (VAPID format), only used to subscribe.
const VAPID = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';

async function fakeServer(page: Page) {
	const reminders: unknown[][] = [];
	const cors = {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Headers': 'Authorization, Content-Type',
		'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE'
	};
	await page.route(`${SERVER}/**`, async (route) => {
		const request = route.request();
		if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
		if (request.headers()['authorization'] !== `Bearer ${KEY}`) return route.fulfill({ status: 401, headers: cors, json: { error: 'unauthorized' } });
		const path = new URL(request.url()).pathname;
		if (path.endsWith('/ping')) return route.fulfill({ headers: cors, json: { ok: true, version: 1 } });
		if (path.endsWith('/vapid')) return route.fulfill({ headers: cors, json: { publicKey: VAPID } });
		if (path.endsWith('/reminders') && request.method() === 'PUT') {
			reminders.push(request.postDataJSON());
			return route.fulfill({ headers: cors, json: { count: 0 } });
		}
		return route.fulfill({ status: 204, headers: cors });
	});
	return reminders;
}

test('connects to the own server and keeps its reminders in step', async ({ page, context }) => {
	await page.clock.setFixedTime(new Date('2026-10-02T10:00:00+02:00'));
	await context.grantPermissions(['notifications']);
	const reminders = await fakeServer(page);
	await startApp(page);

	await page.getByRole('link', { name: 'Ajustes' }).click();
	await openGroup(page, 'Servidor propio');
	await page.getByLabel('Dirección').fill(SERVER);
	await page.getByLabel('Clave de acceso').fill('mala');
	await page.getByRole('button', { name: 'Conectar' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'clave' })).toHaveText('La clave de acceso no es correcta.');

	await page.getByLabel('Clave de acceso').fill(KEY);
	await page.getByRole('button', { name: 'Conectar' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Conectado' })).toBeVisible();
	await expect(page.getByText(SERVER)).toBeVisible();

	await page.getByRole('link', { name: 'Matriz' }).click();
	await page.getByRole('button', { name: '¿Qué tienes en mente?' }).click();
	const sheet = page.getByRole('dialog', { name: 'Nueva tarea' });
	await sheet.getByRole('textbox', { name: 'Tarea' }).fill('Pagar recibo el lunes');
	await expect(sheet.getByText('Va a', { exact: true })).toBeVisible();
	await sheet.getByRole('button', { name: 'Guardar' }).click();

	await expect.poll(() => JSON.stringify(reminders.at(-1) ?? [])).toContain('Pagar recibo');
	expect(reminders.at(-1)).toEqual([
		{ taskId: expect.any(String), kind: 'due', at: new Date('2026-10-05T18:00:00+02:00').toISOString(), title: 'Pagar recibo' }
	]);

	// Completing the task removes its reminder from the server.
	await page.getByRole('checkbox', { name: 'Completar: Pagar recibo' }).check();
	await expect.poll(() => reminders.at(-1)).toEqual([]);
});

// The test browser has no push service and never remembers a refusal: these stand
// in for them. The subscription lives in the page, so a reload loses it.
async function fakePush(page: Page, permission: 'granted' | 'denied') {
	await page.addInitScript((state) => {
		const query = navigator.permissions.query.bind(navigator.permissions);
		navigator.permissions.query = (descriptor) =>
			descriptor.name === 'notifications' ? Promise.resolve({ state } as PermissionStatus) : query(descriptor);
		Notification.requestPermission = () => Promise.resolve(state);
		let subscription: PushSubscription | null = null;
		PushManager.prototype.getSubscription = async () => subscription;
		PushManager.prototype.subscribe = async () => {
			subscription = {
				endpoint: 'https://push.test/device',
				options: { applicationServerKey: null, userVisibleOnly: true },
				toJSON: () => ({ endpoint: 'https://push.test/device', keys: { p256dh: 'key', auth: 'auth' } }),
				unsubscribe: async () => {
					subscription = null;
					return true;
				}
			} as unknown as PushSubscription;
			return subscription;
		};
	}, permission);
}

async function connect(page: Page) {
	await startApp(page);
	await page.getByRole('link', { name: 'Ajustes' }).click();
	await openGroup(page, 'Servidor propio');
	await page.getByLabel('Dirección').fill(SERVER);
	await page.getByLabel('Clave de acceso').fill(KEY);
	await page.getByRole('button', { name: 'Conectar' }).click();
	await expect(page.getByText(SERVER)).toBeVisible();
	return page.getByRole('group', { name: 'Avisos en este dispositivo' });
}

test('says how to unblock notices when they were refused', async ({ page }) => {
	await fakeServer(page);
	await fakePush(page, 'denied');
	const notices = await connect(page);
	await expect(page.getByRole('status').filter({ hasText: 'Conectado' })).toContainText('sin permiso');
	await expect(notices).toContainText('Bloqueados');
	await expect(notices.getByRole('button', { name: 'Activar avisos' })).toBeVisible();
	await expect(page.getByText('Ajustes > Notificaciones > Qadrant')).toBeVisible();
});

test('turns notices on from Settings when this device is not subscribed', async ({ page }) => {
	await fakeServer(page);
	await fakePush(page, 'granted');
	const notices = await connect(page);
	await expect(notices).toContainText('Activados');
	await expect(notices.getByRole('button', { name: 'Activar avisos' })).toHaveCount(0);

	// Subscription lost (as when the prompt did not show on connecting): the button subscribes again.
	await page.reload();
	await openGroup(page, 'Servidor propio');
	await expect(notices).toContainText('Sin activar');
	await notices.getByRole('button', { name: 'Activar avisos' }).click();
	await expect(notices).toContainText('Activados');
});
