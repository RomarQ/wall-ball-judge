/**
 * One set on the board, the same in both apps: the judge, the target placed from a search, the athlete's squat, a
 * tap or a drag, the banner of each verdict, and the ball a look found.
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
  athleteFrom,
  DEFAULTS as FINDER,
  handPlate,
  inLane,
  MAX_PLATES,
  narrowView,
  placeable,
  placePlates,
  stationsOf,
  stationUnder,
  sureStations,
  weighedMarks,
  type FinderOptions,
  type Seen,
  type Span,
} from './placement';
import type { Rect } from './reach';
import { bannerOf, type RepTimes, type TallyBanner } from './tally';
import type { Box, Landmark } from './types';

/** How long the board shows a verdict's banner, and a ball a look found, on the judging clock. */
const FLASH_MS = 1200;
const BALL_SHOWN_MS = 400;

/**
 * How long a narrowed view may show no one, before it has shown anyone in the target's lane, until the board opens it
 * for good: it hid the athlete, as a target placed on another station puts them outside its lane. A view that hid a
 * coach showed the athlete a tenth of a second later.
 */
const VIEW_EMPTY_MS = 1000;

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

/**
 * What a search left on the board: the target placed, sure stations that the athlete's first squat picks between
 * unless the judge taps one first, or plates for a tap.
 */
export type SearchOutcome = 'placed' | 'squat' | 'tap';

/** A frame for the board: the judge's input, with the target the board itself holds. */
export type BoardFrame = Omit<FrameInput, 'x' | 'plates'>;

export interface BoardOptions {
  depth: DepthOptions;
  ball: BallTuning;
  /** Counts a verdict at `times`, and returns the count its banner shows. */
  onVerdict: (verdict: Verdict, times: RepTimes) => number;
  /** Told when the board places the station the athlete squats under. */
  onPicked?: () => void;
}

export class Board {
  readonly judge: FrameJudge;
  /** Where the target sits across the picture, as a fraction of its width, or null before it is placed. */
  targetX: number | null = null;
  /**
   * The plates the target was placed from, in frame units, the higher first: two for a wall with the upper and the
   * lower marks on separate plates, one for a plate holding both or a single disc, none before a target is placed.
   * The lines alone do not say which plate the judge chose, as a wall carries marks the set never uses.
   */
  plates: Rect[] = [];
  /** The search's plates, in pixels, for a tap to choose from. */
  candidates: Box[] = [];
  /** The candidates grouped into stations, as indices into `candidates`, the higher plate first. */
  stations: number[][] = [];
  /**
   * The span of the picture the judging pose may follow someone in, in pixels, or null for all of it. It narrows past
   * each person the pose follows outside the target's lane, and opens again when the target or the set changes, or
   * for good when it shows no one for `VIEW_EMPTY_MS` before it shows anyone in the lane.
   */
  poseView: Span | null = null;
  flash: Flash | null = null;
  ball: BallView | null = null;
  landmarks: Landmark[] | null = null;
  depth: Depth = { ok: false, reason: 'no-pose' };
  /** The picture's size in pixels. A frame sets it; a search or a page sets it before a frame has come. */
  width = 0;
  height = 0;
  readonly #onVerdict: BoardOptions['onVerdict'];
  readonly #onPicked: () => void;
  readonly #visibilityMin: number;
  #lastMs = 0;
  /** Whether a search ran since the set-up began. A later search means the judge wants another plate. */
  #searched = false;
  /** The sure stations the athlete's next squat picks between, or null when no squat picks. */
  #atSquat: number[][] | null = null;
  #finder: FinderOptions = FINDER;
  /** When the narrowed view last started to show no one, or null while it shows someone. */
  #viewEmptySince: number | null = null;
  /** Whether the narrowed view has shown someone in the target's lane, so an athlete resting out of the pose's sight keeps it. */
  #viewKept = false;
  /** Whether the view has hidden the athlete, so it stays open until the target or the set changes. */
  #viewOpened = false;

  constructor({ depth, ball, onVerdict, onPicked = () => {} }: BoardOptions) {
    this.judge = new FrameJudge(depth, ball);
    this.#onVerdict = onVerdict;
    this.#onPicked = onPicked;
    this.#visibilityMin = depth.visibilityMin;
  }

  /** The target the athlete must reach: 'upper' for men, 'lower' for women, or null until the first strike decides it. */
  get required(): Target | null {
    return this.judge.target.required;
  }

  setRequired(which: Target | null): void {
    this.judge.target.required = which;
  }

  /** Whether the target is one mark that both divisions throw to, as the hit rule weighs it, such as a single disc. */
  get singleTarget(): boolean {
    return weighedMarks(this.judge.target.lines, this.plates).length === 1;
  }

  /** Whether a target is placed for the ball check to judge. Without one, the board judges the squat alone. */
  get placed(): boolean {
    return this.targetX !== null && weighedMarks(this.judge.target.lines, this.plates).length > 0;
  }

  get warning(): Warning | null {
    if (!this.depth.ok) return this.depth.reason === 'no-pose' ? 'no-athlete' : 'hidden';
    return this.judge.presence.tooSmall ? 'too-far' : null;
  }

  /**
   * Takes a search's look: its plates become the candidates. The first search of a set-up places the only sure
   * station, or leaves several for the athlete's first squat to pick between. A later search means the target placed
   * was the wrong one, so it only offers its plates for a tap.
   */
  searched(seen: Seen, finder: FinderOptions): SearchOutcome {
    const first = !this.#searched;
    this.#searched = true;
    this.clearCandidates();
    this.candidates = seen.look.plates;
    this.stations = stationsOf(this.candidates, finder);
    if (!first) return 'tap';
    const station = placeable(seen, finder);
    if (station) {
      this.#place(station);
      return 'placed';
    }
    const sure = sureStations(seen.look, this.stations, finder);
    if (!sure.length) return 'tap';
    this.#atSquat = sure;
    this.#finder = finder;
    return 'squat';
  }

  /** Places the target from the station of candidate `index`. */
  placeCandidate(index: number): void {
    const station = this.stations.find((s) => s.includes(index));
    if (station) this.#place(station);
  }

  /** Forgets the search's plates, and with them the pick at the next squat. */
  clearCandidates(): void {
    this.candidates = [];
    this.stations = [];
    this.#atSquat = null;
  }

  /** Places one plate centred where a tap landed, `x` and `y` fractions of the picture, sized as the plate placed before. */
  placeAt(x: number, y: number): void {
    this.clearCandidates();
    this.placeBoxes([handPlate(x, y, this.width, this.height, this.plates, this.required ?? 'upper')]);
  }

  /**
   * Adds a plate where a tap landed, `x` and `y` fractions of the picture, sized as the plate placed before, and
   * returns its index; or returns -1 when the target already holds `MAX_PLATES`. A second plate takes the first one's
   * lane: the hit rule judges both marks at one spot across, so a plate beside it would be judged where none is drawn.
   */
  addAt(x: number, y: number): number {
    const h = this.height;
    if (this.plates.length >= MAX_PLATES || !h || !this.width) return -1;
    const [first] = this.plates;
    const across = first ? ((first.x + first.w / 2) * h) / this.width : x;
    const added = handPlate(across, y, this.width, h, this.plates, this.required ?? 'upper');
    this.placeBoxes([...this.plates.map((p) => ({ x: p.x * h, y: p.y * h, w: p.w * h, h: p.h * h })), added]);
    return this.plates.findIndex((p) => p.y === added.y / h);
  }

  /** Removes plate `index`. The last one to go leaves no target, and the board then judges the squat alone. */
  removePlate(index: number): void {
    const h = this.height;
    if (!this.plates[index]) return;
    const rest = this.plates.filter((_, i) => i !== index);
    if (rest.length && h)
      this.placeBoxes(rest.map((p) => ({ x: p.x * h, y: p.y * h, w: p.w * h, h: p.h * h })));
    else this.clearTarget();
  }

  /** Leaves no target placed: no plates, no lines and no spot, so the board judges the squat alone. */
  clearTarget(): void {
    this.#atSquat = null;
    Object.assign(this.judge.target.lines, { upper: null, lower: null });
    this.targetX = null;
    this.plates = [];
    this.#openView(false);
  }

  /** Places the target from plate boxes in pixels: one plate, or a pair holding a mark each. */
  placeBoxes(boxes: Rect[]): void {
    this.#atSquat = null;
    const placed = placePlates(boxes, this.width, this.height);
    Object.assign(this.judge.target.lines, placed.lines);
    this.targetX = placed.x;
    this.plates = placed.plates;
    this.#openView(false);
  }

  /**
   * Moves or sizes plate `index` to `plate`, in frame units, and puts the lines where the plates now say. A move
   * across, which keeps the plate's size, takes the other plate of a pair with it, as the two marks of a rig share a
   * lane. A resize leaves the other plate alone, though on a mirrored picture it moves this plate's left edge. Returns
   * the plate's index, which changes when it passes the other plate of the pair.
   */
  setPlate(index: number, plate: Rect): number {
    const h = this.height;
    const was = this.plates[index];
    if (!was || !h) return index;
    const moved = plate.w === was.w && plate.h === was.h;
    const across = moved ? plate.x - was.x : 0;
    const plates = this.plates.map((p, i) => (i === index ? plate : { ...p, x: p.x + across }));
    const higher = plates.filter((p) => p !== plate && p.y < plate.y).length;
    this.placeBoxes(plates.map((p) => ({ x: p.x * h, y: p.y * h, w: p.w * h, h: p.h * h })));
    return higher;
  }

  /** Judges one frame against the board's target. A verdict is counted, and its banner shows. */
  step(frame: BoardFrame): JudgedFrame {
    this.width = frame.width;
    this.height = frame.height;
    this.#lastMs = frame.tMs;
    const judged = this.judge.frame({ ...frame, x: this.targetX, plates: this.plates });
    this.landmarks = judged.retrack ? null : frame.landmarks;
    if (this.targetX !== null) this.#narrowView(frame, this.targetX);
    this.depth = judged.depth;
    // At the bottom of a squat the athlete stands at their station, and the throw that opens next needs its target.
    if (this.#atSquat && this.judge.counter.state === 'BOTTOM')
      this.#pickAt({ ...frame, landmarks: this.landmarks });
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

  /** Starts a set afresh on the same target. The set-up's next search is its first. */
  reset(): void {
    this.judge.reset();
    this.#searched = false;
    this.#atSquat = null;
    this.flash = null;
    this.ball = null;
    this.landmarks = null;
    this.#openView(false);
    this.depth = { ok: false, reason: 'no-pose' };
  }

  /** Opens `poseView` to the whole picture; `forGood` keeps it open until the target or the set changes. */
  #openView(forGood: boolean): void {
    this.poseView = null;
    this.#viewEmptySince = null;
    this.#viewKept = false;
    this.#viewOpened = forGood;
  }

  /** Narrows `poseView` past the person the pose followed in `frame`, when they stand outside the target's lane. */
  #narrowView({ tMs, landmarks, width, height }: BoardFrame, targetX: number): void {
    if (this.#viewOpened) return;
    if (this.poseView && !landmarks) {
      if (this.#viewKept) return;
      this.#viewEmptySince ??= tMs;
      if (tMs - this.#viewEmptySince >= VIEW_EMPTY_MS) this.#openView(true);
      return;
    }
    this.#viewEmptySince = null;
    const person = athleteFrom(landmarks, width, height, this.#visibilityMin);
    if (this.poseView && person && inLane(person, targetX * width, this.#finder)) this.#viewKept = true;
    const view = narrowView(this.poseView ?? { x0: 0, x1: width }, targetX * width, person, this.#finder);
    if (view.x0 > 0 || view.x1 < width) this.poseView = view;
  }

  /** Places the station of the search's plates that the athlete in `frame` stands under, if they stand under one. */
  #pickAt({ landmarks, width, height }: BoardFrame): void {
    const athlete = athleteFrom(landmarks, width, height, this.#visibilityMin);
    const station =
      athlete && this.#atSquat && stationUnder(this.#atSquat, this.candidates, athlete, this.#finder);
    if (!station) return;
    this.#place(station);
    this.#onPicked();
  }

  #place(station: number[]): void {
    const boxes = station.map((i) => this.candidates[i]);
    this.clearCandidates();
    this.placeBoxes(boxes);
  }

  #counted(verdict: Verdict, tMs: number): void {
    // The judging clock runs at the wall clock's pace, on a camera and on a recording played at its own speed.
    const at = Date.now();
    const count = this.#onVerdict(verdict, { startAt: at - (tMs - verdict.rep.startMs), at });
    this.flash = { ...bannerOf(verdict), count, target: verdict.target, until: tMs + FLASH_MS };
  }
}
