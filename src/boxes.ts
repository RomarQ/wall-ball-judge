/**
 * The box arithmetic around the detectors: where a frame lands in the model's
 * square input, how a frame is cut into windows and tiles, and how a raw
 * [1, 4 + classes, anchors] prediction becomes boxes in frame pixels.
 *
 * Nothing here touches the browser, so it runs outside a page too, and
 * test/boxes.test.ts checks it without a model.
 */
import { overlap, type Rect } from './reach';
import type { Box } from './types';

/** The lowest class score a box needs to count as a detection. */
export const MIN_SCORE = 0.3;

/**
 * The most boxes a look keeps, best first: more than a rig of marks can fill.
 * The cut comes before the caller keeps the class it asked for, so a cap the
 * marks alone can reach costs it the ball.
 */
export const MAX_BOXES = 32;

/**
 * How much two boxes of one class may share before the lower one goes.
 *
 * The detector answers with a box per anchor, so one ball arrives as a
 * handful of boxes over the same pixels. Ultralytics suppresses at this
 * figure when it does the job itself.
 */
export const IOU_MAX = 0.45;

export interface Letterbox {
  scale: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/**
 * The width the model's training frames were cut at.
 *
 * The model's scores were measured on frames shrunk to this width and then
 * letterboxed. Drawing a full camera frame into the letterbox in one step
 * gives the picture a coarser grain than the model learnt from, which costs
 * small balls: on 886 balls at the target of a gym no training frame shows,
 * the 416 model finds 679 through this width and 642 in one step.
 */
export const CUT_WIDTH = 640;

/** The size to redraw a frame at before the letterbox, or null when it is no wider than the cut. */
export function cutSize(w: number, h: number): { w: number; h: number } | null {
  return w > CUT_WIDTH ? { w: CUT_WIDTH, h: Math.round((h * CUT_WIDTH) / w) } : null;
}

/** The scale from a frame of width w to the cut width: 1 for a frame no wider. */
export function cutScale(w: number, h: number): number {
  const at = cutSize(w, h);
  return at ? at.w / w : 1;
}

/**
 * The square input the detectors were trained at.
 *
 * Training draws each frame with its long side at this size, so a window
 * shows the model the scale it learnt only when it follows the long side.
 * The cut width sets the grain a frame is drawn with (`asTrained`), not the
 * scale of a window: on a portrait frame it shows the ball 1.78 times larger
 * than training did.
 */
export const TRAINED_INPUT = 640;

/** The scale from a w by h frame to the model's input as training drew it. */
export function trainedScale(w: number, h: number): number {
  return TRAINED_INPUT / Math.max(w, h);
}

/**
 * The square of `side` input pixels at the training scale centred on (cx, cy),
 * in frame pixels. It may reach past the frame, and the look shows that part grey:
 * moved inside the frame, a window puts the frame's edge on the edge of the
 * model's input, where the model misses a ball at a plate near that edge.
 */
export function windowAround(cx: number, cy: number, w: number, h: number, side: number): Rect {
  const s = side / trainedScale(w, h);
  return { x: Math.round(cx - s / 2), y: Math.round(cy - s / 2), w: s, h: s };
}

/**
 * Windows of `side` input pixels at the training scale that cover the frame,
 * in frame pixels, each sharing at least `overlap` of those pixels with the
 * next, so that a box up to `overlap` across lies whole inside one of them.
 */
export function tiles(w: number, h: number, side: number, overlap: number): Rect[] {
  const scale = trainedScale(w, h);
  const [s, o] = [side / scale, overlap / scale];
  const starts = (length: number): number[] => {
    if (length <= s) return [0];
    const n = Math.ceil((length - s) / (s - o)) + 1;
    return Array.from({ length: n }, (_, i) => Math.round((i * (length - s)) / (n - 1)));
  };
  return starts(h).flatMap((y) => starts(w).map((x) => ({ x, y, w: Math.min(s, w), h: Math.min(s, h) })));
}

/**
 * Whether `box` reaches a side of `tile` that lies inside the w by h frame,
 * where the tile cut it. A box cut so is whole in the next tile.
 */
export function cutByTile(box: Rect, tile: Rect, w: number, h: number, margin = 2): boolean {
  return (
    (tile.x > 0.5 && box.x <= tile.x + margin) ||
    (tile.y > 0.5 && box.y <= tile.y + margin) ||
    (tile.x + tile.w < w - 0.5 && box.x + box.w >= tile.x + tile.w - margin) ||
    (tile.y + tile.h < h - 0.5 && box.y + box.h >= tile.y + tile.h - margin)
  );
}

/** A box found in the `area` of a frame drawn at `scale`, in the frame's own pixels. */
export function fromArea<T extends Rect>(box: T, area: Rect, scale: number): T {
  return { ...box, x: area.x + box.x / scale, y: area.y + box.y / scale, w: box.w / scale, h: box.h / scale };
}

/** Where a frame of width w and height h lands inside a size by size letterbox. */
export function letterbox(w: number, h: number, size: number): Letterbox {
  const scale = Math.min(size / w, size / h);
  const dw = Math.round(w * scale);
  const dh = Math.round(h * scale);
  return { scale, dx: Math.floor((size - dw) / 2), dy: Math.floor((size - dh) / 2), dw, dh };
}

/** The boxes of `sorted` that do not cover one already taken of the same class. */
export function suppress(sorted: Box[], iouMax: number): Box[] {
  const kept: Box[] = [];
  for (const box of sorted) {
    if (!kept.some((taken) => taken.name === box.name && overlap(taken, box) > iouMax)) kept.push(box);
  }
  return kept;
}

/**
 * A raw [1, 4 + classes, anchors] prediction, as boxes in frame pixels.
 *
 * `dims` are the output's own, which say how many anchors and classes there
 * are. Each anchor keeps its best class, whose index picks its name from
 * `names`; a model with one class, or a class the names do not cover, gets
 * `name`. What comes back scores at least `minScore`, best first, with no box
 * covering one already taken.
 */
export function decode(
  data: ArrayLike<number>,
  dims: readonly number[],
  box: Letterbox,
  minScore: number,
  iouMax: number,
  name = 'ball',
  names: string[] = [],
): Box[] {
  const classes = dims[1] - 4;
  const anchors = dims[2];
  const boxes: Box[] = [];
  for (let i = 0; i < anchors; i += 1) {
    let score = 0;
    let cls = 0;
    for (let k = 0; k < classes; k += 1) {
      const one = data[(4 + k) * anchors + i];
      if (one > score) [score, cls] = [one, k];
    }
    if (!(score >= minScore)) continue;
    const w = data[2 * anchors + i];
    const h = data[3 * anchors + i];
    boxes.push({
      x: (data[i] - w / 2 - box.dx) / box.scale,
      y: (data[anchors + i] - h / 2 - box.dy) / box.scale,
      w: w / box.scale,
      h: h / box.scale,
      score,
      name: names[cls] ?? name,
    });
  }
  boxes.sort((a, b) => b.score - a.score);
  return suppress(boxes, iouMax);
}
