/**
 * One set on the board, the same in both apps: the judge, the target placed from a search, a tap or a drag, the
 * banner of each verdict, and the ball a look found.
 *
 * Positions are in the picture as judged, never mirrored. A screen that shows the front camera mirrored turns its
 * taps and drags around before it calls here. Nothing in it needs a browser.
 */
import type { BallSighting, Target, Verdict } from './ball';
import type { DepthOptions, Depth } from './depth';
import {
  FrameJudge,
  type BallTuning,
  type FrameInput,
  type JudgedFrame,
  type LookTicket,
} from './frame-judge';
import {
  handPlate,
  moveLine,
  pairFor,
  placeable,
  placePlates,
  spotAt,
  weighedMarks,
  type FinderOptions,
  type Seen,
} from './placement';
import type { Rect } from './reach';
import { bannerOf, type RepTimes, type TallyBanner } from './tally';
import type { Box, Landmark } from './types';

/** How long the board shows a verdict's banner, and a ball a look found, on the judging clock. */
const FLASH_MS = 1200;
const BALL_SHOWN_MS = 400;

/** The banner of a verdict on the board. */
export interface Flash extends TallyBanner {
  /** The count to show on a rep. */
  count: number;
  /** The highest target the ball struck. */
  target: Target | null;
  /** The judging time at which the banner goes. */
  until: number;
}

/** A ball a look found, shown until `until` on the judging clock. */
export type BallView = BallSighting & { until: number };

/** Why the board cannot judge the athlete on this frame: nobody there, the legs hidden, or too small in the picture. */
export type Warning = 'no-athlete' | 'hidden' | 'too-far';

/** A frame for the board: the judge's input, with the target the board itself holds. */
export type BoardFrame = Omit<FrameInput, 'x' | 'plates'>;

export interface BoardOptions {
  depth: DepthOptions;
  ball: BallTuning;
  /** Counts a verdict at `times`, and returns the count its banner shows. */
  onVerdict: (verdict: Verdict, times: RepTimes) => number;
}

export class Board {
  readonly judge: FrameJudge;
  /** Where the target sits across the picture, as a fraction of its width, or null before it is placed. */
  targetX: number | null = null;
  /**
   * The plates the target was placed from, in frame units, the higher first: two for a wall with the men's and the
   * women's marks on separate plates, one for a plate holding both or a single disc, none for lines on bare wall.
   * The lines alone do not say which plate the judge chose, as a wall carries marks the set never uses.
   */
  plates: Rect[] = [];
  /** The search's plates, in pixels, for a tap to choose from. */
  candidates: Box[] = [];
  flash: Flash | null = null;
  ball: BallView | null = null;
  landmarks: Landmark[] | null = null;
  depth: Depth = { ok: false, reason: 'no-pose' };
  /** The picture's size in pixels. A frame sets it; a search or a page sets it before a frame has come. */
  width = 0;
  height = 0;
  readonly #onVerdict: BoardOptions['onVerdict'];
  #lastMs = 0;

  constructor({ depth, ball, onVerdict }: BoardOptions) {
    this.judge = new FrameJudge(depth, ball);
    this.#onVerdict = onVerdict;
  }

  /** The target the athlete must reach: 'upper' for men, 'lower' for women. */
  get required(): Target {
    return this.judge.target.required;
  }

  setRequired(which: Target): void {
    this.judge.target.required = which;
  }

  /** Whether the target is one mark that both divisions throw to, as the hit rule weighs it, such as a single disc. */
  get singleTarget(): boolean {
    return weighedMarks(this.judge.target.lines, this.plates).length === 1;
  }

  get warning(): Warning | null {
    if (!this.depth.ok) return this.depth.reason === 'no-pose' ? 'no-athlete' : 'hidden';
    return this.judge.presence.tooSmall ? 'too-far' : null;
  }

  /**
   * Takes a search's look: its plates become the candidates. Returns the index of the one sure plate in the
   * athlete's lane, which the caller may place without asking, or -1.
   */
  searched(seen: Seen, finder: FinderOptions): number {
    this.candidates = seen.look.plates;
    return placeable(seen.look, seen.athlete, finder);
  }

  /** Places the target from candidate `index`, with the mark stacked in its lane when the search saw one. */
  placeCandidate(index: number): void {
    const box = this.candidates[index];
    if (!box) return;
    const partner = pairFor(box, this.candidates);
    this.candidates = [];
    this.placeBoxes(partner ? [box, partner] : [box]);
  }

  /** Places a plate centred where a tap landed, `x` and `y` fractions of the picture, sized as the plate placed before. */
  placeAt(x: number, y: number): void {
    this.candidates = [];
    this.placeBoxes([handPlate(x, y, this.width, this.height, this.plates, this.required)]);
  }

  /** Places the target from plate boxes in pixels: one plate, or a pair holding a mark each. */
  placeBoxes(boxes: Rect[]): void {
    const placed = placePlates(boxes, this.width, this.height);
    Object.assign(this.judge.target.lines, placed.lines);
    this.targetX = placed.x;
    this.plates = placed.plates;
  }

  /**
   * Moves or sizes plate `index` to `plate`, in frame units, and puts the lines where the plates now say. Returns the
   * plate's index, which changes when it passes the other plate of a pair.
   */
  setPlate(index: number, plate: Rect): number {
    const h = this.height;
    if (!this.plates[index] || !h) return index;
    this.plates[index] = plate;
    const higher = this.plates.filter((p) => p !== plate && p.y < plate.y).length;
    this.placeBoxes(this.plates.map((p) => ({ x: p.x * h, y: p.y * h, w: p.w * h, h: p.h * h })));
    return higher;
  }

  /** Moves line `which` to `y`, a fraction of the picture's height. The plates go: the line now stands on bare wall. */
  moveLine(which: Target, y: number): void {
    const { lines } = this.judge.target;
    Object.assign(lines, moveLine(lines, which, y, lines.upper ?? y));
    this.plates = [];
  }

  /** Moves the spot along the lines to `x`, a fraction of the picture's width. The plates go, as for a line. */
  moveSpot(x: number): void {
    this.targetX = spotAt(x);
    this.plates = [];
  }

  /** Judges one frame against the board's target. A verdict is counted, and its banner shows. */
  step(frame: BoardFrame): JudgedFrame {
    this.width = frame.width;
    this.height = frame.height;
    this.landmarks = frame.landmarks;
    this.#lastMs = frame.tMs;
    const judged = this.judge.frame({ ...frame, x: this.targetX, plates: this.plates });
    this.depth = judged.depth;
    if (judged.verdict) this.#counted(judged.verdict, frame.tMs);
    if (this.flash && frame.tMs > this.flash.until) this.flash = null;
    if (this.ball && frame.tMs > this.ball.until) this.ball = null;
    return judged;
  }

  /** The part of a `width` by `height` frame a look reads with this target, for a runtime that starts looks ahead of `step`. */
  lookWindow(width: number, height: number, windowSide: number | null): Rect | null {
    return this.judge.lookWindow({ width, height, x: this.targetX, plates: this.plates, windowSide });
  }

  /** Hands a look's boxes, in pixels, to its ticket. A ball it finds shows for `BALL_SHOWN_MS`. */
  answer(ticket: LookTicket, boxes: Box[]): void {
    const sighting = this.judge.resolve(ticket, boxes);
    if (sighting) this.ball = { ...sighting, until: ticket.tMs + BALL_SHOWN_MS };
  }

  /** Ends the set at `tMs`, by default the last frame's time: a throw still in the air is judged and counted. */
  end(tMs = this.#lastMs): Verdict | null {
    const verdict = this.judge.end(tMs);
    if (verdict) this.#counted(verdict, tMs);
    return verdict;
  }

  /** Starts a set afresh on the same target. */
  reset(): void {
    this.judge.reset();
    this.flash = null;
    this.ball = null;
    this.landmarks = null;
    this.depth = { ok: false, reason: 'no-pose' };
  }

  #counted(verdict: Verdict, tMs: number): void {
    // The judging clock runs at the wall clock's pace, on a camera and on a recording played at its own speed.
    const at = Date.now();
    const count = this.#onVerdict(verdict, { startAt: at - (tMs - verdict.rep.startMs), at });
    this.flash = { ...bannerOf(verdict), count, target: verdict.target, until: tMs + FLASH_MS };
  }
}
