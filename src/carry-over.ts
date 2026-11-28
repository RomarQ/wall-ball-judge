/**
 * What a new service worker puts in its model cache for each file of the model cache that it replaces.
 *
 * A build with a new model revision or new runtimes names its caches anew,
 * and its activation drops the old ones. So the worker fills its caches with
 * the files of the old ones before its install ends. A browser can activate a
 * waiting worker when its last page closes, with no page left to download
 * anything, and the phone then opens with no network and nothing to judge with.
 */
import manifest from '../models/manifest.json';
import { modelAddresses, onHub } from './model-addresses';

/** The model addresses of the build that a new worker serves. */
export interface Build {
  /** The app's own origin, which serves new bytes at the same address with each build. */
  origin: string;
  /** Every address the build may load a model file from. */
  loads: string[];
  /** The address the build loads each detector file of its shipped revision from. */
  shipped: Record<string, string>;
}

/** The build whose own files sit under `root`; `local` as in model-addresses.ts. */
export function buildAt(root: string, local: boolean): Build {
  const at = modelAddresses(root, local);
  const shipped = Object.fromEntries(Object.keys(manifest.files).map((file) => [file, at.shipped(file)]));
  const offered = Object.entries(manifest.offered as Record<string, { files: object }>).flatMap(
    ([revision, { files }]) => Object.keys(files).map((file) => onHub(revision, file)),
  );
  return {
    origin: new URL(root).origin,
    loads: [at.pose('lite'), at.pose('full'), ...Object.values(shipped), ...offered],
    shipped,
  };
}

/** A file for the new cache: `copy` keeps the cached bytes, and otherwise the worker fetches `address`. */
export interface Carried {
  address: string;
  copy: boolean;
}

/**
 * The files that take the place of the cached model file at `address` in the cache of `build`.
 *
 * The build may still load the address itself, such as a revision that the settings offer, and it loads its own
 * detector of the same name, which a person who never chose a revision uses. Bytes stay only at an address on
 * another host, which serves fixed bytes. The app's own origin serves the build's bytes, so the worker fetches them.
 */
export function carriedOver(address: string, build: Build): Carried[] {
  const file = address.slice(address.lastIndexOf('/') + 1);
  const targets = new Set(build.loads.includes(address) ? [address] : []);
  if (Object.hasOwn(build.shipped, file)) targets.add(build.shipped[file]);
  return [...targets].map((target) => ({
    address: target,
    copy: target === address && new URL(target).origin !== build.origin,
  }));
}
