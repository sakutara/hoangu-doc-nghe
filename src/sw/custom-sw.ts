/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
// Từ điển CC-CEDICT (~10MB) tải một lần rồi dùng offline.
registerRoute(({ url }) => url.pathname.endsWith('/cedict.json'), new CacheFirst({ cacheName: 'cedict-v2' }));

self.addEventListener('install', () => { void self.skipWaiting(); });
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
