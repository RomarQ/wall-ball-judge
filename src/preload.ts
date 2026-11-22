/**
 * Loads everything a set needs once, so that the service worker caches it.
 *
 * Each detector goes through the loader that the session uses, and is closed
 * again. The pose model's files are fetched as MediaPipe's own resolver names
 * them for this phone: opening the model compiles it on the page's thread,
 * which freezes the home view for half a second on a phone. Either way the
 * requests are the ones this phone makes in a set. A fixed list of files
 * cannot replace them, because each library picks its runtime files for the
 * device.
 *
 * A last step times the pose and the ball check on the GPU and on the CPU;
 * see phone-check.ts. It opens the pose model, so the page pauses while it
 * compiles. It comes after the downloads and fails only when stopped, so the
 * stored files never wait on it.
 *
 * The loaders are imported by each step, so the home view that lists the steps
 * does not load the model libraries before the person asks for the download.
 */
import { modelPaths } from './config';
import { t } from './i18n';
import { checkUnits, saveFinder } from './phone-check';

interface Step {
  /** The text naming the step, which the home view shows while it runs. */
  name: 'check.pose' | 'check.ball' | 'check.target' | 'check.speed';
  /** The model file that the step leaves in the cache, as `modelPaths` names it, or null for a step that stores none. */
  file: 'poseFull' | 'detector' | 'targetDetector' | null;
  load(signal: AbortSignal): Promise<{ close(): void }>;
}

/** Fetches `url` whole, so that the service worker keeps it. */
async function fetchWhole(url: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  await response.arrayBuffer();
}

export const STEPS: Step[] = [
  {
    name: 'check.pose',
    file: 'poseFull',
    async load() {
      const { wasmLoaderPath, wasmBinaryPath } = await (await import('./vision')).loadVision();
      await Promise.all([wasmLoaderPath, wasmBinaryPath, modelPaths().poseFull].map(fetchWhole));
      return { close() {} };
    },
  },
  {
    name: 'check.ball',
    file: 'detector',
    async load() {
      return (await import('./detector')).createDetector();
    },
  },
  {
    name: 'check.target',
    file: 'targetDetector',
    async load() {
      const finder = new (await import('./target-finder')).TargetFinder();
      try {
        await finder.load();
      } catch (err) {
        saveFinder(false);
        throw err;
      }
      saveFinder(true);
      return finder;
    },
  },
  {
    name: 'check.speed',
    file: null,
    async load(signal) {
      await checkUnits(signal);
      return { close() {} };
    },
  },
];

/** The addresses of the model files that a complete download leaves in the cache. */
export function modelFiles(): string[] {
  const paths = modelPaths();
  return STEPS.flatMap((step) => (step.file ? [paths[step.file]] : []));
}

/**
 * Runs the steps in sequence and calls `onStep` when each one starts. An
 * abort stops the download before the next step and rejects with the signal's reason.
 *
 * In sequence, because two detectors that load together each download the
 * runtime before the cache holds it.
 */
export async function preload(
  onStep: (index: number, name: string) => void,
  signal: AbortSignal,
): Promise<void> {
  for (const [index, step] of STEPS.entries()) {
    signal.throwIfAborted();
    onStep(index, t(step.name));
    (await step.load(signal)).close();
  }
}
