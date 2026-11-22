/**
 * The browser globals the PWA's modules read, backed by the phone: `localStorage` on the app's settings store, and
 * `navigator.language` from the phone's language. Imported before any of those modules, so the settings keep the
 * PWA's keys and defaults.
 */
import { wallballVision } from 'wallball-vision';

const storage = {
  getItem: (key: string): string | null => wallballVision.getSetting(key) ?? null,
  setItem: (key: string, value: string): void => wallballVision.setSetting(key, String(value)),
  removeItem: (key: string): void => wallballVision.removeSetting(key),
};

const scope = globalThis as unknown as { localStorage?: typeof storage; navigator?: { language?: string } };
scope.localStorage = storage;
scope.navigator = { ...(scope.navigator ?? {}), language: wallballVision.locale() };
