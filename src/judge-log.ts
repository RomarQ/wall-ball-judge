/**
 * A record of everything the judge saw and decided in one set, for `?log=1`.
 *
 * It holds the judge's inputs on every frame (the time, the picture's size,
 * the landmarks, whether the set was armed, the target as the board held it)
 * and every look of the ball check with the boxes it found, so a test can
 * feed the same inputs to the judging code and compare its decisions frame by
 * frame. The board downloads it when the set stops.
 */
import type { Rect } from './reach';
import type { Box, Landmark } from './types';

/** The target as the board holds it: the lines and spot in fractions of the picture, the plates in frame units. */
export interface LoggedTarget {
  lines: { upper: number | null; lower: number | null };
  required: 'upper' | 'lower';
  x: number | null;
  plates: Rect[];
}

export interface LoggedVerdict {
  valid: boolean;
  reason: string | null;
  target: string | null;
  ballSeen: boolean;
  startMs: number;
  endMs: number;
  maxDepth: number;
}

/** One judged frame: its inputs, and what the judge made of it. */
export interface LoggedFrame {
  tMs: number;
  w: number;
  h: number;
  armed: boolean;
  mode: 'target' | 'depth-only';
  /** x, y, z and visibility of each landmark, or null without a pose. */
  landmarks: number[] | null;
  /** The target, on the first frame and on every frame it changed. */
  target?: LoggedTarget;
  depth: number | null;
  state: string;
  /** The id of the look this frame started. */
  look?: number;
  verdict?: LoggedVerdict;
}

/** One look of the ball check: the frame that started it, and when and what it answered. */
export interface LoggedLook {
  id: number;
  frame: number;
  window: Rect | null;
  /** How many frames had been judged when the answer came, so it reaches the judge before frame `after`. */
  after?: number;
  /** Every box the detector returned, in frame pixels, or null when the look failed. */
  found?: Box[] | null;
}

export interface JudgeLogData {
  version: 1;
  /** The thresholds in force, for reading the log; the replay takes its own. */
  config: unknown;
  frames: LoggedFrame[];
  looks: LoggedLook[];
  /** The verdict `stop` gave a throw still in the air, and when. */
  end?: { tMs: number; verdict: LoggedVerdict | null };
}

export function flatLandmarks(landmarks: Landmark[] | null): number[] | null {
  return landmarks ? landmarks.flatMap((p) => [p.x, p.y, p.z ?? 0, p.visibility ?? 0]) : null;
}

export function landmarksFrom(flat: number[] | null): Landmark[] | null {
  if (!flat) return null;
  const points: Landmark[] = [];
  for (let i = 0; i < flat.length; i += 4)
    points.push({ x: flat[i], y: flat[i + 1], z: flat[i + 2], visibility: flat[i + 3] });
  return points;
}

export class JudgeLog {
  readonly data: JudgeLogData;
  #lastTarget = '';

  constructor(config: unknown) {
    this.data = { version: 1, config, frames: [], looks: [] };
  }

  /** Adds a frame's inputs, and returns it for its outputs. */
  frame(input: Omit<LoggedFrame, 'target' | 'depth' | 'state'>, target: LoggedTarget): LoggedFrame {
    const frame: LoggedFrame = { ...input, depth: null, state: '' };
    const shown = JSON.stringify(target);
    if (shown !== this.#lastTarget) {
      frame.target = JSON.parse(shown) as LoggedTarget;
      this.#lastTarget = shown;
    }
    this.data.frames.push(frame);
    return frame;
  }

  /** Records a look the frame being judged starts, and returns its id. */
  lookStarted(window: Rect | null): number {
    const id = this.data.looks.length;
    this.data.looks.push({ id, frame: this.data.frames.length - 1, window });
    this.data.frames[this.data.frames.length - 1].look = id;
    return id;
  }

  /** Records a look's answer, or its failure with null. */
  lookDone(id: number, found: Box[] | null): void {
    const look = this.data.looks[id];
    look.after = this.data.frames.length;
    look.found = found;
  }
}

export function loggedVerdict(v: {
  valid: boolean;
  reason: string | null;
  target?: string | null;
  ballSeen: boolean;
  rep: { startMs: number; endMs: number; maxDepth: number };
}): LoggedVerdict {
  return {
    valid: v.valid,
    reason: v.reason,
    target: v.target ?? null,
    ballSeen: v.ballSeen,
    startMs: v.rep.startMs,
    endMs: v.rep.endMs,
    maxDepth: v.rep.maxDepth,
  };
}
