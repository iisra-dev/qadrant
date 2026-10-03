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
