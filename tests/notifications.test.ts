import { expect, test } from '@playwright/test';
import { startApp } from './helpers';

// The headless shell always denies notifications; the full Chromium in headless mode does not.
test.use({ channel: 'chromium' });
// Push and the notification permission in automation are Chromium's.
test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium only');

test('the service worker shows a notice for a push message and opens the task on click', async ({ page, context }) => {
	await context.grantPermissions(['notifications'], { origin: 'http://localhost:4173' });
	await startApp(page);
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
	});
	// Under the service worker's control, as the installed app is.
	await page.reload();
	const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
	// Headless Chromium has no push service; dispatch the same event the browser would.
	const shown = await worker.evaluate(async () => {
		const sw = self as unknown as ServiceWorkerGlobalScope;
		const data = JSON.stringify({ title: 'Qadrant', body: 'Due: Pagar recibo', taskId: 'abc', kind: 'due', taskTitle: 'Pagar recibo' });
		sw.dispatchEvent(new PushEvent('push', { data }));
		for (let i = 0; i < 50; i++) {
			const list = await sw.registration.getNotifications();
			if (list.length) return list.map((n) => [n.title, n.body, n.tag, (n.data as { taskId: string }).taskId]);
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		return [];
	});
	expect(shown).toEqual([['Pagar recibo', 'Vence ahora', 'abc:due', 'abc']]);

	await worker.evaluate(async () => {
		const sw = self as unknown as ServiceWorkerGlobalScope;
		const [notification] = await sw.registration.getNotifications();
		sw.dispatchEvent(new NotificationEvent('notificationclick', { notification }));
	});
	await expect(page).toHaveURL(/\/task\/abc$/);
});
