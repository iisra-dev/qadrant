/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare let self: ServiceWorkerGlobalScope;

// The app shell, fonts and icons are precached at build time (injectManifest).
// Model files are never precached: they are downloaded to OPFS (docs/02-arquitectura.md).
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA: every navigation is served by index.html, also offline.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

// The page asks for activation when the user accepts "Hay una versión nueva".
self.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Notices from the own server (phase 3). The payload is built by server/reminders.go.
interface PushPayload {
	title: string;
	body: string;
	taskId: string;
	kind: 'due' | 'follow-up';
}

self.addEventListener('push', (event) => {
	let payload: PushPayload | null = null;
	try {
		payload = event.data?.json() ?? null;
	} catch {
		payload = null;
	}
	if (!payload) return;
	event.waitUntil(
		self.registration.showNotification(payload.title || 'Qadrant', {
			body: payload.body,
			tag: `${payload.taskId}:${payload.kind}`,
			icon: '/pwa-192x192.png',
			badge: '/pwa-64x64.png',
			lang: 'es-ES',
			data: { taskId: payload.taskId }
		})
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const taskId = (event.notification.data as { taskId?: string } | null)?.taskId;
	const url = new URL(taskId ? `/task/${encodeURIComponent(taskId)}` : '/', self.location.origin).href;
	event.waitUntil(
		(async () => {
			const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
			for (const client of windows) {
				if (new URL(client.url).origin !== self.location.origin) continue;
				try {
					await client.navigate(url);
				} catch {
					continue; // not controlled by this worker
				}
				await client.focus().catch(() => {});
				return;
			}
			await self.clients.openWindow(url);
		})()
	);
});
