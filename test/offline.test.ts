/**
 * Checks when the home view may say that the phone is ready for use with no network.
 *
 * Run: npm test
 */
import { offlineState, type Held } from '../src/offline';
import { expect, it } from 'vitest';

const models = ['https://host/pose_full.task', 'https://app/models/detector-416.tflite'];
const runtimes = ['https://app/vendor/mediapipe/vision.wasm', 'https://app/vendor/litert/litert.wasm'];
const full: Held = { worker: 'active', cached: [...models, ...runtimes], models, runtimes };
const without = (file: string) => full.cached.filter((held) => held !== file);

it('is ready when the caches hold every model and every runtime file of the last download', () => {
  expect(offlineState(full)).toBe('ready');
});

it('is off with no service worker, and pending while the first one starts, whatever the caches hold', () => {
  expect(offlineState({ ...full, worker: 'none' })).toBe('off');
  expect(offlineState({ ...full, worker: 'starting' })).toBe('pending');
});

it('is not ready when one file is absent from the caches, a model or a runtime', () => {
  expect(offlineState({ ...full, cached: without(models[1]) })).toBe('not-ready');
  expect(offlineState({ ...full, cached: without(runtimes[1]) })).toBe('not-ready');
});

it('is not ready before the first download, when no list of runtime files is stored', () => {
  expect(offlineState({ ...full, runtimes: [] })).toBe('not-ready');
});
