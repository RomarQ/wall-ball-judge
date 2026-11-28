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
 * which is how a phone stops serving a stale model file. The install first
 * fills the new caches from the old ones, see carry-over.ts.
 */
/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { RangeRequestsPlugin } from 'workbox-range-requests';
import { MODELS_CACHE as MODELS, VENDOR_CACHE as VENDOR } from './cache-names';
import { buildAt, carriedOver, type Carried } from './carry-over';

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

clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// A model loader may read a file in ranges; the plugin answers those from the cached whole.
const bigFiles = [new CacheableResponsePlugin({ statuses: [0, 200] }), new RangeRequestsPlugin()];
// The carry-over stores a file without the page's request headers, which the Hub's `Vary: origin` would then miss.
const byAddress = { ignoreVary: true };
registerRoute(
  ({ url }) => isModel(url),
  new CacheFirst({ cacheName: MODELS, plugins: bigFiles, matchOptions: byAddress }),
);
registerRoute(
  ({ url }) => isVendor(url),
  new CacheFirst({ cacheName: VENDOR, plugins: bigFiles, matchOptions: byAddress }),
);

// Caches of an older model revision go, and so do the hand-written worker's
// `wallball-*` caches, which a phone that ran the app before this build still holds.
const stale = (key: string) =>
  (key.startsWith('models-') && key !== MODELS) ||
  (key.startsWith('vendor') && key !== VENDOR) ||
  key.startsWith('wallball-');

const build = buildAt(self.registration.scope, import.meta.env.VITE_MODELS === 'local');

/** The answers that say the server no longer serves a file. */
const GONE = [404, 410];

/**
 * Fills this worker's caches from the stale ones: each model file that the build loads in place of a cached one, and
 * each runtime file again. A failed fetch or an error answer fails the install, so the phone keeps the build before
 * it with all its files, and the browser tries again at a later update check, which skips the files already stored.
 * Only a runtime file that the server no longer serves stays out, as the new runtimes no longer ask for it.
 */
async function carryOver(): Promise<void> {
  for (const key of (await caches.keys()).filter(stale)) {
    const runtimes = key.startsWith('vendor');
    if (!runtimes && !key.startsWith('models-')) continue;
    const from = await caches.open(key);
    const to = await caches.open(runtimes ? VENDOR : MODELS);
    for (const request of await from.keys()) {
      const files: Carried[] = runtimes
        ? [{ address: request.url, copy: false }]
        : carriedOver(request.url, build);
      for (const { address, copy } of files) {
        if (await to.match(address, byAddress)) continue;
        if (copy) {
          const cached = await from.match(request);
          if (cached) await to.put(address, cached);
          continue;
        }
        // Revalidate the HTTP cache: an own file keeps its address, so the previous build's bytes may sit there.
        const response = await fetch(address, { cache: 'no-cache' });
        if (response.ok) await to.put(address, response);
        else if (!runtimes || !GONE.includes(response.status))
          throw new Error(`${address} answered ${response.status}`);
      }
    }
  }
}

self.addEventListener('install', (event) => event.waitUntil(carryOver()));

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter(stale).map((k) => caches.delete(k)))));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'version') event.ports[0]?.postMessage(__APP_VERSION__);
  // A new build waits for its page's word, sent when a reload loses nothing (main.ts).
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});
