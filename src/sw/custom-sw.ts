/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { IdbMetaStore } from '../services/storage/idbBackend';
import { createFileBackend } from '../services/storage/opfsBackend';
import { handleJobMessage, resumeRunningJobs, type JobEnv, type JobMessage } from './jobHandlers';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
// Từ điển CC-CEDICT (~10MB) tải một lần rồi dùng offline.
registerRoute(({ url }) => url.pathname.endsWith('/cedict.json'), new CacheFirst({ cacheName: 'cedict-v2' }));

const channel = new BroadcastChannel('hoangu-progress');
const env: JobEnv = {
  meta: new IdbMetaStore(),
  backend: createFileBackend(),
  broadcast: (d) => channel.postMessage(d),
};

self.addEventListener('install', () => { void self.skipWaiting(); });
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('message', (event) => {
  const msg = event.data as JobMessage | undefined;
  if (msg && typeof msg === 'object' && 'type' in msg) event.waitUntil(handleJobMessage(msg, env));
});

self.addEventListener('sync', (event) => {
  const e = event as ExtendableEvent & { tag: string };
  if (e.tag === 'resume-jobs') e.waitUntil(resumeRunningJobs(env));
});
