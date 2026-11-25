/**
 * PoseLandmarker setup and frame detection.
 *
 * Wraps MediaPipe so the rest of the app never imports it directly.
 */
import { PoseLandmarker } from '@mediapipe/tasks-vision';
import { config, modelPaths, type PoseQuality } from './config';
import type { Frame } from './frame';
import type { Landmark, Unit } from './types';
import { t } from './i18n';
import { loadVision } from './vision';

export type Delegate = 'GPU' | 'CPU';

export interface Pose {
  quality: PoseQuality;
  delegate: Delegate;
  /** Returns the 33 landmarks for the frame, or null when no pose is found. */
  detect(video: Frame, timestampMs: number): Landmark[] | null;
  /** Takes the confidence the settings ask for now, when it differs from the one the model runs with. */
  update(): Promise<void>;
  /**
   * Drops the person the model follows, so a coming frame finds them afresh: video mode turns its crop to the body it
   * follows, and keeps a crop that turned over. At most once in `RETRACK_MS`, as each one rebuilds the model's graph.
   */
  retrack(): void;
  close(): void;
}

/** The least time between two retracks: until the athlete stands, a fresh search may turn the crop over again. */
const RETRACK_MS = 1000;

type RunningMode = 'VIDEO' | 'IMAGE';

/**
 * The model's three confidences. The judging pose, in video mode, finds the
 * athlete at `config.pose.judgingDetection` and keeps them as the settings and
 * the page's address ask for now. The target search's pose, in image mode,
 * holds `config.pose.search` at every stage.
 */
function confidence(runningMode: RunningMode) {
  if (runningMode === 'IMAGE') {
    const { search } = config.pose;
    return {
      minPoseDetectionConfidence: search,
      minPosePresenceConfidence: search,
      minTrackingConfidence: search,
    };
  }
  return {
    minPoseDetectionConfidence: config.pose.judgingDetection,
    minPosePresenceConfidence: config.pose.presence,
    minTrackingConfidence: config.pose.tracking,
  };
}

/** Moves `landmarker` to the confidence asked for now, once it differs from `held`; returns the one it runs with. */
async function follow(landmarker: PoseLandmarker, held: string, runningMode: RunningMode): Promise<string> {
  const asked = confidence(runningMode);
  const key = JSON.stringify(asked);
  if (key !== held) await landmarker.setOptions(asked);
  return key;
}

/** A landmarker for the model `quality` names, on the delegate `first` or, when that fails, the other one. */
async function openLandmarker(
  quality: PoseQuality,
  runningMode: RunningMode,
  first: Delegate,
): Promise<{ landmarker: PoseLandmarker; delegate: Delegate }> {
  const fileset = await loadVision();
  const paths = modelPaths();
  const modelAssetPath = quality === 'lite' ? paths.poseLite : paths.poseFull;

  const build = (delegate: Delegate) =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath, delegate },
      runningMode,
      numPoses: 1,
      ...confidence(runningMode),
      outputSegmentationMasks: false,
    });

  const second: Delegate = first === 'GPU' ? 'CPU' : 'GPU';
  try {
    return { landmarker: await build(first), delegate: first };
  } catch (err) {
    // MediaPipe loads its runtime with a script tag and rejects with the tag's
    // error event. Both delegates need that script, so the other one cannot load.
    if (err instanceof Event) throw runtimeNotLoaded(err);
    return { landmarker: await build(second), delegate: second };
  }
}

function runtimeNotLoaded(event: Event): Error {
  const src = event.target instanceof HTMLScriptElement ? event.target.src : t('pose.server');
  return new Error(t('pose.runtime')(src));
}

/**
 * Loads the model and returns a detector.
 *
 * `quality` picks the model: 'lite' is faster, 'full' is more accurate.
 * `unit` picks where it runs; the other unit is the fallback when that one
 * fails to load, and `delegate` on the result names the one in use.
 */
export async function createPose({ quality, unit }: { quality: PoseQuality; unit: Unit }): Promise<Pose> {
  const { landmarker, delegate: opened } = await openLandmarker(
    quality,
    'VIDEO',
    unit === 'gpu' ? 'GPU' : 'CPU',
  );
  let held = JSON.stringify(confidence('VIDEO'));
  let retrackedAt = -Infinity;

  return {
    quality,
    delegate: opened,
    detect(video, timestampMs) {
      const result = landmarker.detectForVideo(video, timestampMs);
      return result?.landmarks?.[0] ?? null;
    },
    async update() {
      held = await follow(landmarker, held, 'VIDEO');
    },
    retrack() {
      const now = performance.now();
      if (now - retrackedAt < RETRACK_MS) return;
      retrackedAt = now;
      // MediaPipe rebuilds its graph on every setOptions, and a new graph follows no one.
      void landmarker.setOptions({});
    },
    close() {
      landmarker.close();
    },
  };
}

/** The pose in one frame at a time, with no memory of the frames before it. */
export interface StillPose {
  /** The 33 landmarks for the frame, or null when no pose is found. */
  find(frame: Frame): Landmark[] | null;
  close(): void;
}

/**
 * A pose for frames the judging does not read, such as the ones the target
 * search looks at.
 *
 * The judging pose follows a person from one frame to the next, so reading a
 * frame seconds away with it moves that tracking: a search over the first
 * seconds of a clip turned the clip's first rep from a pass at depth 43 into
 * a fault at -19. This one keeps no track, and its first answer on a frame is
 * already settled.
 *
 * It runs on the CPU delegate at the search's own confidence, which the
 * target search places plates with: on the GPU, finding a person at the
 * judging pose's lower figure, it put gym-raw-14's upper target on the
 * lower plate.
 */
export async function createStillPose(quality: PoseQuality): Promise<StillPose> {
  const { landmarker } = await openLandmarker(quality, 'IMAGE', 'CPU');
  return {
    find(frame) {
      return landmarker.detect(frame)?.landmarks?.[0] ?? null;
    },
    close() {
      landmarker.close();
    },
  };
}
