/**
 * Squat depth metric and the rep state machine.
 *
 * This module holds no DOM and no model code. It takes landmarks and returns
 * rep events, so test/depth.test.ts can drive it with no camera.
 */
import type { Landmark } from './types';

/** MediaPipe pose landmark indices used here. */
export const LM = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

export interface DepthOptions {
  visibilityMin: number;
  /**
   * How upright the femur must be for the ruler to follow it, as the share
   * of its length seen that runs straight up from the knee: 1 is the hip
   * right above the knee. Read from the frame alone, so a ruler that grew
   * on a wrong pose shrinks back on the next standing frame. This is not
   * where a rep begins or ends: see `topDepth`.
   */
  uprightMin: number;
  /**
   * Back above the squat, which is where a rep ends.
   *
   * A phone at hip height reads a standing athlete near -100, and one low and
   * close to them reads the same stand near -60. So a rep cannot end at what
   * standing reads: a whole set filmed low would never end one. It ends where
   * the hips are clear of the squat, which both cameras reach.
   */
  topDepth: number;
  /** How far the hips must drop below the top before a squat is under way at all. */
  openDepth: number;
  /** Below parallel: the hip level with the knee. */
  bottomDepth: number;
  /** Driving up out of the bottom, which is where the ball leaves the hands. */
  ascendDepth: number;
  /** How long the camera may lose the athlete before the squat under way is dropped. */
  maxBlindMs: number;
  /** An athlete the camera can judge has a torso at least this tall, as a fraction of the frame height. */
  minTorso: number;
  /** Frames a plausible athlete must hold before a rep can begin, and an absent one before the athlete is gone. */
  settleFrames: number;
  /** How fast the femur ruler follows the standing femur, per standing frame. */
  rulerRate: number;
  /**
   * Readings in a row that must agree before a squat opens or one of its
   * phases ends.
   *
   * Filmed from behind, a frame where one leg drops out of sight is measured
   * differently from one where both are seen, and the reading can swing most
   * of its range between frames. A single such frame would otherwise open a
   * squat while the athlete stands, end the rep there, or start a second throw
   * from one squat.
   */
  steadyFrames: number;
}

export const DEFAULTS: DepthOptions = {
  visibilityMin: 0.5,
  uprightMin: 0.7,
  // A gym clip filmed low reads -63 at the top of every rep and +15 at the
  // bottom, so -55 separates the two with room on both sides. A side-on
  // camera reads -100 at the top and clears it by more.
  topDepth: -55,
  // Reaching up to throw lifts the hips a little, and the athlete bobs between
  // reps, both of which pass the top without a squat starting. A rep opens
  // only once the hips are well on their way down.
  openDepth: -40,
  bottomDepth: 2,
  ascendDepth: -10,
  maxBlindMs: 1500,
  minTorso: 0.06,
  settleFrames: 10,
  rulerRate: 0.1,
  steadyFrames: 3,
};

/**
 * Whether a plausible athlete is in frame.
 *
 * The pose model draws a skeleton on a chair or a bag when nobody is there,
 * and such a phantom can squat and count. It is tiny, so a torso under
 * `minTorso` is not an athlete. And it flickers, so the athlete must hold
 * for `settleFrames` frames before counting starts, and is gone only after
 * as many frames without one, which lets a real athlete survive a frame the
 * model missed.
 */
export class Presence {
  cfg: DepthOptions;
  present = false;
  run = 0;
  last: boolean | null = null;
  tooSmall = false;

  constructor(options: Partial<DepthOptions> = {}) {
    this.cfg = { ...DEFAULTS, ...options };
  }

  reset(): void {
    this.present = false;
    this.run = 0;
    this.last = null;
    this.tooSmall = false;
  }

  /** Feeds one frame: `ok` when bodyFrame found a body, `torso` its torso in frame units. Returns true when the athlete counts. */
  update({ ok, torso }: { ok: boolean; torso?: number | null }): boolean {
    const plausible = ok && typeof torso === 'number' && Number.isFinite(torso) && torso >= this.cfg.minTorso;
    this.tooSmall = ok && !plausible;
    this.run = plausible === this.last ? this.run + 1 : 1;
    this.last = plausible;
    if (this.run >= this.cfg.settleFrames) this.present = plausible;
    return this.present && plausible;
  }
}

export const State = {
  /** No athlete the camera can judge. */
  READY: 'READY',
  /** Above the squat. */
  UP: 'UP',
  /** In a squat, parallel not broken yet. */
  DOWN: 'DOWN',
  /** Below parallel. */
  BOTTOM: 'BOTTOM',
  /** Driving up out of the bottom, with the ball on its way. */
  DRIVING: 'DRIVING',
} as const;

export type RepState = (typeof State)[keyof typeof State];

function visibilityOf(landmark: Landmark): number {
  return typeof landmark.visibility === 'number' ? landmark.visibility : 1;
}

interface SideDepth {
  depth: number;
  femur: number;
  upright: number;
  visibility: number;
  kneeY: number;
  hipY: number;
}

function sideDepth(
  landmarks: Landmark[],
  hipIndex: number,
  kneeIndex: number,
  aspect: number,
  visibilityMin: number,
  rulerLength = 0,
): SideDepth | null {
  const hip = landmarks[hipIndex];
  const knee = landmarks[kneeIndex];
  if (!hip || !knee) return null;

  const visibility = Math.min(visibilityOf(hip), visibilityOf(knee));
  if (visibility < visibilityMin) return null;

  // Landmarks are normalised per axis, so x must be scaled by the frame aspect
  // before it shares a unit with y. Without this the femur length is skewed on
  // any non-square frame, which skews every depth reading.
  const dx = (hip.x - knee.x) * aspect;
  const dy = hip.y - knee.y;
  const femur = Math.hypot(dx, dy);
  const ruler = Math.max(femur, rulerLength);
  if (ruler < 1e-6) return null;

  const upright = femur > 1e-6 ? -dy / femur : 0;
  return { depth: (100 * dy) / ruler, femur, upright, visibility, kneeY: knee.y, hipY: hip.y };
}

export interface DepthReading {
  ok: true;
  side: 'both' | 'left' | 'right';
  /** Percent of femur length the hip sits below the knee: negative above parallel. */
  depth: number;
  /** The femur's length seen in the frame, in fractions of the frame height. */
  femur: number;
  /** The share of the femur seen that runs straight up from the knee: 1 upright, 0 level, negative with the hip below. */
  upright: number;
  kneeY: number;
  hipY: number;
  visibility: number;
}

export interface DepthMissing {
  ok: false;
  reason: 'no-pose' | 'low-visibility';
}

export type Depth = DepthReading | DepthMissing;

/**
 * Depth of the squat as a percentage of femur length.
 *
 * The femur's length in the frame is the ruler, and from the side it is the
 * same at the top and the bottom. From behind or in front the thigh points
 * at the camera at the bottom and shrinks to a fraction of itself, which
 * turns pose jitter into swings of fifty points. `rulerLength` is the femur
 * measured while standing, when it is upright and full length from any
 * angle; the longer of the two is the ruler, so a closer athlete is never
 * measured with a stale one. The result carries `femur`, the length seen.
 *
 * With both legs in view the reading is the leg whose femur seen is nearer
 * `rulerLength`. From behind, the model guesses the knee a thigh hides, often
 * onto the hip, and that leg's reading pulls a deep squat to the line. With
 * no ruler yet, the two legs are averaged.
 *
 * `ok` is false when the hip or the knee is too hidden to trust.
 */
export function computeDepth(
  landmarks: Landmark[] | null | undefined,
  aspect = 1,
  options: Partial<DepthOptions> = {},
  rulerLength = 0,
): Depth {
  const cfg = { ...DEFAULTS, ...options };
  if (!landmarks || landmarks.length <= LM.RIGHT_KNEE) {
    return { ok: false, reason: 'no-pose' };
  }

  const left = sideDepth(landmarks, LM.LEFT_HIP, LM.LEFT_KNEE, aspect, cfg.visibilityMin, rulerLength);
  const right = sideDepth(landmarks, LM.RIGHT_HIP, LM.RIGHT_KNEE, aspect, cfg.visibilityMin, rulerLength);

  if (left && right && rulerLength > 0) {
    const off = (leg: SideDepth) => Math.abs(leg.femur / rulerLength - 1);
    const [seen, side] = off(left) <= off(right) ? [left, 'left' as const] : [right, 'right' as const];
    return { ok: true, side, ...seen };
  }
  if (left && right) {
    return {
      ok: true,
      side: 'both',
      depth: (left.depth + right.depth) / 2,
      femur: (left.femur + right.femur) / 2,
      upright: (left.upright + right.upright) / 2,
      kneeY: (left.kneeY + right.kneeY) / 2,
      hipY: (left.hipY + right.hipY) / 2,
      visibility: Math.min(left.visibility, right.visibility),
    };
  }
  const one = left || right;
  if (one) return { ok: true, side: left ? 'left' : 'right', ...one };
  return { ok: false, reason: 'low-visibility' };
}

/**
 * The femur's length in the frame while the athlete stands, followed slowly
 * so it tracks a change of distance without chasing a squat. Feed it every
 * reading; it follows the ones with the thigh upright. Read `length` as the
 * ruler for `computeDepth`.
 */
export class FemurRuler {
  cfg: DepthOptions;
  length = 0;

  constructor(options: Partial<DepthOptions> = {}) {
    this.cfg = { ...DEFAULTS, ...options };
  }

  update({ femur, upright }: DepthReading): void {
    if (upright < this.cfg.uprightMin || !Number.isFinite(femur) || femur <= 0) return;
    this.length = this.length === 0 ? femur : this.length + this.cfg.rulerRate * (femur - this.length);
  }

  reset(): void {
    this.length = 0;
  }
}

/** A rep that ran from standing to standing. `depthPass` says it went below parallel. */
export interface RepClosed {
  type: 'rep';
  depthPass: boolean;
  maxDepth: number;
  startMs: number;
  endMs: number;
}

export type RepEvent = RepClosed | { type: 'abort'; reason: 'lost-tracking' };

/** A squat under way: when it began, how deep it has gone, and whether it broke parallel. */
export interface OpenRep {
  startMs: number;
  maxDepth: number;
  reachedBottom: boolean;
}

/** The runs of readings the counter waits on: the hips down past `openDepth`, up past `topDepth`, up past `ascendDepth`. */
type Run = 'down' | 'top' | 'drive';

/**
 * Turns a stream of depth samples into rep events.
 *
 * The squat is read against parallel, never against standing. A phone at hip
 * height and a phone on the floor disagree by forty points about what a stand
 * reads, and a counter that waits for standing stops counting on the second
 * one: it sits waiting for a reading that set never produces. Parallel is the
 * hip level with the knee, which is the same posture to any camera, so every
 * threshold here is placed around it.
 *
 * Call `update` once per frame. It returns null, or one event. `depthPass`
 * on a closed rep says the squat went below parallel. It is not the final
 * verdict: the caller adds the ball check and decides whether the rep is
 * valid. Nothing here is timed, so a squat in slow motion counts the same as
 * a fast one.
 */
export class RepCounter {
  cfg: DepthOptions;
  state: RepState = State.READY;
  current: OpenRep | null = null;
  lastVisibleMs: number | null = null;
  /** Readings in a row meeting each threshold, and when each run began. */
  #run: Record<Run, number> = { down: 0, top: 0, drive: 0 };
  #since: Record<Run, number> = { down: 0, top: 0, drive: 0 };
  /** The deepest reading of the current `down` run. */
  #deepest = 0;

  constructor(options: Partial<DepthOptions> = {}) {
    this.cfg = { ...DEFAULTS, ...options };
  }

  reset(): void {
    this.state = State.READY;
    this.current = null;
    this.lastVisibleMs = null;
    this.#run = { down: 0, top: 0, drive: 0 };
  }

  /** True once `steadyFrames` readings in a row have met the threshold. */
  #steady(which: Run, met: boolean, tMs: number): boolean {
    if (!met) {
      this.#run[which] = 0;
      return false;
    }
    if (this.#run[which] === 0) this.#since[which] = tMs;
    this.#run[which] += 1;
    return this.#run[which] >= this.cfg.steadyFrames;
  }

  /** Opens a squat, already at the bottom when `depth` is below parallel. */
  #open(startMs: number, depth: number): void {
    const reachedBottom = depth >= this.cfg.bottomDepth;
    this.current = { startMs, maxDepth: depth, reachedBottom };
    this.state = reachedBottom ? State.BOTTOM : State.DOWN;
  }

  update({ depth, visible, tMs }: { depth: number; visible: boolean; tMs: number }): RepEvent | null {
    if (!visible) {
      const blindFor = this.lastVisibleMs === null ? 0 : tMs - this.lastVisibleMs;
      this.#run = { down: 0, top: 0, drive: 0 };
      if (this.current && blindFor > this.cfg.maxBlindMs) {
        this.current = null;
        this.state = State.READY;
        return { type: 'abort', reason: 'lost-tracking' };
      }
      return null;
    }
    this.lastVisibleMs = tMs;

    // Opening a squat and ending a phase ask for a run of readings; reaching
    // parallel asks for a single one, so a bottom held for two frames is still
    // a bottom.
    const down = this.#steady('down', depth >= this.cfg.openDepth, tMs);
    const top = this.#steady('top', depth < this.cfg.topDepth, tMs);
    const driving = this.#steady('drive', depth < this.cfg.ascendDepth, tMs);
    const belowParallel = depth >= this.cfg.bottomDepth;
    if (this.#run.down > 0) this.#deepest = this.#run.down === 1 ? depth : Math.max(this.#deepest, depth);

    if (this.current && depth > this.current.maxDepth) this.current.maxDepth = depth;

    switch (this.state) {
      case State.READY:
        if (top) this.state = State.UP;
        return null;

      case State.UP:
        // A fast squat filmed at a low frame rate can pass parallel within the
        // readings that open it.
        if (down) this.#open(this.#since.down, this.#deepest);
        return null;

      case State.DOWN:
        if (belowParallel) {
          this.state = State.BOTTOM;
          if (this.current) this.current.reachedBottom = true;
          return null;
        }
        if (top) return this.#close(this.#since.top, State.UP);
        return null;

      case State.BOTTOM:
        if (driving) this.state = State.DRIVING;
        return null;

      case State.DRIVING: {
        // An athlete who drops straight back below parallel starts the next
        // rep from here. Nothing waits for them to come up between the two.
        if (belowParallel) {
          const done = this.#close(tMs, State.BOTTOM);
          this.#open(tMs, depth);
          return done;
        }
        if (top) return this.#close(this.#since.top, State.UP);
        return null;
      }

      default:
        return null;
    }
  }

  /** `tMs` is when the rep really ended, which for a run of readings is the first of them. */
  #close(tMs: number, next: RepState): RepClosed | null {
    const rep = this.current;
    this.current = null;
    this.state = next;
    if (!rep) return null;
    return {
      type: 'rep',
      depthPass: rep.reachedBottom,
      maxDepth: rep.maxDepth,
      startMs: rep.startMs,
      endMs: tMs,
    };
  }
}
