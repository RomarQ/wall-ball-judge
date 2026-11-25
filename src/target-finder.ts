/**
 * Finding the target plate in the picture, so the lines place themselves.
 *
 * The trained detector's `target` class boxes the plate (see docs/models.md);
 * the marks sit at fixed shares of a plate's height. A tall box is a
 * two-mark plate, the upper mark near the top and the lower near the
 * bottom. A squat box is a single disc, and both lines fall on its centre.
 * Two squat boxes stacked in one lane are the two heights of one rig, and
 * each gives its own line. The judge confirms or corrects by dragging.
 */
import { config, modelPaths } from './config';
import { createDetector, type Detector } from './detector';
import { DEFAULTS, readLook, type FinderOptions, type Look } from './placement';
import { cutByTile, suppress, tiles, TRAINED_INPUT } from './boxes';
import type { Frame } from './frame';
import type { Box } from './types';

function frameHeight(video: Frame): number {
  return video instanceof HTMLVideoElement ? video.videoHeight : video.height;
}

function frameWidth(video: Frame): number {
  return video instanceof HTMLVideoElement ? video.videoWidth : video.width;
}

export class TargetFinder {
  cfg: FinderOptions;
  detector: Detector | null = null;
  /** The best score of the last look, candidate or not, so a miss can say how close it was. */
  lastBest = 0;

  constructor(options: Partial<FinderOptions> = {}) {
    this.cfg = { ...DEFAULTS, ...options };
  }

  /** Releases the model. The next search loads it again. */
  close(): void {
    this.detector?.close();
    this.detector = null;
  }

  /**
   * Every box of one search look, best first: the whole frame, and with a model whose input is below the training
   * input, then tiles of it at the training scale, a box a tile cut at its edge left to the tile that holds it whole.
   * A model at the training input sees the whole frame at that scale already.
   */
  async #look(detector: Detector, video: Frame): Promise<Box[]> {
    if (!detector.size || detector.size >= TRAINED_INPUT) return detector.detect(video, performance.now());
    const [w, h] = [frameWidth(video), frameHeight(video)];
    const found = await detector.detect(video, performance.now());
    for (const tile of tiles(w, h, detector.size, this.cfg.tileOverlap)) {
      const boxes = await detector.detect(video, performance.now(), tile);
      found.push(...boxes.filter((b) => !cutByTile(b, tile, w, h)));
    }
    return suppress(
      found.sort((a, b) => b.score - a.score),
      config.ball.iouMax,
    );
  }

  /** Loads the model, unless the finder holds it. */
  async load(): Promise<Detector> {
    this.detector ??= await createDetector({
      modelAssetPath: modelPaths().targetDetector,
      scoreThreshold: this.cfg.lookScore,
      className: 'target',
      classNames: modelPaths().targetDetectorClasses,
      // Half precision moves a plate's score by up to 0.02, enough to change which plate leads the search.
      gpuPrecision: 'fp32',
    });
    return this.detector;
  }

  /** The plates in the frame, best first, and the balls the same look saw. Loads the model on the first call. */
  async find(video: Frame): Promise<Look> {
    const { look, best } = readLook(await this.#look(await this.load(), video), frameHeight(video), this.cfg);
    this.lastBest = best;
    return look;
  }
}
