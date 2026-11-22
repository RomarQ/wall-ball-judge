/**
 * The judge's decision on each frame, apart from the page that shows it.
 *
 * Every frame goes through the depth judge (presence, femur ruler, rep
 * counter) and, while the ball check is on, the target check. The ball check
 * looks at frames through a detector that may answer later, so a look is a
 * ticket: `frame` hands one out when the throw wants a look, the caller runs
 * the detector on that frame, and `resolve` takes its boxes, or `abandon`
 * frees the ticket when no answer will come. Nothing in it needs a browser.
 *
 * The order is part of the rule, and the tests hold it:
 * - A look is decided on the state the last frame left, before this frame's
 *   target update.
 * - The marks, the spot and the plate heights are taken when the look starts.
 * - The scene is recorded when the look answers, before the next update.
 * - A sighting reaches the target check on the frame after its look answered.
 */
import { bodyFrame, TargetCheck, TARGETS, type BallSighting, type Target, type Verdict } from './ball';
import { windowAround } from './boxes';
import {
  computeDepth,
  FemurRuler,
  Presence,
  RepCounter,
  type Depth,
  type DepthOptions,
  type RepEvent,
} from './depth';
import { weighedMarks, type Mark } from './placement';
import { awayFromMarks, computeReach, plateAt, type Rect } from './reach';
import type { Box, Landmark } from './types';

/** What the ball check needs beyond the depth thresholds. */
export interface BallTuning {
  /** How far into the plate the ball must reach, as a share of the ball's height. See src/reach.ts. */
  bite: number;
}

export interface FrameInput {
  tMs: number;
  /** The picture's size in pixels. */
  width: number;
  height: number;
  landmarks: Landmark[] | null;
  /** False while the target is being chosen: nothing is counted. */
  armed: boolean;
  /** True when the ball check judges this frame: switched on, with a detector ready. */
  ballCheck: boolean;
  /** Where the target sits across the picture, as a fraction of the width, or null when it is not placed. */
  x: number | null;
  /** The plates the target was placed from, in frame units, the higher first. */
  plates: Rect[];
  /** The side of the window a look reads, in the model's input pixels, or null for the whole picture. */
  windowSide: number | null;
}

/** A look the judge asked for: the frame's own target, as it stood when the look started. */
export interface LookTicket {
  readonly tMs: number;
  readonly marks: Mark[];
  readonly x: number;
  readonly width: number;
  readonly height: number;
  readonly plateHeights: Readonly<Record<Target, number>>;
  /** The part of the picture to look at, in pixels, or null for the whole picture. */
  readonly window: Rect | null;
}

export interface JudgedFrame {
  depth: Depth;
  /** Whether a plausible athlete counts on this frame. */
  present: boolean;
  event: RepEvent | null;
  verdict: Verdict | null;
  /** A look to run on this frame, or null. */
  look: LookTicket | null;
}

/** A plate's box height at a mark, in pixels: two plates take a mark each, the higher first; one plate holds both. */
function plateHeight(which: Target, plates: Rect[], height: number): number {
  const plate = plates.length > 1 ? plates[TARGETS.indexOf(which)] : plates[0];
  return plate ? plate.h * height : 0;
}

/** The window a look reads: `side` input pixels at the training scale, centred on the plates, or on the marks without one. */
function ballWindow(
  side: number,
  x: number,
  marks: Mark[],
  plates: Rect[],
  width: number,
  height: number,
): Rect {
  const spots = plates.length
    ? plates.map((p) => ({ x: p.x * height, y: p.y * height, w: p.w * height, h: p.h * height }))
    : marks.map(({ line }) => ({ x: x * width, y: line * height, w: 0, h: 0 }));
  const x0 = Math.min(...spots.map((b) => b.x));
  const y0 = Math.min(...spots.map((b) => b.y));
  const x1 = Math.max(...spots.map((b) => b.x + b.w));
  const y1 = Math.max(...spots.map((b) => b.y + b.h));
  return windowAround((x0 + x1) / 2, (y0 + y1) / 2, width, height, side);
}

export class FrameJudge {
  readonly counter: RepCounter;
  readonly presence: Presence;
  readonly ruler: FemurRuler;
  readonly target = new TargetCheck();
  readonly #depth: DepthOptions;
  readonly #ball: BallTuning;
  #pending: BallSighting | null = null;
  #open: LookTicket | null = null;

  constructor(depth: DepthOptions, ball: BallTuning) {
    this.#depth = depth;
    this.#ball = ball;
    this.counter = new RepCounter(depth);
    this.presence = new Presence(depth);
    this.ruler = new FemurRuler(depth);
  }

  /** Starts a new set: the target lines and the required target stay, everything judged so far goes. */
  reset(): void {
    this.counter.reset();
    this.presence.reset();
    this.target.reset();
    this.ruler.reset();
    this.#pending = null;
    this.#open = null;
  }

  frame(input: FrameInput): JudgedFrame {
    const { tMs, width, height, landmarks } = input;
    const aspect = width / height || 1;
    const depth: Depth = landmarks
      ? computeDepth(landmarks, aspect, this.#depth, this.ruler.length)
      : { ok: false, reason: 'no-pose' };
    const body = landmarks ? bodyFrame(landmarks, aspect, this.#depth.visibilityMin) : null;
    // The athlete is there while the body is: a squat hides the knees from a camera behind it, which leaves the
    // depth without a reading but the athlete in the picture.
    const present = this.presence.update({ ok: body !== null, torso: body?.torso });
    const reading = present && depth.ok;
    if (reading) this.ruler.update(depth);
    // Choosing the target: watch, but count nothing and let no squat half-close.
    if (!input.armed) this.counter.reset();
    const event = this.counter.update({
      depth: reading ? depth.depth : 0,
      visible: reading,
      tMs,
    });

    if (!input.ballCheck) {
      const verdict: Verdict | null =
        event?.type === 'rep'
          ? {
              type: 'verdict',
              rep: event,
              valid: event.depthPass,
              reason: event.depthPass ? null : 'depth',
              target: null,
              ballSeen: false,
            }
          : null;
      return { depth, present, event, verdict, look: null };
    }
    const ball = this.#pending;
    this.#pending = null;
    const look = this.#ask(input);
    const verdict = this.target.update({
      tMs,
      state: this.counter.state,
      squat: this.counter.current,
      repEvent: event,
      ball,
    });
    return { depth, present, event, verdict, look };
  }

  /**
   * The part of a frame like `input` that a look reads, in pixels: a window centred on the plates, or on the marks
   * without one, or null for the whole picture. A runtime that starts a look before the frame is judged draws this.
   */
  lookWindow({
    width,
    height,
    x,
    plates,
    windowSide,
  }: Pick<FrameInput, 'width' | 'height' | 'x' | 'plates' | 'windowSide'>): Rect | null {
    const marks = weighedMarks(this.target.lines, plates);
    if (!windowSide || !marks.length || x === null) return null;
    return ballWindow(windowSide, x, marks, plates, width, height);
  }

  /**
   * A ticket for a look at this frame, while a throw is in the air and no
   * look is out. No rate limit: a ball is on the target for a fraction of a
   * second, and ten looks a second miss throws that thirty catch.
   */
  #ask(input: FrameInput): LookTicket | null {
    const { tMs, width, height, x, plates } = input;
    // Every mark on the rig, not only the ones that count: a ball goes to the nearest of them.
    const marks = weighedMarks(this.target.lines, plates);
    if (!this.target.detecting || this.#open || !marks.length || x === null) return null;
    const ticket: LookTicket = {
      tMs,
      marks,
      x,
      width,
      height,
      plateHeights: {
        upper: plateHeight('upper', plates, height),
        lower: plateHeight('lower', plates, height),
      },
      window: this.lookWindow(input),
    };
    this.#open = ticket;
    return ticket;
  }

  /**
   * Takes the boxes a look found, in pixels, and returns the ball it puts on
   * the nearest mark, which the next frame judges, or null.
   */
  resolve(ticket: LookTicket, found: Box[]): BallSighting | null {
    if (this.#open !== ticket) return null;
    this.#open = null;
    // A model that also knows the target must not offer the plate as a ball.
    const boxes = found.filter((b) => b.name === 'ball');
    const { marks, x, width, height, plateHeights } = ticket;
    // A fast throw has the ball at the mark by the first look, and a look that remembered it as resting would pass the throw over.
    const points = marks.map(({ line }) => ({ x: x * width, y: line * height }));
    this.target.recordScene(awayFromMarks(boxes, points));
    // The ball is on the mark whose centre is nearest its own; see src/reach.ts.
    let nearest = null;
    let struck: Target | null = null;
    for (const { which, line } of marks) {
      const at = computeReach(boxes, plateAt(x * width, line * height, plateHeights[which]), {
        idle: this.target.scene,
        bite: this.#ball.bite,
      });
      if (!at.ok) continue;
      if (!nearest || at.off < nearest.off) {
        nearest = at;
        struck = at.hit ? which : null;
      }
    }
    if (!nearest) return null;
    const box = nearest.ball;
    const sighting: BallSighting = {
      ...box,
      centre: { x: (box.x + box.w / 2) / height, y: (box.y + box.h / 2) / height },
      struck,
    };
    this.#pending = sighting;
    return sighting;
  }

  /** Frees a ticket whose look will not answer: the detector failed, or never ran. */
  abandon(ticket: LookTicket): void {
    if (this.#open === ticket) this.#open = null;
  }

  /** The verdict on a throw still in the air when judging stops at `tMs`, or null. */
  end(tMs: number): Verdict | null {
    return this.target.endThrow(tMs);
  }
}
