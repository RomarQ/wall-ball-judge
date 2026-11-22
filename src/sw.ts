/**
 * Offline cache for the judge.
 *
 * The app shell is precached by content hash, so a new build replaces the
 * old one whole: a page never runs a mix of two builds. The WASM runtimes
 * and the model files are large, so they are cached on first use instead,
 * whichever origin serves them, and only the ones this phone actually needs.
 *
 * The model cache is named after the model revision in models/manifest.json.
 * A new revision gets a new cache and the old one is dropped on activation,
 * which is how a phone stops serving a stale model file.
 */
/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { RangeRequestsPlugin } from 'workbox-range-requests';
import { MODELS_CACHE as MODELS, VENDOR_CACHE as VENDOR } from './cache-names';

declare const self: ServiceWorkerGlobalScope;

/** Hosts that serve model files, beside the app's own models folder. */
const MODEL_HOSTS = ['storage.googleapis.com', 'huggingface.co', 'cdn-lfs.hf.co', 'cas-bridge.xethub.hf.co'];

function isModel(url: URL): boolean {
  if (url.origin === self.location.origin) return url.pathname.includes('/models/');
  return MODEL_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

function isVendor(url: URL): boolean {
  return url.origin === self.location.origin && url.pathname.includes('/vendor/');
}

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// A model loader may read a file in ranges; the plugin answers those from the cached whole.
const bigFiles = [new CacheableResponsePlugin({ statuses: [0, 200] }), new RangeRequestsPlugin()];
registerRoute(({ url }) => isModel(url), new CacheFirst({ cacheName: MODELS, plugins: bigFiles }));
registerRoute(({ url }) => isVendor(url), new CacheFirst({ cacheName: VENDOR, plugins: bigFiles }));

// Caches of an older model revision go, and so do the hand-written worker's
// `wallball-*` caches, which a phone that ran the app before this build still holds.
const stale = (key: string) =>
  (key.startsWith('models-') && key !== MODELS) ||
  (key.startsWith('vendor') && key !== VENDOR) ||
  key.startsWith('wallball-');

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter(stale).map((k) => caches.delete(k)))));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'version') event.ports[0]?.postMessage(__APP_VERSION__);
});
