/**
 * Where the target sits, from plate boxes: the lines a plate or a pair of
 * plates gives, the marks the hit rule weighs, and where the athlete stands.
 *
 * Nothing here touches the browser, so it runs outside a page too. The finder
 * that runs the model on a picture is in target-finder.ts.
 */
import { TARGETS, type Target } from './ball';
import { LM } from './depth';
import { overlap, type Rect } from './reach';
import type { Box, Landmark } from './types';

/** Where a clip is searched for the plate, in seconds from its start. */
export const SEARCH_AT: readonly number[] = [0, 1, 2, 4];

/**
 * How far below the upper target line the lower one may sit, as fractions of
 * the frame height. The two marks on a plate are 30 cm apart, about a tenth
 * of the frame from where a phone stands, and a line dragged to the floor
 * would put the lower mark somewhere no throw ever reaches.
 */
export const LINE_GAP = 0.02;
// The widest a rig's two heights stand apart in the verified frames is 0.42 of the frame.
export const MAX_GAP = 0.5;
/** How tall a plate placed by hand starts, as a share of the frame height: most plates in the clips are 0.06 to 0.08. */
export const HAND_PLATE = 0.07;
/** The most plates a target holds: the upper mark and the lower, as the hit rule weighs them. */
export const MAX_PLATES = 2;
/** A fingertip on the screen, in points: how near a grab must land to a plate, and the size of a plate's controls. */
export const FINGERTIP_PT = 24;
/** How close to the frame's edge a line or the target's spot may go, as a share of the frame. */
const EDGE = 0.02;

export interface FinderOptions {
  /** A box at least this many times taller than wide holds two marks. */
  twoMarkAspect: number;
  /** Where the marks sit on a two-mark plate, as shares of its height from the top. */
  upperMark: number;
  lowerMark: number;
  /** Where the mark sits on a single disc. */
  singleMark: number;
  /** Below this the finder shows the box as a candidate rather than placing it. */
  sureScore: number;
  /** Below this a box is not even a candidate. */
  minScore: number;
  /** The lowest score a search look keeps a box at, below `minScore` so that a miss can say how close the best plate came. */
  lookScore: number;
  /**
   * The widest a candidate may be against its height.
   *
   * A plate or a disc is about as wide as it is tall, but a line of tape or
   * paint is a thin strip: the target labels of v12's training set reach 8.7,
   * and the detector boxes the lines of val-gym-6 at up to 9.8. A strip wider
   * still is a shelf, a beam or the edge of the wall.
   */
  maxWide: number;
  /**
   * The tallest a candidate may be, as a share of the frame height.
   *
   * A plate on a wall the athlete stands back from is a small part of the
   * picture: of the verified target boxes, ninety-nine in a hundred are
   * within 0.26 of the frame. Anything half the picture tall is the picture.
   */
  maxTall: number;
  /** Two marks share a lane when their centres sit within this many box widths of each other. */
  pairOffset: number;
  /** And are at least this many box heights apart, so one mark boxed twice is not a pair. */
  pairGapMin: number;
  /** And at most this many, so a mark does not pair with something across the gym. */
  pairGapMax: number;
  /** And neither is more than this many times the height of the other. */
  pairSize: number;
  /**
   * A plate further than this many torso lengths sideways from the athlete is
   * another lane's, and is not placed without asking.
   *
   * Measured once a second: the plate the athlete throws at sat within 1.26
   * torso lengths of the middle of the athlete's torso on every clip, and the
   * next lane's plate in a gym no training frame shows from 1.61.
   */
  laneTorsos: number;
  /**
   * A plate sharing this much with a ball box of the same look is the ball,
   * and is not placed without asking.
   *
   * The model calls a dark disc a ball as well as a plate, and a ball in
   * front of a plate a plate as well as a ball; the two boxes then share 0.96
   * or more. No plate it placed rightly shared over 0.09.
   */
  ballOverlap: number;
  /**
   * How much two neighbouring tiles of the search share, in pixels of the
   * model's input, when its input is below the training input. A plate up to this tall lies whole in
   * one tile; the search's whole-frame look carries the bigger ones.
   */
  tileOverlap: number;
}

export const DEFAULTS: FinderOptions = {
  twoMarkAspect: 1.5,
  upperMark: 0.28,
  lowerMark: 0.72,
  singleMark: 0.45,
  sureScore: 0.6,
  minScore: 0.25,
  lookScore: 0.1,
  maxWide: 12,
  maxTall: 0.3,
  // Measured over the verified target boxes: stacked marks sit under 0.5 box
  // widths apart with a clear gap before the plates of the next lane, and
  // between 0.4 and 4.5 box heights apart.
  pairOffset: 0.5,
  pairGapMin: 0.4,
  pairGapMax: 5,
  pairSize: 2,
  laneTorsos: 1.5,
  ballOverlap: 0.5,
  tileOverlap: 96,
};

/** One look at a frame: the plates it offers, best first, and the balls it saw, in pixels. */
export interface Look {
  plates: Box[];
  balls: Box[];
}

/**
 * Where the athlete stands sideways, the middle of the torso, and the torso's length, in pixels. A torso bent towards
 * the camera or away from it is short in the picture, so the length is the shoulders' width when that is longer.
 */
export interface Athlete {
  x: number;
  torso: number;
}

/** One search look at a frame, and where the athlete stands in it. */
export interface Seen {
  look: Look;
  athlete: Athlete | null;
}

/**
 * The plates and balls among a search look's boxes, in a frame `frameHeight`
 * pixels tall, best first, and the best plate score whether it is kept or not,
 * so a miss can say how close it was.
 */
export function readLook(
  found: Box[],
  frameHeight: number,
  cfg: FinderOptions = DEFAULTS,
): { look: Look; best: number } {
  const plates = found
    .filter(
      (b) => b.name === 'target' && b.h > 0 && b.w / b.h <= cfg.maxWide && b.h <= cfg.maxTall * frameHeight,
    )
    .sort((a, b) => b.score - a.score);
  return {
    look: {
      plates: plates.filter((b) => b.score >= cfg.minScore),
      balls: found.filter((b) => b.name === 'ball' && b.score >= cfg.minScore),
    },
    best: plates[0]?.score ?? 0,
  };
}

/**
 * A look's plates grouped into stations, each as the indices of its plates, the higher plate first.
 *
 * A plate and the plate stacked in its lane hold one station's two marks; any other plate is a station of its own.
 * `plates` come best first, as `readLook` gives them, and so do the stations, by their best plate.
 */
export function stationsOf(plates: Plate[], options: Partial<FinderOptions> = {}): number[][] {
  const free = new Set(plates.keys());
  const stations: number[][] = [];
  for (const [i, plate] of plates.entries()) {
    if (!free.delete(i)) continue;
    const partner = pairFor(
      plate,
      [...free].map((j) => plates[j]),
      options,
    );
    const j = partner ? plates.indexOf(partner) : -1;
    free.delete(j);
    stations.push(j < 0 ? [i] : plates[j].y < plate.y ? [j, i] : [i, j]);
  }
  return stations;
}

/**
 * The stations the board may place without a tap: a plate of each is sure, and the same look called none of its
 * plates a ball. The others stay offered for a tap.
 */
export function sureStations(
  { plates, balls }: Look,
  stations: number[][],
  cfg: FinderOptions = DEFAULTS,
): number[][] {
  const ball = (i: number) => balls.some((b) => overlap(plates[i], b) >= cfg.ballOverlap);
  return stations.filter((s) => s.some((i) => plates[i].score >= cfg.sureScore) && !s.some(ball));
}

/** The station the athlete stands under: of `stations`, the nearest to them sideways within their lane, or null. */
export function stationUnder(
  stations: number[][],
  plates: Plate[],
  athlete: Athlete,
  cfg: FinderOptions = DEFAULTS,
): number[] | null {
  const lane = cfg.laneTorsos * athlete.torso;
  let under: number[] | null = null;
  let nearest = Infinity;
  for (const station of stations) {
    const x = station.reduce((sum, i) => sum + centre(plates[i]).x, 0) / station.length;
    const away = Math.abs(x - athlete.x);
    if (away <= lane && away < nearest) [under, nearest] = [station, away];
  }
  return under;
}

/** A span across the frame, from `x0` to `x1`, in pixels. */
export interface Span {
  x0: number;
  x1: number;
}

/**
 * How far a person reaches sideways from the middle of their torso, in torso lengths. Over a set on two clips, the
 * head, shoulders, hips, knees, ankles and arms stayed within 0.82; a squat's knees and elbows reach the furthest.
 */
const REACH_TORSOS = 1;

/** Whether `person` stands in the lane of the target at `targetX`: within `laneTorsos` of their torso lengths sideways. */
export function inLane(person: Athlete, targetX: number, cfg: FinderOptions = DEFAULTS): boolean {
  return Math.abs(person.x - targetX) <= cfg.laneTorsos * person.torso;
}

/**
 * The span of the frame the judging pose may follow someone in, after it followed `person`. Someone outside the lane
 * of the target at `targetX`, as `laneTorsos` measures it, is not the athlete: the span then stops short of them on
 * their side. A person in the lane, or no one, leaves `view` as it is.
 */
export function narrowView(
  view: Span,
  targetX: number,
  person: Athlete | null,
  cfg: FinderOptions = DEFAULTS,
): Span {
  if (!person || inLane(person, targetX, cfg)) return view;
  const reach = REACH_TORSOS * person.torso;
  return person.x < targetX
    ? { x0: Math.max(view.x0, person.x + reach), x1: view.x1 }
    : { x0: view.x0, x1: Math.min(view.x1, person.x - reach) };
}

/**
 * The station a search places without asking, or null: the only sure station, when the athlete stands under it or
 * is out of view.
 *
 * Several sure stations wait for the athlete's first squat: the search often sees the athlete still walking from
 * the phone, beside the next station.
 */
export function placeable({ look, athlete }: Seen, cfg: FinderOptions = DEFAULTS): number[] | null {
  const sure = sureStations(look, stationsOf(look.plates, cfg), cfg);
  if (sure.length !== 1) return null;
  return !athlete || stationUnder(sure, look.plates, athlete, cfg) ? sure[0] : null;
}

/**
 * The search over a clip's frames at `SEARCH_AT`, those before `duration`
 * seconds: the look with the best plate score, and that score.
 *
 * A clip opens on the frame where the phone was still being put down: of the
 * clips recorded so far, two open with no plate the finder will take and both
 * show one a second later. The target does not move, so any frame answers for
 * all, and the search stops at the first frame with a plate to place.
 *
 * A frame whose look fails is passed over, as the frames either side of it
 * carry the same plate. When every look fails, the last failure is thrown:
 * that is a broken detector, not a wall without a plate.
 */
export async function searchClip(
  duration: number,
  lookAt: (seconds: number) => Promise<{ seen: Seen; best: number }>,
  cfg: FinderOptions = DEFAULTS,
): Promise<{ seen: Seen; best: number; at: number }> {
  let found = { seen: { look: { plates: [], balls: [] }, athlete: null } as Seen, best: 0, at: 0 };
  let looked = false;
  let failure: unknown = null;
  for (const at of SEARCH_AT) {
    if (at && !(at < duration)) break;
    let next: { seen: Seen; best: number };
    try {
      next = await lookAt(at);
    } catch (err) {
      failure = err;
      continue;
    }
    looked = true;
    if (next.best > found.best) found = { ...next, at };
    if (placeable(next.seen, cfg)) break;
  }
  if (!looked && failure) throw failure;
  return found;
}

/** A target as plates give it: the two lines, the spot along them, and the plates in frame units, the higher first. */
export interface PlacedTarget {
  lines: Record<Target, number>;
  x: number;
  plates: Rect[];
}

/**
 * The target that plate boxes in pixels of a `w` by `h` frame give: one
 * plate, or a pair holding a mark each. A plate holding both marks is one
 * plate, and the lines sit at the marks within it.
 */
export function placePlates(boxes: Rect[], w: number, h: number): PlacedTarget {
  const [a, b] = boxes;
  const found = b ? linesFromPair(a, b, w, h) : linesFromBox(a, w, h);
  const upper = Math.min(1 - EDGE, Math.max(EDGE, found.upper));
  return {
    lines: { upper, lower: Math.min(Math.max(found.lower, upper + LINE_GAP), upper + MAX_GAP) },
    x: Math.min(1 - EDGE, Math.max(EDGE, found.x)),
    plates: boxes.map((p) => ({ x: p.x / h, y: p.y / h, w: p.w / h, h: p.h / h })).sort((p, q) => p.y - q.y),
  };
}

/**
 * A plate box in pixels of a `w` by `h` frame, centred on a tap at `x` and
 * `y`, fractions of the frame. It keeps the size of the plate placed already,
 * the `required` one of a pair, so the judge sizes it once at a gym; the first
 * is `HAND_PLATE` tall and square. `plates` are in frame units.
 */
export function handPlate(
  x: number,
  y: number,
  w: number,
  h: number,
  plates: Rect[],
  required: Target,
): Rect {
  const sized = plates.length > 1 ? plates[TARGETS.indexOf(required)] : plates[0];
  const pw = (sized?.w ?? HAND_PLATE) * h;
  const ph = (sized?.h ?? HAND_PLATE) * h;
  return { x: x * w - pw / 2, y: y * h - ph / 2, w: pw, h: ph };
}

/** The athlete in a frame w by h pixels, or null when a shoulder or a hip is out of sight. */
export function athleteFrom(
  landmarks: Landmark[] | null,
  w: number,
  h: number,
  visibilityMin: number,
): Athlete | null {
  if (!landmarks) return null;
  const at = (i: number) => landmarks[i];
  const points = [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP].map(at);
  if (points.some((p) => !p || (p.visibility ?? 1) < visibilityMin)) return null;
  const [ls, rs, lh, rh] = points.map((p) => ({ x: p.x * w, y: p.y * h }));
  const shoulders = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  const hips = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
  const torso = Math.max(
    Math.hypot(shoulders.x - hips.x, shoulders.y - hips.y),
    Math.hypot(ls.x - rs.x, ls.y - rs.y),
  );
  return torso > 0 ? { x: (shoulders.x + hips.x) / 2, torso } : null;
}

/** The lines a plate implies: `upper` and `lower` as fractions of the frame height, `x` of its width. */
interface PlateLines {
  upper: number;
  lower: number;
  x: number;
}

/** True when a plate box holds two marks, the upper above the lower, and not a single disc's one. */
export function holdsTwoMarks(box: Pick<Box, 'w' | 'h'>, options: Partial<FinderOptions> = {}): boolean {
  return box.h / box.w >= { ...DEFAULTS, ...options }.twoMarkAspect;
}

/** The lines a plate box implies. Boxes are in pixels. */
function linesFromBox(
  box: Pick<Box, 'x' | 'y' | 'w' | 'h'>,
  frameWidth: number,
  frameHeight: number,
): PlateLines {
  const x = (box.x + box.w / 2) / frameWidth;
  if (holdsTwoMarks(box)) {
    return {
      upper: (box.y + DEFAULTS.upperMark * box.h) / frameHeight,
      lower: (box.y + DEFAULTS.lowerMark * box.h) / frameHeight,
      x,
    };
  }
  const mark = (box.y + DEFAULTS.singleMark * box.h) / frameHeight;
  return { upper: mark, lower: mark, x };
}

type Plate = Pick<Box, 'x' | 'y' | 'w' | 'h'>;

/** A mark the touch rule weighs: the division it stands for, and its height as a fraction of the frame. */
export interface Mark {
  which: Target;
  line: number;
}

/**
 * The marks the touch rule weighs against each other, the upper first.
 *
 * Each line is a mark, and a ball goes to the nearest one. A single disc is
 * one mark, on the upper line its box set, for both divisions. Its second
 * line stands apart from the first only because the two lines keep a gap,
 * and weighing it would give a ball on the disc's lower half to the lower
 * mark. `plates` are in units of the frame height, as the session keeps them.
 */
export function weighedMarks(lines: Record<Target, number | null>, plates: Plate[]): Mark[] {
  const [disc] = plates;
  // The upper mark is at or above every division's, so a hit on it counts for each.
  if (plates.length === 1 && !holdsTwoMarks(disc)) {
    return [{ which: 'upper', line: lines.upper ?? disc.y + disc.h / 2 }];
  }
  return TARGETS.flatMap((which) => {
    const line = lines[which];
    return line === null ? [] : [{ which, line }];
  });
}

const centre = (b: Plate) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/**
 * The candidate holding the other height of `box`'s rig, or null when none does.
 *
 * Of the marks that qualify the nearest is taken, which is the next height up
 * or down on a rig that offers more than two. Shape says nothing here: a mark
 * seen from the side is as tall as a two-mark plate, so only the geometry of
 * one mark against another decides.
 */
export function pairFor(box: Plate, candidates: Plate[], options: Partial<FinderOptions> = {}): Plate | null {
  const cfg = { ...DEFAULTS, ...options };
  const here = centre(box);
  let best: Plate | null = null;
  let bestGap = Infinity;
  for (const other of candidates) {
    if (other === box) continue;
    const there = centre(other);
    if (Math.abs(here.x - there.x) > cfg.pairOffset * Math.max(box.w, other.w)) continue;
    const gap = Math.abs(here.y - there.y) / Math.max(box.h, other.h);
    if (gap < cfg.pairGapMin || gap > cfg.pairGapMax) continue;
    if (Math.max(box.h, other.h) / Math.min(box.h, other.h) > cfg.pairSize) continue;
    if (gap < bestGap) [best, bestGap] = [other, gap];
  }
  return best;
}

/** The lines two marks of one rig imply, the higher one giving the upper line. */
function linesFromPair(a: Plate, b: Plate, frameWidth: number, frameHeight: number): PlateLines {
  const [top, bottom] = a.y <= b.y ? [a, b] : [b, a];
  const mark = (plate: Plate) => (plate.y + DEFAULTS.singleMark * plate.h) / frameHeight;
  return {
    upper: mark(top),
    lower: mark(bottom),
    x: (centre(top).x + centre(bottom).x) / 2 / frameWidth,
  };
}

/** The frame's height in pixels, the unit the detector's boxes are in. */

/**
 * A grab on plate `index`: `resize` at its lower right corner, `remove` on the
 * button beside its top right corner, `move` anywhere else on or near it.
 */
export interface PlateGrab {
  index: number;
  part: 'move' | 'resize' | 'remove';
}

/**
 * The centre of plate `b`'s remove button, a circle `size` across: beside the
 * top right corner, clear of the plate's name above its top left corner and of
 * the resize corner below. `b` and `size` are in one unit.
 */
export function removeSpot(b: Rect, size: number): { x: number; y: number } {
  return { x: b.x + b.w + 0.7 * size, y: b.y + 0.5 * size };
}

/**
 * Which plate a grab at `p` takes, and how, or null for none. Plates, `p` and
 * `reach` are in frame units as the picture shows them; a remove button is
 * `reach` across, and takes a grab only while `removable`. Every plate's
 * corner is tried before any remove button, and both before any plate's body,
 * so a small plate stays sizable and one plate of a pair cannot cover the
 * other's controls.
 */
export function grabPlate(
  plates: Rect[],
  p: { x: number; y: number },
  reach: number,
  removable = false,
): PlateGrab | null {
  const near = (b: Rect, margin: number) =>
    p.x >= b.x - margin && p.x <= b.x + b.w + margin && p.y >= b.y - margin && p.y <= b.y + b.h + margin;
  // A fingertip round the corner would cover a small box, so inside the box
  // the corner keeps only its own part and the rest of the box moves it.
  const onCorner = (b: Rect) =>
    Math.hypot(p.x - (b.x + b.w), p.y - (b.y + b.h)) <=
    (near(b, 0) ? Math.min(reach, 0.3 * Math.min(b.w, b.h)) : reach);
  const corner = plates.findIndex(onCorner);
  if (corner >= 0) return { index: corner, part: 'resize' };
  const onRemove = (b: Rect) => {
    const spot = removeSpot(b, reach);
    return Math.hypot(p.x - spot.x, p.y - spot.y) <= 0.75 * reach;
  };
  const remove = removable ? plates.findIndex(onRemove) : -1;
  if (remove >= 0) return { index: remove, part: 'remove' };
  const body = plates.findIndex((b) => near(b, reach));
  return body >= 0 ? { index: body, part: 'move' } : null;
}
