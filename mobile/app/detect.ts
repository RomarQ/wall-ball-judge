/** The detectors' rows as boxes in frame pixels, read as the PWA's litert-detector.ts reads them. */
import manifest from '../../models/manifest.json';
import { cutScale, cutSize, decode, fromArea, IOU_MAX, letterbox, MAX_BOXES, type Box, type Rect } from './core';

interface TrainedFile {
  input: number;
  classes: string[];
}

const files = manifest.files as Record<string, TrainedFile>;

/** The ball model the app runs, and the search model, as the manifest describes them. */
export const BALL_MODEL = files[manifest.ball];
export const SEARCH_MODEL = files[manifest.finder];

/**
 * Boxes in a `width` by `height` frame from a look's rows: `[4 + classes, count]`, channel first, boxes in the input
 * pixels of `model`, as the frame was shrunk to the PWA's cut width and `window` of it, or the whole frame without one,
 * letterboxed into it.
 */
export function boxesOf(
  rows: number[],
  count: number,
  model: TrainedFile,
  width: number,
  height: number,
  minScore: number,
  className: string,
  window?: Rect,
): Box[] {
  const scale = cutScale(width, height);
  const cut = cutSize(width, height) ?? { w: width, h: height };
  const placed = window
    ? letterbox(window.w * scale, window.h * scale, model.input)
    : letterbox(cut.w, cut.h, model.input);
  return decode(rows, [1, 4 + model.classes.length, count], placed, minScore, IOU_MAX, className, model.classes)
    .slice(0, MAX_BOXES)
    .map((box) => fromArea(box, window ?? { x: 0, y: 0, w: width, h: height }, scale));
}
