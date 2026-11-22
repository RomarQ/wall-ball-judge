/**
 * Whether this phone holds everything a set needs, so that it can judge with no network.
 *
 * Each visit reads the answer from the service worker's two caches, so a
 * cache that the browser dropped, or that a new revision replaced, reads as
 * not ready. The model files have known addresses. The runtime files do not:
 * each library picks them for the device, so the list that this phone asked
 * for is stored when a download ends.
 */
import { MODELS_CACHE, VENDOR_CACHE } from './cache-names';

/**
 * 'pending' while the first service worker of a visit starts. 'off' when no
 * service worker serves the page, so the page stores nothing: a dev build, or
 * a browser that runs no service workers.
 */
export type OfflineState = 'ready' | 'not-ready' | 'pending' | 'off';

/** The service worker of this page: active, still starting on a first visit, or none. */
export type Worker = 'active' | 'starting' | 'none';

/** What a visit reads from the phone before it decides. */
export interface Held {
  worker: Worker;
  /** The addresses in the model cache and in the runtime cache. */
  cached: string[];
  /** The model files that this page can ask for in a set. */
  models: string[];
  /** The runtime files that this phone asked for in its last download, none before the first. */
  runtimes: string[];
}

/** Ready when the caches hold every model file and every runtime file of the last download. */
export function offlineState({ worker, cached, models, runtimes }: Held): OfflineState {
  if (worker === 'none') return 'off';
  if (worker === 'starting') return 'pending';
  const held = new Set(cached);
  const complete = runtimes.length > 0 && [...models, ...runtimes].every((file) => held.has(file));
  return complete ? 'ready' : 'not-ready';
}

const RUNTIMES_KEY = 'offlineRuntimes';

/** How long the first service worker of a visit gets to start. */
const START_WAIT_MS = 4000;

/**
 * How long the worker's write of the last file may come after its download.
 *
 * The worker answers the page before it finishes the write to its cache, so
 * the last file of a download can be absent for a moment.
 */
const WRITE_WAIT_MS = 10_000;
const WRITE_POLL_MS = 250;

async function addresses(cache: string): Promise<string[]> {
  if (!(await caches.has(cache))) return [];
  const requests = await (await caches.open(cache)).keys();
  return requests.map((request) => request.url);
}

function storedRuntimes(): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(RUNTIMES_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((file) => typeof file === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * The service worker of this page, after a short wait for the first one of a visit.
 *
 * An active worker counts whether or not it controls this page: a reload that
 * bypasses it still leaves the worker to serve the next visit from its caches.
 */
async function workerState(): Promise<Worker> {
  const workers = navigator.serviceWorker;
  // A dev build has no service worker, so nothing it loads stays cached between reloads.
  if (!workers || import.meta.env.DEV) return 'none';
  const active = await Promise.race([
    workers.ready.then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), START_WAIT_MS)),
  ]);
  if (active) return 'active';
  return (await workers.getRegistration()) ? 'starting' : 'none';
}

/** The state for a page that can ask for the model files `models` in a set. */
export async function readOfflineState(models: string[]): Promise<OfflineState> {
  const worker = await workerState();
  const cached =
    worker === 'active' ? [...(await addresses(MODELS_CACHE)), ...(await addresses(VENDOR_CACHE))] : [];
  return offlineState({ worker, cached, models, runtimes: storedRuntimes() });
}

/**
 * Asks the browser to keep this page's stored files when the phone runs low on space.
 *
 * Without the request a browser may clear them at any time, and the phone
 * then reads ready at home and is not at the gym. Chrome answers with no
 * prompt, and grants the request to an installed app.
 *
 * @returns whether the browser keeps them.
 */
export async function keepStored(): Promise<boolean> {
  return (await navigator.storage?.persist?.().catch(() => false)) ?? false;
}

/** Whether the browser keeps this page's stored files when the phone runs low on space. */
export async function storedKept(): Promise<boolean> {
  return (await navigator.storage?.persisted?.().catch(() => false)) ?? false;
}

/**
 * The state after a download that loaded every one of `models`.
 *
 * Stores the runtime files that the download put in the cache. A model
 * arrives after its runtime, so the runtime cache is complete when the model
 * cache holds every model.
 */
export async function confirmDownload(models: string[]): Promise<OfflineState> {
  // The download went past the worker, so it stored nothing to confirm.
  if (!navigator.serviceWorker?.controller) return readOfflineState(models);
  const deadline = performance.now() + WRITE_WAIT_MS;
  while (performance.now() < deadline) {
    const held = new Set(await addresses(MODELS_CACHE));
    if (models.every((file) => held.has(file))) break;
    await new Promise((resolve) => setTimeout(resolve, WRITE_POLL_MS));
  }
  localStorage.setItem(RUNTIMES_KEY, JSON.stringify(await addresses(VENDOR_CACHE)));
  return readOfflineState(models);
}
