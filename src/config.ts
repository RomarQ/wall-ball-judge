/**
 * Model sources and tunable thresholds.
 *
 * The pose models come from Google's storage. The trained detectors come
 * from wherever models/manifest.json says: `repo`, the files committed under
 * public/models and served by the app, or `hub`, the Hugging Face Hub at the
 * manifest's revision. A revision the manifest offers beside it, chosen in
 * the settings, comes from its tag on the Hub. The service worker caches them
 * all on first use, so a phone that has run once runs offline. A build with
 * `VITE_MODELS=local` reads every shipped model from the app's own models
 * folder instead, filled by `npm run models:fetch`, for a self-hosted copy or
 * a gym with no signal.
 */
import manifest from '../models/manifest.json';
import { ballFileAt, ballInputs, type BallModels } from './ball-model';
import { modelAddresses, onHub } from './model-addresses';
import { IOU_MAX, MIN_SCORE } from './boxes';
import { DEFAULTS as DEPTH } from './depth';
import { DEFAULTS as REACH } from './reach';
import {
  CONFIDENCE_DEFAULT,
  JUDGING_DETECTION,
  poseConfidence,
  SEARCH_CONFIDENCE,
  storedBallInput,
  storedModels,
} from './settings';
import type { Unit } from './types';

/** A trained file as the manifest describes it. */
interface TrainedFile {
  input?: number;
  classes?: string[];
  trained?: string;
}

type Files = Record<string, TrainedFile>;

/** A revision as the manifest describes it: its files, and the ones the ball check and the target search run. */
interface Revision extends BallModels {
  files: Files;
  finder: string;
}

const SHIPPED: Revision = manifest;
/** The revisions the settings offer beside the shipped one. */
const OFFERED = manifest.offered as Record<string, Revision>;

/** The revisions a person can choose, the shipped one first, each with the date its detectors were trained. */
export function modelRevisions(): { revision: string; trained: string | null }[] {
  const trainedOf = (revision: Revision) => revision.files[revision.ball]?.trained ?? null;
  return [
    { revision: manifest.revision, trained: trainedOf(SHIPPED) },
    ...Object.entries(OFFERED).map(([revision, offered]) => ({ revision, trained: trainedOf(offered) })),
  ];
}

/**
 * The revision the settings chose, or the shipped one. A stored revision the
 * manifest no longer offers falls back to the shipped one, so a phone left on
 * a dropped revision does not load an address that is gone.
 */
function chosenModels(): string {
  const stored = typeof localStorage === 'undefined' ? null : storedModels();
  return stored !== null && Object.hasOwn(OFFERED, stored) ? stored : manifest.revision;
}

const revisionInUse = (): Revision =>
  chosenModels() === manifest.revision ? SHIPPED : OFFERED[chosenModels()];

/** The files of the revision in use. */
const filesInUse = (): Files => revisionInUse().files;

/** The file the ball check runs: the revision in use's model at the input size the settings chose. */
const ballFile = (): string =>
  ballFileAt(revisionInUse(), typeof localStorage === 'undefined' ? null : storedBallInput());
/** The file the target search runs, in the revision in use. */
const finderFile = (): string => revisionInUse().finder;

export type ModelSource = 'remote' | 'local';
export type PoseQuality = 'full' | 'lite';

/** A number this page asked for in its address, or `fallback`. */
function asked(name: string, fallback: number): number {
  if (typeof location === 'undefined') return fallback;
  const value = Number(new URLSearchParams(location.search).get(name));
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : fallback;
}

/** Whether this page's address turns `name` on (`1`) or off (`0`), else `fallback`. */
function askedSwitch(name: string, fallback: boolean): boolean {
  if (typeof location === 'undefined') return fallback;
  const value = new URLSearchParams(location.search).get(name);
  return value === '1' ? true : value === '0' ? false : fallback;
}

/** The unit this page asked the pose to run on in its address, or null when it names none. */
function askedPoseUnit(): Unit | null {
  if (typeof location === 'undefined') return null;
  const asked = new URLSearchParams(location.search).get('delegate')?.toLowerCase();
  return asked === 'gpu' || asked === 'cpu' ? asked : null;
}

/**
 * The folder under the app's models folder whose two detectors this page loads
 * instead of the shipped ones, from `?models=`, so a candidate runs on a phone
 * without a build, or one `.tflite` file there that does both jobs. Its files
 * sit at a new path, so the service worker fetches them rather than serve the
 * shipped detector from its model cache.
 */
function askedModels(): string | null {
  if (typeof location === 'undefined') return null;
  const folder = new URLSearchParams(location.search).get('models');
  return folder && /^[\w-]+(\/[\w-]+)*(\.tflite)?$/.test(folder) ? folder : null;
}

/** The trained detectors this page runs: the candidate its address asked for, else the revision the settings chose. */
export function modelsInUse(): string {
  return askedModels() ?? chosenModels();
}

/** The ball check's model in use, as the detectors and the file, which a phone check's figure belongs to. */
export function ballModelInUse(): string {
  return `${modelsInUse()}/${ballFile()}`;
}

/** The input sizes the settings offer for the ball model, in pixels, and the one in use. */
export function ballInputChoices(): { inputs: number[]; inUse: number | undefined } {
  return { inputs: ballInputs(revisionInUse()), inUse: filesInUse()[ballFile()]?.input };
}

/** The stored confidence, which one page may override for a test. */
const sure = () => (typeof localStorage === 'undefined' ? CONFIDENCE_DEFAULT : poseConfidence());

/** A path under the app's own origin, whatever page imports this and wherever the app is mounted. */
const here = (path: string) => new URL(import.meta.env.BASE_URL + path, document.baseURI).href;
const addresses = () => modelAddresses(here(''), config.models === 'local');

/** A trained detector: a candidate this page asked for, else an offered revision from the Hub, else the shipped one. */
const trained = (file: string) => {
  const candidate = askedModels();
  if (candidate)
    return here(/\.tflite$/.test(candidate) ? `models/${candidate}` : `models/${candidate}/${file}`);
  const revision = chosenModels();
  return revision === manifest.revision ? addresses().shipped(file) : onHub(revision, file);
};

/** The classes a trained detector's rows name, in the order of their ids, as the manifest lists them. */
const classesOf = (file: string): string[] => filesInUse()[file]?.classes ?? [];

export interface ModelPaths {
  poseLite: string;
  poseFull: string;
  /** The detector for the ball check, trained on wall-ball videos. The stock COCO model never boxes a black medicine ball. */
  detector: string;
  /** The same detector at a larger input, for the target search. See docs/models.md. */
  targetDetector: string;
  /** The classes each detector names, by id; one model may serve both and name both. */
  detectorClasses: string[];
  targetDetectorClasses: string[];
  /** The MediaPipe WASM runtime, copied from the npm package at build time. */
  mediapipeWasm: string;
  /** The LiteRT.js WASM files, which run the detectors, copied from the npm package at build time. */
  litertWasm: string;
}

export const config = {
  models: (import.meta.env.VITE_MODELS === 'local' ? 'local' : 'remote') as ModelSource,

  /** Depth thresholds, as a percentage of femur length. See src/depth.ts. */
  depth: DEPTH,

  /**
   * The camera ball check. Sizes and radii are in torso lengths, so they do
   * not change with the distance from the camera. See src/ball.ts.
   */
  ball: {
    minScore: MIN_SCORE,
    /**
     * The ball check looks through a window of the model's input at the scale
     * training drew the frames at (`trainedScale`), centred on the placed target.
     * Off, it sees the whole frame, which a model with an input below the training
     * input sees at less than the trained scale. `?windows=1` or `0` sets it for a page.
     */
    windows: askedSwitch('windows', true),
    /** How far the ball's edge must reach past the plate's edge for a touch; see src/reach.ts. */
    bite: REACH.bite,
    iouMax: IOU_MAX,
  },

  /** 'full' is more accurate, 'lite' is faster. */
  poseQuality: 'full' as PoseQuality,

  /**
   * How sure the pose model must be, per stage, from 0 to 1.
   *
   * The settings view sets the judging pose's presence and tracking together,
   * and each is read when a pose model opens or updates, so a change applies at
   * the board's next start. `?presence=` and `?tracking=` override one for a
   * page, for trying them apart without a build. At 0.99 the model returns no
   * pose at all, so anything that high stops the app counting. The judging
   * pose finds the athlete at `judgingDetection`, and the target search's pose
   * holds `search` at every stage.
   *
   * The judging pose runs on the unit phone-check.ts picks. `?delegate=gpu`
   * or `?delegate=cpu` asks for one on a page over that pick, and the other
   * unit is the fallback when the one asked for fails to load.
   */
  pose: {
    get presence(): number {
      return asked('presence', sure());
    },
    get tracking(): number {
      return asked('tracking', sure());
    },
    askedUnit: askedPoseUnit(),
    judgingDetection: JUDGING_DETECTION,
    search: SEARCH_CONFIDENCE,
  },
};

export function modelPaths(): ModelPaths {
  return {
    poseLite: addresses().pose('lite'),
    poseFull: addresses().pose('full'),
    detector: trained(ballFile()),
    targetDetector: trained(finderFile()),
    detectorClasses: classesOf(ballFile()),
    targetDetectorClasses: classesOf(finderFile()),
    mediapipeWasm: here('vendor/mediapipe'),
    litertWasm: here('vendor/litert/'),
  };
}
