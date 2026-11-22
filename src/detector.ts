/**
 * The detector behind the camera checks: the ball during a throw, the target plate on demand.
 *
 * Wraps the LiteRT detector the way pose.ts wraps MediaPipe, so the rest of
 * the app never picks a runtime. Returns plain boxes in frame pixels.
 */
import { MAX_BOXES } from './boxes';
import { config, modelPaths } from './config';
import { createLiteRtDetector, type GpuPrecision } from './litert-detector';
import type { Rect } from './reach';
import type { Frame } from './frame';
import type { Box, Unit } from './types';

export interface Detector {
  delegate: string;
  /** The square input size of the model. */
  size?: number;
  /**
   * Every box in the frame, in frame pixels, best first. With `window` the
   * model sees only that part of the frame, in frame pixels, grey where it
   * reaches past the frame; see `windowAround` and `tiles` in boxes.ts.
   */
  detect(video: Frame, timestampMs: number, window?: Rect): Box[] | Promise<Box[]>;
  close(): void;
}

export interface DetectorOptions {
  scoreThreshold?: number;
  maxResults?: number;
  /** Overrides the configured model, which the evaluation page uses to compare models. */
  modelAssetPath?: string;
  /** The class name the model's rows get. */
  className?: string;
  /** The classes of a model that knows more than one, by id. */
  classNames?: string[];
  /** Where the model runs; see LiteRtDetectorOptions. */
  unit?: Unit;
  /** How precisely a GPU runs the model; see LiteRtDetectorOptions. */
  gpuPrecision?: GpuPrecision;
}

/** Loads the detector model and returns a detector. */
export function createDetector({
  scoreThreshold = 0.3,
  maxResults = MAX_BOXES,
  modelAssetPath = modelPaths().detector,
  className = 'ball',
  classNames = [],
  unit = 'gpu',
  gpuPrecision,
}: DetectorOptions = {}): Promise<Detector> {
  return createLiteRtDetector({
    modelAssetPath,
    scoreThreshold,
    maxResults,
    className,
    classNames,
    unit,
    gpuPrecision,
  });
}

/** The ball check's detector on `unit`, as a set loads it. */
export function createBallDetector(unit: Unit): Promise<Detector> {
  return createDetector({
    scoreThreshold: config.ball.minScore,
    classNames: modelPaths().detectorClasses,
    unit,
  });
}
