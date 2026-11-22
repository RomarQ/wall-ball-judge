/**
 * The camera ball check: picks the ball out of the detector's boxes, and pairs
 * a crossing of the target line with the squat that threw the ball.
 *
 * No DOM and no model code. Both parts take plain numbers, so
 * test/ball.test.ts drives them with no camera and no detector.
 *
 * Distances are in frame units: fractions of the frame height, with x scaled
 * by the aspect ratio so both axes share the unit. A detector box in pixels
 * converts by dividing everything by the frame height.
 */
import { LM, type OpenRep, type RepEvent } from './depth';
import type { Box, Landmark, Point } from './types';

const vis = (l: Landmark) => (typeof l.visibility === 'number' ? l.visibility : 1);
const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function framePoint(
  landmarks: Landmark[],
  index: number,
  aspect: number,
  visibilityMin: number,
): Point | null {
  const l = landmarks?.[index];
  if (!l || vis(l) < visibilityMin) return null;
  return { x: l.x * aspect, y: l.y };
}

/** The midpoint of a left/right pair, or whichever side is visible. */
function pair(
  landmarks: Landmark[],
  left: number,
  right: number,
  aspect: number,
  visibilityMin: number,
): Point | null {
  const a = framePoint(landmarks, left, aspect, visibilityMin);
  const b = framePoint(landmarks, right, aspect, visibilityMin);
  if (a && b) return mid(a, b);
  return a || b;
}

/** The athlete's scale, in frame units. */
export interface Body {
  /** The shoulder-to-hip distance, which says how big the athlete is in the picture. */
  torso: number;
}

/** Returns null when the torso itself is hidden. */
export function bodyFrame(landmarks: Landmark[], aspect = 1, visibilityMin = 0.5): Body | null {
  const shoulders = pair(landmarks, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, aspect, visibilityMin);
  const hips = pair(landmarks, LM.LEFT_HIP, LM.RIGHT_HIP, aspect, visibilityMin);
  if (!shoulders || !hips) return null;
  const torso = dist(shoulders, hips);
  return torso < 1e-6 ? null : { torso };
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A detector box that passed the filters, with its centre in frame units. */
export interface BallSighting extends Box {
  centre: Point;
  /** The target the ball struck. See BallSeen. */
  struck: Target | null;
}

/** The targets, top down. A ball that reaches the upper one has passed the lower one. */
export const TARGETS = ['upper', 'lower'] as const;
export type Target = (typeof TARGETS)[number];

/** What the target saw this frame: where the ball was, and the target it struck. */
export interface BallSeen {
  centre: Point;
  /** The target the hit rule in src/reach.ts puts the ball on, or null for none. */
  struck: Target | null;
}

/** The higher of two targets, or the one that is not null. */
const higher = (a: Target | null, b: Target | null): Target | null =>
  a === null || (b !== null && TARGETS.indexOf(b) < TARGETS.indexOf(a)) ? b : a;

/** A squat, as far as the counter has seen it. */
export interface Squat {
  /** When the hips left the top. */
  startMs: number;
  /** How far below parallel they went, in percent of femur length. */
  maxDepth: number;
}

/** The squat a verdict is about, ended at the moment the verdict came. */
export interface JudgedRep extends Squat {
  endMs: number;
}

/** A judged rep. `target` is the highest target the ball struck, by the rule that makes the hit. */
export interface Verdict {
  type: 'verdict';
  rep: JudgedRep;
  valid: boolean;
  reason: null | 'depth' | 'target';
  target: Target | null;
  ballSeen: boolean;
}

interface ThrowWindow {
  /** The squat that made this throw. */
  squat: Squat;
  last: Point | null;
  scene: Rect[] | null;
  seen: boolean;
  /** The highest target the ball struck in this throw. */
  struck: Target | null;
}

const newWindow = (squat: Squat): ThrowWindow => ({
  squat,
  last: null,
  scene: null,
  seen: false,
  struck: null,
});

/**
 * Pairs a throw with the squat that made it, and says which target it struck.
 *
 * The rule is: break parallel, then hit the target, and the rep counts. The
 * hit is what makes the rep, so the verdict comes the moment the ball touches
 * and nothing waits for the athlete to stand back up. A phone low to the floor
 * reads a standing athlete much like a shallow one, and a set filmed that way
 * can finish without the counter ever seeing standing again. Every rep in it
 * still counts.
 *
 * Call `update` once per frame with the rep counter's state, its open squat
 * and any rep event, plus what the detector saw while `detecting` is true. It
 * returns null, or one verdict.
 *
 * There are two targets, `upper` and `lower`, the men's and the women's, and
 * `required` names the one this athlete must reach. A throw opens
 * when the squat leaves BOTTOM, which is when the athlete drives the ball up.
 * It ends on the hit, or as a miss once the next squat is under way, because
 * the ball is back in the hands by then. Nothing times it, so a throw made
 * slowly is judged the same as a fast one. A squat that never reached BOTTOM
 * opens no throw: the depth fault decides on its own.
 */
export class TargetCheck {
  /** The target lines, as fractions of the frame height. The lower one is the larger. */
  lines: Record<Target, number | null> = { upper: null, lower: null };
  /** The target this athlete must reach. */
  required: Target = 'upper';
  window: ThrowWindow | null = null;
  prevState: string | null = null;

  /**
   * Whether a strike at `target` makes the rep: one at the required target or
   * higher, so the women's throw that sails to the men's target counts and
   * the men's throw that lands on the women's does not.
   */
  #counts(target: Target | null): boolean {
    return target !== null && TARGETS.indexOf(target) <= TARGETS.indexOf(this.required);
  }

  reset(): void {
    this.window = null;
    this.prevState = null;
  }

  /** True while a throw is in the air and the ball has not yet touched. */
  get detecting(): boolean {
    return this.window !== null;
  }

  /** What was already in place when the throw began, so a later look can pass it over. */
  get scene(): Rect[] {
    return this.window?.scene ?? [];
  }

  /**
   * Records what the first detection of the throw found, in pixels.
   *
   * The ball is still in the hands then, so whatever else is already in
   * place is not the ball: a racked ball behind the athlete, a light above
   * the line. Later detections of the same throw ignore it. Only the first
   * call of a throw counts.
   */
  recordScene(boxes: Box[]): void {
    if (this.window && !this.window.scene)
      this.window.scene = boxes.map(({ x, y, w, h }) => ({ x, y, w, h }));
  }

  update({
    tMs,
    state,
    squat = null,
    repEvent = null,
    ball = null,
  }: {
    tMs: number;
    state: string;
    /** The squat under way, from the rep counter. One that began after the throw's own ends the throw. */
    squat?: OpenRep | null;
    repEvent?: RepEvent | null;
    ball?: BallSeen | null;
  }): Verdict | null {
    let verdict: Verdict | null = null;

    if (this.window && ball) {
      this.window.seen = true;
      this.window.struck = higher(this.window.struck, ball.struck);
    }

    if (repEvent?.type === 'abort') {
      this.window = null;
    } else if (repEvent && !repEvent.depthPass) {
      verdict = {
        type: 'verdict',
        rep: repEvent,
        valid: false,
        reason: 'depth',
        target: null,
        ballSeen: false,
      };
    } else if (repEvent && this.window) {
      // The closed rep is the fuller account of the squat.
      this.window.squat = repEvent;
    }

    const nextSquat = squat !== null && this.window !== null && squat.startMs > this.window.squat.startMs;
    if ((this.window && this.#counts(this.window.struck)) || nextSquat) verdict = this.endThrow(tMs);

    if (this.prevState === 'BOTTOM' && state === 'DRIVING') {
      // The next throw begins, so the last one is done whatever it did.
      if (this.window) verdict = this.endThrow(tMs);
      this.window = newWindow(squat ?? { startMs: tMs, maxDepth: 0 });
    }
    this.prevState = state;
    return verdict;
  }

  /**
   * Ends the throw under way and returns its verdict: valid when the ball hit
   * the target, a target fault when it did not. Null when no throw is under way.
   */
  endThrow(tMs: number): Verdict | null {
    const w = this.window;
    this.window = null;
    if (!w) return null;
    const valid = this.#counts(w.struck);
    return {
      type: 'verdict',
      rep: { startMs: w.squat.startMs, endMs: tMs, maxDepth: w.squat.maxDepth },
      valid,
      reason: valid ? null : 'target',
      target: w.struck,
      ballSeen: w.seen,
    };
  }
}
