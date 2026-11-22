/**
 * The settings a person changes in the settings view, and the division the board judges, kept in localStorage.
 */
import type { Target } from './ball';
import { canRecordVideo } from './record';

/** The languages the count can be spoken in, by BCP 47 tag. */
export const LANGUAGES = {
  en: 'English',
  'pt-PT': 'Português (Portugal)',
} as const;

export type LanguageTag = keyof typeof LANGUAGES;

const LANGUAGE_KEY = 'language';

/** Whether `tag` names a language the app offers. */
export const isLanguage = (tag: string | null): tag is LanguageTag => tag !== null && tag in LANGUAGES;

/** A language the person chose, or `device` to follow the device's own. */
export type LanguageChoice = LanguageTag | 'device';

/** The device's own language: Portuguese when the device is set to Portuguese, else English. */
export function deviceLanguage(): LanguageTag {
  return navigator.language?.toLowerCase().startsWith('pt') ? 'pt-PT' : 'en';
}

/** The language the person chose, or `device` when they chose none. */
export function languageChoice(): LanguageChoice {
  const stored = localStorage.getItem(LANGUAGE_KEY);
  return isLanguage(stored) ? stored : 'device';
}

/** The language of the app's text and of the spoken count: the person's choice, else the device's own. */
export function language(): LanguageTag {
  const choice = languageChoice();
  return choice === 'device' ? deviceLanguage() : choice;
}

/** Keeps `choice`; `device` forgets a chosen language, so the device's own applies again. */
export function setLanguage(choice: LanguageChoice): void {
  if (choice === 'device') localStorage.removeItem(LANGUAGE_KEY);
  else if (isLanguage(choice)) localStorage.setItem(LANGUAGE_KEY, choice);
}

const CONFIDENCE_KEY = 'poseConfidence';

/**
 * How sure the judging pose must be before it reports a skeleton, from 0 to 1. On the seven sets with known counts,
 * 0.7 counts the same reps and no-reps as 0.9.
 */
export const CONFIDENCE_DEFAULT = 0.7;

/**
 * How sure the judging pose must be to find the athlete: at the start, and
 * each time it has lost them. A fast squat loses the athlete on the way
 * down. At the settings' figure the GPU delegate finds them again only once
 * they stand up, and the rep is lost; at this one it finds them at the
 * bottom. Tracking a found athlete still takes the settings' figure.
 */
export const JUDGING_DETECTION = 0.5;

/**
 * How sure the target search's pose must be at every stage, whatever the settings say. The search places a plate by
 * itself only in the lane where it finds the athlete. At 0.7 it found the athlete in gym-raw-14's first frame and put
 * the men's target on the women's plate; at 0.8 and 0.9 it offers the clip's marks to tap.
 */
export const SEARCH_CONFIDENCE = 0.9;

/**
 * The stored pose confidence, or the default.
 *
 * The figure drives the judging pose's presence and tracking. Raising it makes
 * the model turn down a skeleton it is unsure of, which is what it draws on an
 * athlete who is half in shot: at 0.5 those frames read as shallow squats and
 * score movement faults against reps nobody attempted. Past about 0.95 it
 * turns down the real athlete too and the app stops counting.
 */
export function poseConfidence(): number {
  const value = Number(localStorage.getItem(CONFIDENCE_KEY));
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : CONFIDENCE_DEFAULT;
}

export function setPoseConfidence(value: number): void {
  if (Number.isFinite(value) && value > 0 && value <= 1) localStorage.setItem(CONFIDENCE_KEY, String(value));
}

const RECORD_KEY = 'recordVideo';

/**
 * Whether the judge board keeps the camera's video of a set, to save once the
 * camera stops. On unless turned off, wherever the browser can record.
 */
export function recordVideo(): boolean {
  return localStorage.getItem(RECORD_KEY) !== 'false' && canRecordVideo();
}

export function setRecordVideo(on: boolean): void {
  localStorage.setItem(RECORD_KEY, String(on));
}

const BALL_CHECK_KEY = 'ballCheck';

/** Whether the board checks the ball reaches the target. On unless turned off; off, depth alone counts. */
export function ballCheckOn(): boolean {
  return localStorage.getItem(BALL_CHECK_KEY) !== 'off';
}

export function setBallCheckOn(on: boolean): void {
  localStorage.setItem(BALL_CHECK_KEY, on ? 'on' : 'off');
}

const REQUIRED_KEY = 'targetRequired';

/** The target the board's last division required: 'upper' for men, the default, or 'lower' for women. */
export function storedRequired(): Target {
  return localStorage.getItem(REQUIRED_KEY) === 'lower' ? 'lower' : 'upper';
}

export function storeRequired(which: Target): void {
  localStorage.setItem(REQUIRED_KEY, which);
}

/** The models the device check times on each unit. */
export type TimedModel = 'pose' | 'ball';

const MODELS_KEY = 'models';

/** The revision of the trained detectors the person chose, as stored; config.ts checks it is still offered. */
export function storedModels(): string | null {
  return localStorage.getItem(MODELS_KEY);
}

export function setModels(revision: string): void {
  localStorage.setItem(MODELS_KEY, revision);
}

const BALL_INPUT_KEY = 'ballInput';

/** The ball model's input size the person chose, in pixels, or null when they chose none; ball-model.ts checks it is offered. */
export function storedBallInput(): number | null {
  const value = Number(localStorage.getItem(BALL_INPUT_KEY));
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function setBallInput(input: number): void {
  localStorage.setItem(BALL_INPUT_KEY, String(input));
}
