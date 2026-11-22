/**
 * How fast this phone runs the pose and the ball check on its GPU and on its
 * CPU, and the unit each model runs on in a set.
 *
 * Only a loaded model says how fast it runs here, so the check on the home
 * view opens each model on each unit, times it, and keeps the times for later
 * visits. A set runs each model on the faster one.
 *
 * A unit gets a time only when the model ran there. The pose takes the other
 * delegate when the one asked for does not load, and the ball check leaves a
 * GPU that computes other numbers than the CPU for the CPU (see agreement.ts).
 */
import { ballModelInUse, config } from './config';
import type { Detector } from './detector';
import type { Frame } from './frame';
import type { TimedModel } from './settings';
import type { Unit } from './types';

/**
 * The median time of one run on each unit, in milliseconds: a frame for the
 * pose, a look for the ball check. Null for a unit the model did not run on.
 */
export interface UnitTimes {
  gpu: number | null;
  cpu: number | null;
}

interface PhoneCheck {
  /** The ball model measured, as `ballModelInUse` names it: another model, or the same weights in another runtime, needs a new check. */
  models: string;
  pose?: UnitTimes;
  ball?: UnitTimes;
  /** Whether the target finder's model loaded in the check. */
  finder?: boolean;
}

const KEY = 'phoneCheck';
const UNITS: readonly Unit[] = ['gpu', 'cpu'];
const WARM_RUNS = 2;
const TIMED_RUNS = 8;
/** The longest wait for a frame between runs; a hidden page draws none. */
const FRAME_WAIT_MS = 100;

/** The camera's frame size that a session asks for, so a look here costs what a look in a set costs. */
const FRAME = { width: 1280, height: 720 };

/**
 * A camera frame of an athlete. The pose finds the athlete in the first frame
 * and tracks them in the next ones, as in a set; with no one in the frame it
 * runs its person search on every frame, which costs another figure.
 */
const ATHLETE_FRAME = 'check/athlete.jpg';

function ballFrame(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME.width;
  canvas.height = FRAME.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const shade = ctx.createLinearGradient(0, 0, FRAME.width, FRAME.height);
    shade.addColorStop(0, '#30363a');
    shade.addColorStop(1, '#8a8f92');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, FRAME.width, FRAME.height);
  }
  return canvas;
}

async function athleteFrame(): Promise<HTMLImageElement | null> {
  const image = new Image();
  image.src = new URL(import.meta.env.BASE_URL + ATHLETE_FRAME, document.baseURI).href;
  try {
    await image.decode();
    return image;
  } catch {
    return null;
  }
}

/**
 * The median time of `run`, in whole milliseconds, or null when no timed run counts.
 *
 * The first runs are left out: on the GPU they compile the shaders, which a
 * set pays once and not on each run. A run that throws or answers false is
 * left out too, as a set loses that one frame and goes on.
 */
async function medianMs(run: () => boolean | Promise<boolean>): Promise<number | null> {
  const timed = async () => {
    // A frame drawn between runs: while the model holds the GPU, the page draws none.
    await new Promise((resolve) => {
      requestAnimationFrame(resolve);
      setTimeout(resolve, FRAME_WAIT_MS);
    });
    const start = performance.now();
    const counts = await run();
    return counts ? performance.now() - start : null;
  };
  for (let i = 0; i < WARM_RUNS; i += 1) await timed().catch(() => null);
  const times: number[] = [];
  for (let i = 0; i < TIMED_RUNS; i += 1) {
    const ms = await timed().catch(() => null);
    if (ms !== null) times.push(ms);
  }
  if (!times.length) return null;
  times.sort((a, b) => a - b);
  return Math.round(times[Math.floor(times.length / 2)]);
}

/** The time of a pose frame on `unit`, which counts only the frames where the pose finds the athlete. */
async function timePose(unit: Unit, frame: Frame): Promise<number | null> {
  const { createPose } = await import('./pose');
  const pose = await createPose({ quality: config.poseQuality, unit }).catch(() => null);
  if (!pose) return null;
  try {
    if (pose.delegate.toLowerCase() !== unit) return null;
    return await medianMs(() => pose.detect(frame, performance.now()) !== null);
  } finally {
    pose.close();
  }
}

/** The unit a detector runs on, from the backend its worker names. */
function unitOf(detector: Detector): Unit | null {
  if (detector.delegate === 'webgpu') return 'gpu';
  if (detector.delegate === 'wasm') return 'cpu';
  return null;
}

async function timeBall(unit: Unit, frame: Frame): Promise<number | null> {
  const { createBallDetector } = await import('./detector');
  const detector = await createBallDetector(unit).catch(() => null);
  if (!detector) return null;
  try {
    const ms = await medianMs(async () => {
      await detector.detect(frame, performance.now());
      return true;
    });
    // Read last: a GPU that fails its first look hands the detector to the CPU.
    return unitOf(detector) === unit ? ms : null;
  } finally {
    detector.close();
  }
}

/**
 * Times the pose and the ball check on each unit, one model open at a time, and keeps the times.
 *
 * A model that fails on a unit gets no time there, and the check goes on.
 * An abort stops it before the next model opens and rejects with the signal's reason.
 */
export async function checkUnits(signal: AbortSignal): Promise<void> {
  const athlete = await athleteFrame();
  const pose: UnitTimes = { gpu: null, cpu: null };
  for (const unit of UNITS) {
    signal.throwIfAborted();
    if (athlete) pose[unit] = await timePose(unit, athlete);
  }
  saveTimes('pose', pose);
  const frame = ballFrame();
  const ball: UnitTimes = { gpu: null, cpu: null };
  for (const unit of UNITS) {
    signal.throwIfAborted();
    ball[unit] = await timeBall(unit, frame);
  }
  saveTimes('ball', ball);
}

function storedCheck(): PhoneCheck | null {
  try {
    const check = JSON.parse(localStorage.getItem(KEY) ?? 'null') as PhoneCheck | null;
    return check?.models === ballModelInUse() ? check : null;
  } catch {
    return null;
  }
}

const isTime = (ms: unknown) => ms === null || (typeof ms === 'number' && Number.isFinite(ms));

function isTimes(value: unknown): value is UnitTimes {
  const times = value as Partial<UnitTimes> | null | undefined;
  return typeof times === 'object' && times !== null && isTime(times.gpu) && isTime(times.cpu);
}

function saveCheck(change: (check: PhoneCheck) => void): void {
  const check = storedCheck() ?? { models: ballModelInUse() };
  change(check);
  try {
    localStorage.setItem(KEY, JSON.stringify(check));
  } catch {
    // Storage may be full or blocked. The home view then asks for the check again.
  }
}

/** Keeps the times of `model`, beside the other model's when the same models were checked. */
export function saveTimes(model: TimedModel, times: UnitTimes): void {
  saveCheck((check) => (check[model] = times));
}

/** Keeps whether the target finder's model loaded. */
export function saveFinder(loaded: boolean): void {
  saveCheck((check) => (check.finder = loaded));
}

/** Whether the target finder's model loaded in the last check, or null when no check tried it. */
export function savedFinder(): boolean | null {
  const finder = storedCheck()?.finder;
  return typeof finder === 'boolean' ? finder : null;
}

/** The times the last check measured for `model`, or null when no check measured it for the models this build runs. */
export function savedTimes(model: TimedModel): UnitTimes | null {
  const times = storedCheck()?.[model];
  return isTimes(times) ? times : null;
}

/** The faster unit in `times`, the GPU on a tie; null when the model ran on neither. */
export function fasterUnit(times: UnitTimes): Unit | null {
  if (times.gpu === null) return times.cpu === null ? null : 'cpu';
  if (times.cpu === null) return 'gpu';
  return times.cpu < times.gpu ? 'cpu' : 'gpu';
}

/** The unit `model` runs on in a set: the faster unit in the last check, else the GPU. */
export function unitFor(model: TimedModel): Unit {
  const times = savedTimes(model);
  return (times && fasterUnit(times)) ?? 'gpu';
}
