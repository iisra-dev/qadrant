import { expect, test } from '@playwright/test';
import { startApp } from './helpers';

const SERVER = 'https://qadrant.test';
const KEY = 'clave-de-prueba';
const cors = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'Authorization, Content-Type',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE'
};
const EVENTS = [
	{ id: 'e1', start: '2026-10-05T08:00:00Z', end: '2026-10-05T09:00:00Z', title: 'Reunión de equipo', allDay: false },
	{ id: 'e2', start: '2026-10-05', end: '2026-10-06', title: 'Cumpleaños de Ana', allDay: true }
];

test('connects a calendar through the server; the agenda shows it and the scheduler avoids it', async ({ page }) => {
	await page.clock.setFixedTime(new Date('2026-10-05T10:00:00+02:00')); // Monday
	let calendarUrl = '';
	await page.route(`${SERVER}/**`, async (route) => {
		const request = route.request();
		if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
		const path = new URL(request.url()).pathname;
		if (path.endsWith('/ping')) return route.fulfill({ headers: cors, json: { ok: true, version: 1 } });
		if (path.endsWith('/calendar')) {
			if (request.method() === 'PUT') calendarUrl = request.postDataJSON().url;
			if (request.method() === 'DELETE') calendarUrl = '';
			if (request.method() === 'DELETE') return route.fulfill({ status: 204, headers: cors });
			return route.fulfill({ headers: cors, json: calendarUrl ? { connected: true, events: EVENTS } : { connected: false, events: [] } });
		}
		return route.fulfill({ status: 204, headers: cors });
	});

	await startApp(page);
	await page.getByRole('link', { name: 'Ajustes' }).click();
	await expect(page.getByLabel('Dirección secreta en formato iCal')).toHaveCount(0);
	await page.getByLabel('Dirección', { exact: true }).fill(SERVER);
	await page.getByLabel('Clave de acceso').fill(KEY);
	await page.getByRole('button', { name: 'Conectar', exact: true }).click();
	await page.getByLabel('Dirección secreta en formato iCal').fill('webcal://calendar.example/secret.ics');
	await page.getByRole('button', { name: 'Conectar calendario' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'eventos' })).toHaveText('Conectado: 2 eventos en los próximos 30 días.');
	expect(calendarUrl).toBe('webcal://calendar.example/secret.ics');
	// The address is not kept on the device.
	const stored = await page.evaluate(
		() =>
			new Promise<string>((resolve) => {
				const open = indexedDB.open('qadrant');
				open.onsuccess = () => {
					const get = open.result.transaction('settings').objectStore('settings').get('settings');
					get.onsuccess = () => resolve(JSON.stringify(get.result));
				};
			})
	);
	expect(stored).not.toContain('secret.ics');

	await page.getByRole('link', { name: 'Agenda' }).click();
	await expect(page.getByText('Cumpleaños de Ana')).toBeVisible();
	await expect(page.getByText('Reunión de equipo')).toBeVisible();
	await expect(page.getByText('Calendario · 1 h')).toBeVisible();

	// The capture proposes the first gap after the timed event (10:00-11:00 Madrid).
	await page.getByRole('link', { name: 'Matriz' }).click();
	await page.getByRole('button', { name: '¿Qué tienes en mente?' }).click();
	const sheet = page.getByRole('dialog', { name: 'Nueva tarea' });
	await sheet.getByRole('textbox', { name: 'Tarea' }).fill('Llamar al taller hoy');
	await expect(sheet.getByText('Hoy 11:00 · 30 min')).toBeVisible();
});
