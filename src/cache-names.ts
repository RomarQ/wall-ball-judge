/**
 * The names of the two caches that the service worker fills on first use.
 */
declare const __MODELS_REVISION__: string;
declare const __RUNTIMES_REVISION__: string;

/** The model files, named after the revision in models/manifest.json. */
export const MODELS_CACHE = `models-${__MODELS_REVISION__}`;

/** The WASM runtimes, named after the versions of their packages; see `runtimes` in vite.config.ts. */
export const VENDOR_CACHE = `vendor-${__RUNTIMES_REVISION__}`;
