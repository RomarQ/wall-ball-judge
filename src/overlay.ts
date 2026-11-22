/**
 * Canvas overlay: paints the layout of overlay-layout.ts, the skeleton, the
 * parallel and target lines, the boxes, the verdict banners, and warnings.
 *
 * It paints them as the Android app's Overlay.tsx does, in that app's sizes:
 * those are screen points, which the canvas reaches through the picture's
 * shown scale.
 *
 * Draws only. It holds no rep logic and no model code.
 */
import type { Depth } from './depth';
import type { Flash } from './board';
import { t } from './i18n';
import {
  layoutOverlay,
  type Banner,
  type BoxMark,
  type Colour,
  type DepthBar,
  type LineMark,
  type NoticeTone,
  type OverlayLayout,
  type PlateMark,
  type TargetFrame,
  type TextMark,
} from './overlay-layout';
import { palette, setFont } from './palette';
import type { Landmark } from './types';

/** Under each bone, so the skeleton reads on a white wall as well as on a dark one. */
const SHADE = 'rgba(0,0,0,0.55)';
/** The black that text takes on a chalk, amber or green tag. */
const INK = '#000';
/** A label's line, in points; the layout places the upper target line's label above the line by it. */
const LABEL_PT = 18;
/** The line Android gives one line of Roboto, as a share of its size. */
const TEXT_LINE = 1.36;

type Ctx = CanvasRenderingContext2D;

export type Mode = 'target' | 'depth-only';

export interface Stats {
  counted: number;
  valid: number;
  noRep: number;
  streak: number;
  mode: Mode;
}

export interface Notice {
  text: string;
  tone: NoticeTone;
  until: number;
}

export interface RenderFrame {
  landmarks?: Landmark[] | null;
  depth?: Depth | null;
  flash?: Flash | null;
  notice?: Notice | null;
  warning?: string | null;
  mirror?: boolean;
  target?: TargetFrame | null;
}

const colour = (role: Colour): string => (role === 'ink' ? INK : palette()[role]);

/** Canvas pixels to one CSS pixel of the picture as painted, under object-fit: contain. */
function perCssPixel(canvas: HTMLCanvasElement): number {
  const { clientWidth: cw, clientHeight: ch } = canvas;
  return cw && ch ? Math.max(canvas.width / cw, canvas.height / ch) : 1;
}

/** Draws `text` as one label of the Android app: 13 points, bold, over a soft black shadow, its line's top at `top`. */
function label(ctx: Ctx, pt: number, text: string, x: number, top: number, fill: string): void {
  ctx.save();
  setFont(ctx, 700, 13 * pt);
  ctx.fillStyle = fill;
  ctx.shadowColor = INK;
  ctx.shadowBlur = 3 * pt;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, top + (LABEL_PT * pt) / 2);
  ctx.restore();
}

/** A box outlined in `stroke`, with its label above its top-left corner, as the Android app's labelled boxes. */
function labelledBox(ctx: Ctx, pt: number, { box, label: text }: BoxMark, stroke: string): void {
  const width = 2 * pt;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.strokeRect(box.x + width / 2, box.y + width / 2, box.w - width, box.h - width);
  label(ctx, pt, text, box.x, box.y - 20 * pt, stroke);
}

/** A dashed line across the picture, dashed as Android dashes a border. */
function dashedLine(ctx: Ctx, canvas: HTMLCanvasElement, pt: number, y: number, stroke: string): void {
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2 * pt;
  ctx.setLineDash([6 * pt, 6 * pt]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(canvas.width, y);
  ctx.stroke();
  ctx.restore();
}

/**
 * A tag centred across the picture with its top at `top`: `lines` of text, each
 * with its size and weight, on a rounded `fill`, padded `padX` by `padY` points.
 */
function tag(
  ctx: Ctx,
  canvas: HTMLCanvasElement,
  pt: number,
  top: number,
  fill: string,
  ink: string,
  pad: { x: number; y: number },
  lines: { text: string; size: number; weight: number }[],
): void {
  const room = canvas.width - 20 * pt - 2 * pad.x * pt;
  const sized = lines.map(({ text, size, weight }) => {
    setFont(ctx, weight, size * pt);
    const width = ctx.measureText(text).width;
    // A text wider than the picture shrinks to fit, where the Android app would wrap it.
    const px = width > room ? (size * pt * room) / width : size * pt;
    setFont(ctx, weight, px);
    return { text, px, weight, width: ctx.measureText(text).width };
  });
  const w = Math.max(...sized.map((s) => s.width)) + 2 * pad.x * pt;
  const h = sized.reduce((sum, s) => sum + s.px * TEXT_LINE, 0) + 2 * pad.y * pt;
  const x = (canvas.width - w) / 2;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, top, w, h, 4 * pt);
  ctx.fill();
  ctx.save();
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let y = top + pad.y * pt;
  for (const { text, px, weight } of sized) {
    setFont(ctx, weight, px);
    ctx.fillText(text, canvas.width / 2, y + (px * TEXT_LINE) / 2);
    y += px * TEXT_LINE;
  }
  ctx.restore();
}

function drawSkeleton(ctx: Ctx, canvas: HTMLCanvasElement, pt: number, { bones, joints }: OverlayLayout) {
  const h = canvas.height;
  const { chalk, tape } = palette();
  const width = Math.max(2 * pt, h * 0.004);
  ctx.save();
  ctx.lineCap = 'round';
  for (const [style, lineWidth] of [
    [SHADE, width * 2.2],
    [chalk, width],
  ] as const) {
    ctx.strokeStyle = style;
    ctx.lineWidth = lineWidth;
    for (const [a, b] of bones) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.restore();

  ctx.fillStyle = tape;
  const r = Math.max(3.5 * pt, h * 0.007);
  for (const p of joints) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParallelLine(ctx: Ctx, canvas: HTMLCanvasElement, pt: number, y: number) {
  const { tape } = palette();
  dashedLine(ctx, canvas, pt, y, tape);
  label(ctx, pt, t('overlay.parallel'), 6 * pt, y - 20 * pt, tape);
}

function drawBanner(ctx: Ctx, canvas: HTMLCanvasElement, pt: number, { title, detail, y, fill }: Banner) {
  tag(ctx, canvas, pt, y, colour(fill), INK, { x: 18, y: 10 }, [
    { text: title, size: 26, weight: 800 },
    { text: detail, size: 16, weight: 600 },
  ]);
}

/** The plates the judge picked: a box each, the inactive one dim, with its name above it. */
function drawPlates(ctx: Ctx, pt: number, plates: PlateMark[]) {
  const { tape } = palette();
  for (const { box, name, active } of plates) {
    ctx.save();
    ctx.globalAlpha = active ? 1 : 0.45;
    labelledBox(ctx, pt, { box, label: name }, tape);
    ctx.restore();
  }
}

/** The target lines on bare wall: the active one bright, the other dim, a diamond on the spot the ball hits. */
function drawLines(ctx: Ctx, canvas: HTMLCanvasElement, pt: number, lines: LineMark[]) {
  const { chalk } = palette();
  for (const { y, label: text, active, above, spot } of lines) {
    ctx.save();
    ctx.globalAlpha = active ? 1 : 0.55;
    dashedLine(ctx, canvas, pt, y, chalk);
    if (spot !== null) {
      // The Android app's diamond: a 14-point square turned by an eighth.
      const r = 7 * Math.SQRT2 * pt;
      ctx.fillStyle = chalk;
      ctx.beginPath();
      ctx.moveTo(spot, y - r);
      ctx.lineTo(spot + r, y);
      ctx.lineTo(spot, y + r);
      ctx.lineTo(spot - r, y);
      ctx.closePath();
      ctx.fill();
    }
    label(ctx, pt, text, 6 * pt, y - (above ? LABEL_PT * pt : 0), chalk);
    ctx.restore();
  }
}

/** The plates the finder saw, numbered, for the judge to tap one. */
function drawCandidates(ctx: Ctx, pt: number, candidates: BoxMark[]) {
  for (const candidate of candidates) labelledBox(ctx, pt, candidate, palette().tape);
}

/** What the target finder said, across the middle of the view, where a judge looking at the wall sees it. */
function drawNotice(ctx: Ctx, canvas: HTMLCanvasElement, pt: number, notice: TextMark) {
  tag(ctx, canvas, pt, notice.y, colour(notice.fill), colour(notice.ink), { x: 12, y: 6 }, [
    { text: notice.text, size: 15, weight: 700 },
  ]);
}

function drawWarning(ctx: Ctx, canvas: HTMLCanvasElement, pt: number, warning: TextMark) {
  tag(ctx, canvas, pt, warning.y, colour(warning.fill), colour(warning.ink), { x: 10, y: 4 }, [
    { text: warning.text, size: 18, weight: 800 },
  ]);
}

function drawDepthBar(ctx: Ctx, pt: number, { x, y, w, h, level, parallel, fill }: DepthBar) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x, y, w, h);

  const filled = h * level;
  ctx.fillStyle = colour(fill);
  ctx.fillRect(x, y + h - filled, w, filled);

  ctx.fillStyle = palette().chalk;
  ctx.fillRect(x, y + h - h * parallel - 2 * pt, w, 2 * pt);
}

export function render(canvas: HTMLCanvasElement, frame: RenderFrame): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const pt = perCssPixel(canvas);
  // The video is flipped in CSS for the front camera, and the layout flips
  // the marks to match. Text is drawn unflipped, which is why the canvas
  // itself is never transformed.
  const layout = layoutOverlay({
    width: canvas.width,
    height: canvas.height,
    mirror: frame.mirror ?? false,
    landmarks: frame.landmarks ?? null,
    depth: frame.depth ?? null,
    target: frame.target ?? null,
    flash: frame.flash ?? null,
    notice: frame.notice ?? null,
    warning: frame.warning ?? null,
    labelHeight: LABEL_PT * pt,
  });

  drawSkeleton(ctx, canvas, pt, layout);
  if (layout.parallel !== null) drawParallelLine(ctx, canvas, pt, layout.parallel);
  if (layout.depthBar) drawDepthBar(ctx, pt, layout.depthBar);
  drawPlates(ctx, pt, layout.plates);
  drawLines(ctx, canvas, pt, layout.lines);
  drawCandidates(ctx, pt, layout.candidates);
  if (layout.ball) labelledBox(ctx, pt, layout.ball, palette().chalk);
  if (layout.banner) drawBanner(ctx, canvas, pt, layout.banner);
  if (layout.notice) drawNotice(ctx, canvas, pt, layout.notice);
  if (layout.warning) drawWarning(ctx, canvas, pt, layout.warning);
}
