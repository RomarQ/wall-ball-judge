/**
 * Resolves the MediaPipe Tasks Vision WASM runtime once.
 *
 * The pose landmarker and the object detector share one runtime, so the
 * second model costs no second download of the WASM files.
 */
import { FilesetResolver } from '@mediapipe/tasks-vision';
import { modelPaths } from './config';

export type Fileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

let loading: Promise<Fileset> | null = null;

/** The resolved WASM fileset, shared by every model. */
export function loadVision(): Promise<Fileset> {
  if (!loading) {
    loading = FilesetResolver.forVisionTasks(modelPaths().mediapipeWasm).catch((err: unknown) => {
      loading = null;
      throw err;
    });
  }
  return loading;
}
