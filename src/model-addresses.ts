/**
 * Where a build loads each model file from, for the page and for its service worker.
 */
import manifest from '../models/manifest.json';

const POSE_HOST = 'https://storage.googleapis.com/mediapipe-models';

/** The pose models that MediaPipe publishes. */
export type PoseModel = 'lite' | 'full';

/** A trained file at `revision`, a tag on the Hub, so the address never changes what it serves. */
export const onHub = (revision: string, file: string): string =>
  `https://huggingface.co/${manifest.repo}/resolve/${revision}/${file}`;

/**
 * The model addresses of a build whose own files sit under `root`. A `local` build serves every shipped model from
 * its own models folder. Otherwise the pose models come from Google's storage, and the shipped detectors come from
 * the Hub once the manifest points there.
 */
export function modelAddresses(root: string, local: boolean) {
  const own = (file: string) => new URL(`models/${file}`, root).href;
  return {
    pose: (model: PoseModel): string =>
      local
        ? own(`pose_landmarker_${model}.task`)
        : `${POSE_HOST}/pose_landmarker/pose_landmarker_${model}/float16/latest/pose_landmarker_${model}.task`,
    shipped: (file: string): string =>
      manifest.source === 'hub' && !local ? onHub(manifest.revision, file) : own(file),
  };
}
