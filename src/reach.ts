/**
 * Whether a throw touched the target, and how far off centre.
 *
 * The depth check measures the hip against the knee and calls the femur the
 * ruler. This is the same shape for the other half of a rep: the ball against
 * the target, with the ball's own height as the ruler.
 *
 * The rule is contact. The ball is a disc and the plate is a disc, and the
 * two touch when the distance between their centres is within a ball radius
 * plus a plate radius. A ball that strikes the lower half of the plate has
 * the plate's centre outside it, and it is a hit all the same.
 *
 * The target is the one the judge chose, not one picked out of the picture.
 * A gym wall carries marks at several heights and a rig carries rows of them,
 * so choosing per frame was never sound: the ball passes the women's mark on
 * its way to the men's, and a plate at the frame's edge is measured short.
 * The division says which of a pair is being judged, and this rule is given
 * that one.
 *
 * Every ball on the frame is considered, not the one the detector is surest
 * of. A gym keeps spare balls on the floor and on the racks, and a still one
 * can score higher than the one in play. Those are named in `idle` and passed
 * over: what tells them from the ball being thrown is that they do not move,
 * which the caller watches for across frames.
 */
import type { Box } from './types';

/** A box in the same pixel units as the detector's own. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ReachOptions {
  /** Balls resting in the gym, by where they rest. A ball found here is not in play. */
  idle: Rect[];
  /** Two boxes sharing this much of their area are in the same place. */
  samePlace: number;
  /**
   * How far the ball's edge must reach past the plate's edge to count as a
   * touch, in ball heights. The rule is contact, the ball's disc meeting the
   * plate's; a graze at the rim sits inside the boxes' own error.
   */
  bite: number;
}

export const DEFAULTS: ReachOptions = { idle: [], samePlace: 0.5, bite: 0.1 };

/**
 * The boxes to remember as resting when a throw begins: those away from every
 * mark, by `heights` ball heights from the mark's point. A ball already at a
 * mark on the first look of a throw is the throw's own, and remembering it as
 * resting would pass the throw over for the rest of its flight.
 */
export function awayFromMarks(boxes: Box[], marks: { x: number; y: number }[], heights = 1): Box[] {
  return boxes.filter((b) => {
    const from = centre(b);
    return !marks.some((m) => Math.hypot(from.x - m.x, from.y - m.y) <= heights * b.h);
  });
}

/** How much two boxes share, 0 to 1. */
export function overlap(a: Rect, b: Rect): number {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const shared = w * h;
  return shared / (a.w * a.h + b.w * b.h - shared);
}

export type Reach =
  | { ok: false; reason: 'no-ball' }
  | {
      ok: true;
      /** How far the ball's centre sits from the target's, in ball heights. */
      off: number;
      /** The distance at which the ball's edge meets the plate's, in ball heights: its own radius and the plate's. */
      touch: number;
      /** The ball touched the plate: `off` within `touch`, less the bite. */
      hit: boolean;
      ball: Box;
    };

const centre = (b: Rect) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/**
 * The target a mark stands for: a plate `plateHeight` tall, centred on the mark at `x`, `y`.
 *
 * All in frame pixels. A mark with no plate under it has `plateHeight` 0, which
 * `computeReach` takes as a ball across.
 */
export function plateAt(x: number, y: number, plateHeight: number): Rect {
  return { x, y: y - plateHeight / 2, w: 0, h: plateHeight };
}

/**
 * The closest any ball on the frame came to `target`, and whether it touched.
 *
 * `boxes` are the ball boxes of one look and `target` is the chosen target,
 * both in frame pixels. The reading is in ball heights, so the frame's own size never
 * enters it. The target's height is the plate's, when the finder boxed it. A
 * plate the judge tapped has no box, and is taken as a ball across, which a
 * HYROX plate is.
 */
export function computeReach(boxes: Box[], target: Rect, options: Partial<ReachOptions> = {}): Reach {
  const cfg = { ...DEFAULTS, ...options };
  const balls = boxes.filter(
    (b) => b.w > 0 && b.h > 0 && !cfg.idle.some((rest) => overlap(b, rest) >= cfg.samePlace),
  );
  if (!balls.length) return { ok: false, reason: 'no-ball' };

  const to = centre(target);
  let best = balls[0];
  let off = Infinity;
  for (const b of balls) {
    const from = centre(b);
    const away = Math.hypot(from.x - to.x, from.y - to.y) / b.h;
    if (away < off) [best, off] = [b, away];
  }
  const touch = 0.5 + (target.h > 0 ? target.h / (2 * best.h) : 0.5);
  return { ok: true, off, touch, hit: off <= touch - cfg.bite, ball: best };
}
