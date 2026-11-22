/**
 * The version this page is running.
 *
 * A service worker in control is the one serving the page, so it is asked:
 * the server may hold a newer build the phone has not taken yet. With no
 * worker in control nothing is cached and the page is the build the server
 * just sent, which is the version it was compiled with.
 */

const ASK_TIMEOUT_MS = 1500;

/** The version this build was compiled with. */
const BUILT = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : null;

export function installedVersion(): Promise<string | null> {
  const worker = navigator.serviceWorker?.controller;
  if (!worker) return Promise.resolve(BUILT);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(BUILT), ASK_TIMEOUT_MS);
    channel.port1.onmessage = (event: MessageEvent<string>) => {
      clearTimeout(timer);
      resolve(event.data);
    };
    worker.postMessage({ type: 'version' }, [channel.port2]);
  });
}

/**
 * Calls `show` with the installed version now, and again whenever a new
 * service worker takes control, which is what a completed update looks like.
 */
export function watchVersion(show: (version: string | null) => void): void {
  void installedVersion().then(show);
  navigator.serviceWorker?.addEventListener('controllerchange', () => void installedVersion().then(show));
}
