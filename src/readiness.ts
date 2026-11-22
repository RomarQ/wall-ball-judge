/**
 * Whether this device runs each part of the judge, from what the device check measured: fast enough, slower, not at
 * all, or not known yet. The limits are rates that have judged sets right, not a rate below which the judge fails, so
 * a slower part is a warning, not a refusal. No DOM: the PWA's home view and the native app's home screen both read
 * it.
 */

/** How a part runs: fast enough, slower, not at all, or not known yet. */
export type Readiness = 'good' | 'slow' | 'bad' | 'none';

/** A measured time in milliseconds, `'failed'` for a part that did not run, or null for one not measured. */
export type Measured = number | 'failed' | null;

/**
 * The slowest pose frame that has judged sets right, 15 frames a second: on the Pixel 6a's CPU, about 16 frames a
 * second counted the same reps as 30 on the clips with known counts.
 */
export const POSE_MS = 1000 / 15;

/** The slowest look that has judged sets right: the PWA's ball check on the Pixel 6a, about 90 ms a look in a set. */
export const LOOK_MS = 90;

function timed(ms: Measured, limitMs: number): Readiness {
  if (ms === null) return 'none';
  if (ms === 'failed' || !Number.isFinite(ms) || ms <= 0) return 'bad';
  return ms <= limitMs ? 'good' : 'slow';
}

/** The pose, from the time of one frame. */
export const poseReadiness = (ms: Measured): Readiness => timed(ms, POSE_MS);

/** The ball check, from the time of one look. */
export const ballReadiness = (ms: Measured): Readiness => timed(ms, LOOK_MS);

/** The states of the parts of the judge on this device. */
export interface Parts {
  camera: Readiness;
  pose: Readiness;
  ball: Readiness;
  finder: Readiness;
}

/**
 * The device as a whole. Without the camera or the pose there is no live judge. Without the ball check the board
 * judges the squat alone, and without the finder the target is placed by a tap: the board still judges, so these make
 * the device slow, not unfit.
 */
export function phoneReadiness(parts: Parts): Readiness {
  if (parts.camera === 'bad' || parts.pose === 'bad') return 'bad';
  const states = Object.values(parts);
  if (states.includes('none')) return 'none';
  return states.every((state) => state === 'good') ? 'good' : 'slow';
}
