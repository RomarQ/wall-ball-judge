/**
 * A YOLO detector exported to LiteRT, run with LiteRT.js for the web.
 *
 * The detectors are trained with Ultralytics on the Mac's GPU and exported
 * to LiteRT. The result is the shape detector.ts promises: boxes in frame
 * pixels, each with a score and a class name.
 *
 * The model takes a square, letterboxed image and answers with a raw
 * [1, 4 + classes, anchors] prediction: a column per anchor holding the box
 * centre and size in letterbox pixels, then a score per class. Choosing
 * between the columns is the job of `decode` in boxes.ts. The model itself
 * runs in litert-worker.ts.
 */
import { cutScale, cutSize, decode, fromArea, letterbox } from './boxes';
import { config, modelPaths } from './config';
import type { Detector } from './detector';
import type { Frame } from './frame';
import type { Unit } from './types';

export interface LiteRtDetectorOptions {
  modelAssetPath: string;
  scoreThreshold?: number;
  maxResults?: number;
  className?: string;
  /** The model's classes by id, for a model that knows more than one. */
  classNames?: string[];
  /** How much two boxes of one class may share. See IOU_MAX in boxes.ts. */
  iouMax?: number;
  /** Where the model runs: 'gpu' on the GPU when it loads there and answers as the CPU does, else on the CPU; 'cpu' on the CPU only. */
  unit?: Unit;
  /** How precisely a GPU runs the model. */
  gpuPrecision?: GpuPrecision;
}

/** Half precision ('fp16') is the faster; full precision ('fp32') answers as the processor does, within a few millionths. */
export type GpuPrecision = 'fp16' | 'fp32';

function frameSize(video: Frame): { w: number; h: number } {
  if (video instanceof HTMLVideoElement) return { w: video.videoWidth, h: video.videoHeight };
  return { w: video.width, h: video.height };
}

/** What the page asks the detector's worker: to open a model, or to run it on a frame in the model's input. */
export type DetectorRequest =
  | { id: number; type: 'open'; model: string; wasmPaths: string; unit: Unit; gpuPrecision: GpuPrecision }
  | { id: number; type: 'run'; chw: Float32Array };

/** The worker's answer to 'open': the backend in use and the model's square input side. */
export interface Opened {
  id: number;
  delegate: string;
  size: number;
}

/** The worker's answer to 'run': the backend in use, which a failed first frame can change, and the raw prediction. */
export interface Ran {
  id: number;
  delegate: string;
  data: Float32Array;
  dims: number[];
}

/** The worker's answer to a request it could not carry out. */
export interface Failed {
  id: number;
  delegate: string;
  error: string;
}

export type DetectorReply = Opened | Ran | Failed;

type Request = DetectorRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;
/** The answer a request gets when the worker carries it out. */
type Answer<R extends Request> = R extends { type: 'open' } ? Opened : Ran;

/**
 * Loads a detector in a worker and returns a detector whose `detect` is asynchronous.
 *
 * `delegate` names the backend in use, which a failed frame can change.
 */
export async function createLiteRtDetector({
  modelAssetPath,
  scoreThreshold = 0.3,
  maxResults = 32,
  className = 'ball',
  classNames = [],
  iouMax = config.ball.iouMax,
  unit = 'gpu',
  gpuPrecision = 'fp16',
}: LiteRtDetectorOptions): Promise<Detector> {
  const worker = new Worker(new URL('./litert-worker.ts', import.meta.url), { type: 'module' });
  const waiting = new Map<number, { resolve: (reply: Opened | Ran) => void; reject: (err: Error) => void }>();
  let asked = 0;
  let broken: Error | null = null;
  const fail = (err: Error) => {
    broken = err;
    for (const { reject } of waiting.values()) reject(err);
    waiting.clear();
  };
  worker.onmessage = (event: MessageEvent<DetectorReply>) => {
    const reply = event.data;
    const waiter = waiting.get(reply.id);
    waiting.delete(reply.id);
    if ('error' in reply) waiter?.reject(new Error(reply.error));
    else waiter?.resolve(reply);
  };
  worker.onerror = (event) => fail(new Error(event.message || 'the detector worker failed'));
  const ask = <R extends Request>(request: R, transfer: Transferable[] = []) =>
    new Promise<Answer<R>>((resolve, reject) => {
      if (broken) return reject(broken);
      asked += 1;
      // The worker answers each request with the reply of its type, under the request's id.
      waiting.set(asked, { resolve: resolve as (reply: Opened | Ran) => void, reject });
      worker.postMessage({ ...request, id: asked }, transfer);
    });

  let opened: Opened;
  try {
    opened = await ask({
      type: 'open',
      model: modelAssetPath,
      wasmPaths: modelPaths().litertWasm,
      unit,
      gpuPrecision,
    });
  } catch (err) {
    worker.terminate();
    throw err;
  }
  let delegate = opened.delegate;
  const { size } = opened;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d canvas for the detector input');
  const area = size * size;
  const cut = document.createElement('canvas');
  const cutCtx = cut.getContext('2d');
  if (!cutCtx) throw new Error('no 2d canvas for the detector input');
  /** The frame at the width the model learnt from; see CUT_WIDTH in boxes.ts. */
  const asTrained = (video: Frame, w: number, h: number): CanvasImageSource => {
    const at = cutSize(w, h);
    if (!at) return video;
    if (cut.width !== at.w || cut.height !== at.h) [cut.width, cut.height] = [at.w, at.h];
    cutCtx.drawImage(video, 0, 0, at.w, at.h);
    return cut;
  };

  return {
    get delegate() {
      return delegate;
    },
    size,
    async detect(video, _timestampMs, window) {
      const { w, h } = frameSize(video);
      const scale = cutScale(w, h);
      const region = window ?? { x: 0, y: 0, w, h };
      const [sw, sh] = [region.w * scale, region.h * scale];
      const box = letterbox(sw, sh, size);
      ctx.fillStyle = '#727272';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(
        asTrained(video, w, h),
        region.x * scale,
        region.y * scale,
        sw,
        sh,
        box.dx,
        box.dy,
        box.dw,
        box.dh,
      );
      const rgba = ctx.getImageData(0, 0, size, size).data;
      // A fresh buffer each look: it goes to the worker, which owns it from then on.
      const chw = new Float32Array(3 * area);
      for (let i = 0, p = 0; i < area; i += 1, p += 4) {
        chw[i] = rgba[p] / 255;
        chw[area + i] = rgba[p + 1] / 255;
        chw[2 * area + i] = rgba[p + 2] / 255;
      }
      const reply = await ask({ type: 'run', chw }, [chw.buffer]);
      delegate = reply.delegate;
      return decode(reply.data, reply.dims, box, scoreThreshold, iouMax, className, classNames)
        .slice(0, maxResults)
        .map((b) => fromArea(b, region, scale));
    },
    close() {
      fail(new Error('the detector is closed'));
      worker.terminate();
    },
  };
}
