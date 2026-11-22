/**
 * The shapes shared between the modules: a landmark, a box, a rep.
 */

/** One of the 33 pose points, in fractions of the frame, as MediaPipe gives it. */
export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

/** A detection in frame pixels. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
  name: string;
}

/** A point in frame units: y in fractions of the height, x scaled to share that unit. */
export interface Point {
  x: number;
  y: number;
}

/** The part of the phone that runs a model. */
export type Unit = 'gpu' | 'cpu';
