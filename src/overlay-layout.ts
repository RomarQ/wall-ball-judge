/**
 * What the board's overlay shows over a frame, and where, for both apps: the legs and the depth, the target's plates
 * and their controls, the search's plates, the ball, the verdict's banner, a notice and a warning.
 *
 * Positions are in frame pixels, already mirrored for a picture shown mirrored, so a painter never flips its text.
 * Each app paints the layout its own way: the web app on a canvas, the native app in views. The texts come in the
 * app's language, so the module needs i18n.ts and cannot join the browser-free check of tsconfig.core.json; nothing
 * here touches a browser.
 */
import { TARGETS, type Target } from './ball';
import type { BallView, Flash } from './board';
import { LM, type Depth } from './depth';
import { flashText } from './flash';
import { decimal, t } from './i18n';
import { removeSpot } from './placement';
import type { Rect } from './reach';
import type { Box, Landmark, Point } from './types';

/**
 * The bones of the legs in MediaPipe's pose, in its order: hips 23 and 24, knees 25 and 26, ankles 27 and 28. The
 * judge reads the hips and knees, and the face, arms and feet only clutter the picture.
 */
const LEG_BONES: [number, number][] = [
  [23, 24],
  [23, 25],
  [24, 26],
  [25, 27],
  [26, 28],
];

/** The points of the depth reading, which take the parallel line's amber. */
const JOINTS = [LM.LEFT_HIP, LM.RIGHT_HIP, LM.LEFT_KNEE, LM.RIGHT_KNEE];

/** The depth bar's range, in percent of the femur: 100 above parallel, standing, at the bottom, to 40 below at the top. */
const BAR_ABOVE = 100;
const BAR_SPAN = 140;

/** A resize handle's side and a remove button's radius, as shares of a plate control's size. */
const HANDLE = 0.45;
const REMOVE = 0.45;

/** What the board calls each target: the division whose athletes must reach it. */
const TARGET_NAME = { upper: 'overlay.upperTarget', lower: 'overlay.lowerTarget' } as const satisfies Record<
  Target,
  string
>;

/** A colour by its role in the app's palette; `ink` is the black of text on a chalk, amber or green tag. */
export type Colour = 'chalk' | 'rep' | 'norep' | 'tape' | 'graphite' | 'ink';

/** A notice's tone: a step forward, a problem, or news. */
export type NoticeTone = 'ok' | 'warn' | 'plain';

/** The target as the board holds it, and what the ball check saw. */
export interface TargetFrame {
  /** The target this athlete must reach, or null until the first hit picks it. */
  required: Target | null;
  /** The plates the target was placed from, in frame units, the higher first. Empty before a target is placed. */
  plates: Rect[];
  /** Whether the judge may still remove a plate, which is while the set has not started. */
  editable: boolean;
  ball: BallView | null;
  /** The search's plates, in pixels, for a tap to choose from. */
  candidates: Box[];
  /** The candidates grouped into stations, as indices into `candidates`: each station takes one number. */
  stations: number[][];
  /** Whether the target is one mark that both divisions throw to, as the hit rule weighs it. */
  single?: boolean;
}

export interface OverlayFrame {
  /** The picture's size in pixels. */
  width: number;
  height: number;
  /** Whether the picture shows mirrored, as the front camera does. */
  mirror: boolean;
  /** The pose, or null to show none. */
  landmarks: Landmark[] | null;
  depth: Depth | null;
  /** The target, or null while the ball check is off. */
  target: TargetFrame | null;
  flash: Flash | null;
  notice: { text: string; tone: NoticeTone } | null;
  warning: string | null;
  /** A plate control's size in frame pixels: a fingertip, the reach a grab on a plate takes. */
  controlSize: number;
}

export interface DepthBar {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The share of the bar filled from its bottom. */
  level: number;
  /** The parallel mark's height above the bar's bottom, as a share of the bar. */
  parallel: number;
  fill: Colour;
}

/**
 * A plate the target was placed from, named for its division; the one this athlete must reach is active. While the
 * target is editable, a plate shows its remove button and its resize handle, each centred on its point.
 */
export interface PlateMark {
  box: Rect;
  name: string;
  active: boolean;
  remove: Point | null;
  handle: Point | null;
}

export interface BoxMark {
  box: Rect;
  label: string;
}

/** A text on a tag across the picture, its top at `y`. */
export interface TextMark {
  text: string;
  y: number;
  fill: Colour;
  ink: Colour;
}

export interface Banner {
  title: string;
  detail: string;
  y: number;
  fill: Colour;
}

export interface OverlayLayout {
  bones: [Point, Point][];
  joints: Point[];
  /** The knees' height, where the parallel line runs, or null without a depth reading. */
  parallel: number | null;
  depthBar: DepthBar | null;
  plates: PlateMark[];
  /** A resize handle's side and a remove button's radius, in frame pixels. */
  handleSide: number;
  removeRadius: number;
  candidates: BoxMark[];
  ball: BoxMark | null;
  banner: Banner | null;
  /** A notice, centred on the picture's middle. */
  notice: TextMark | null;
  warning: TextMark | null;
}

const NOTICE_COLOURS = {
  ok: { fill: 'chalk', ink: 'ink' },
  warn: { fill: 'tape', ink: 'ink' },
  plain: { fill: 'graphite', ink: 'chalk' },
} as const satisfies Record<NoticeTone, { fill: Colour; ink: Colour }>;

/** A target's name: its division's where a second target hangs with it, else only the target, which serves both. */
function targetName(which: Target, single: boolean): string {
  return single ? t('overlay.target') : t(TARGET_NAME[which]);
}

/** The smallest box holding every one of `boxes`. */
function around(boxes: Rect[]): Rect {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
    h: Math.max(...boxes.map((b) => b.y + b.h)) - y,
  };
}

export function layoutOverlay(frame: OverlayFrame): OverlayLayout {
  const { width: w, height: h, mirror, landmarks, depth, target } = frame;
  const across = (x: number) => (mirror ? 1 - x : x) * w;
  const box = (b: Rect): Rect => ({ x: mirror ? w - (b.x + b.w) : b.x, y: b.y, w: b.w, h: b.h });
  const point = (p: Landmark): Point => ({ x: across(p.x), y: p.y * h });

  const bones: [Point, Point][] = [];
  const joints: Point[] = [];
  if (landmarks) {
    for (const [a, b] of LEG_BONES)
      if (landmarks[a] && landmarks[b]) bones.push([point(landmarks[a]), point(landmarks[b])]);
    for (const i of JOINTS) if (landmarks[i]) joints.push(point(landmarks[i]));
  }

  let depthBar: DepthBar | null = null;
  if (depth?.ok) {
    const barW = w * 0.045;
    const barH = h * 0.5;
    depthBar = {
      x: w - barW * 1.8,
      y: (h - barH) / 2,
      w: barW,
      h: barH,
      level: Math.min(1, Math.max(0, (depth.depth + BAR_ABOVE) / BAR_SPAN)),
      parallel: BAR_ABOVE / BAR_SPAN,
      fill: depth.depth >= 0 ? 'rep' : 'tape',
    };
  }

  const plates: PlateMark[] = [];
  const size = frame.controlSize;
  // While there are plates to choose between, the target is noise: it crosses them, and a tap is for picking one.
  if (target && !target.candidates.length) {
    const { required, single = false, editable } = target;
    // Two plates take a name each, the higher the upper; one plate holding both marks is named for the height this
    // athlete needs, once known.
    target.plates.forEach((p, i) => {
      const which = target.plates.length > 1 ? TARGETS[i] : required;
      const left = mirror ? w / h - (p.x + p.w) : p.x;
      const shown = { x: left * h, y: p.y * h, w: p.w * h, h: p.h * h };
      plates.push({
        box: shown,
        name: which === null ? t('overlay.target') : targetName(which, single),
        active: target.plates.length === 1 || which === required,
        remove: editable ? removeSpot(shown, size) : null,
        handle: editable ? { x: shown.x + shown.w, y: shown.y + shown.h } : null,
      });
    });
  }

  const stations = target
    ? target.stations.map((station) => around(station.map((i) => target.candidates[i])))
    : [];
  const ball = target?.ball ?? null;
  const { flash } = frame;
  return {
    bones,
    joints,
    parallel: depth?.ok ? depth.kneeY * h : null,
    depthBar,
    plates,
    handleSide: HANDLE * size,
    removeRadius: REMOVE * size,
    candidates: stations.map((station, i) => ({ box: box(station), label: `${i + 1}` })),
    ball: ball
      ? {
          box: box(ball),
          label: `${ball.name === 'ball' ? t('overlay.ball') : ball.name} ${decimal(ball.score, 2)}`,
        }
      : null,
    banner: flash ? { ...flashText(flash), y: h * 0.24, fill: flash.valid ? 'rep' : 'norep' } : null,
    notice: frame.notice
      ? { text: frame.notice.text, y: h * 0.5, ...NOTICE_COLOURS[frame.notice.tone] }
      : null,
    warning: frame.warning ? { text: frame.warning, y: h * 0.86, fill: 'tape', ink: 'ink' } : null,
  };
}
