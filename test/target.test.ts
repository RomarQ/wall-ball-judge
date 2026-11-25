/**
 * Checks the lines a found plate implies.
 *
 * Run: npm test
 */
import {
  athleteFrom,
  narrowView,
  pairFor,
  placePlates,
  placeable,
  readLook,
  weighedMarks,
  type Athlete,
  type Look,
} from '../src/placement';
import type { Rect } from '../src/reach';
import type { Box, Landmark } from '../src/types';
import { expect, it } from 'vitest';
// Values are captured as the check is written, the way the old runner compared them at once.
const check = (name: string, actual: unknown, expected: unknown) => {
  const [got, want] = [JSON.stringify(actual), JSON.stringify(expected)];
  it(name, () => expect(got).toBe(want));
};

/** The lines and the spot that the board places from `boxes`, in fractions of the picture. */
const placed = (boxes: Rect[], w: number, h: number) => {
  const { lines, x } = placePlates(boxes, w, h);
  return [lines.upper, lines.lower, x].map((v) => Number(v.toFixed(3)));
};

{
  // A two-mark plate 100 px wide and 200 px tall, its top at y 100, in a 720 x 1280 frame.
  check(
    'a tall box puts the upper mark near the top and the lower near the bottom',
    placed([{ x: 310, y: 100, w: 100, h: 200 }], 720, 1280),
    [0.122, 0.191, 0.5],
  );
}

check(
  'a squat box is one disc: the upper line on its mark, and the lower a line gap below it',
  placed([{ x: 300, y: 100, w: 120, h: 120 }], 720, 1280),
  [0.12, 0.14, 0.5],
);

{
  // eval-gym-1's disc as the finder placed it, in units of the frame height,
  // with the lower line kept LINE_GAP below the upper.
  const disc = { x: 0.795, y: 0.047, w: 0.103, h: 0.104 };
  const marks = weighedMarks({ upper: 0.099, lower: 0.119 }, [disc]);
  check(
    'a single disc is one mark at its centre, so a ball on its lower half is the upper hit too',
    marks.map(({ which, line }) => [which, Number(line.toFixed(3))]),
    [['upper', 0.099]],
  );
  const tall = { x: 0.24, y: 0.078, w: 0.078, h: 0.156 };
  check(
    'a tall plate holds both marks, so both lines are weighed',
    weighedMarks({ upper: 0.122, lower: 0.191 }, [tall]).map(({ which }) => which),
    ['upper', 'lower'],
  );
}

// The two marks of one lane of -NDerrug4tk/f00011, verified by a person, in
// pixels of its 640 x 360 frame.
const UPPER = { x: 242, y: 3, w: 15, h: 28 };
const LOWER = { x: 244, y: 38, w: 13, h: 31 };

{
  check(
    'two marks stacked in one lane give a line each, not two lines off one mark',
    [pairFor(UPPER, [UPPER, LOWER]) === LOWER, placed([UPPER, LOWER], 640, 360)],
    [true, [0.043, 0.144, 0.391]],
  );
}

{
  // The same mark's height, a rig's width away: the next lane, not the next height.
  const otherLane = { ...LOWER, x: LOWER.x + 3 * LOWER.w };
  check('a mark does not pair across lanes', pairFor(UPPER, [UPPER, otherLane]), null);
}

{
  // Something in the same lane at three times the height is not the other mark.
  const banner = { x: 230, y: 90, w: 40, h: 95 };
  check('a mark does not pair with an object of another size', pairFor(UPPER, [UPPER, banner]), null);
}

{
  // The same mark boxed twice, a couple of pixels apart.
  const again = { ...UPPER, y: UPPER.y + 2 };
  check('one mark boxed twice is not a pair', pairFor(UPPER, [UPPER, again]), null);
}

{
  // A rig of three heights: the middle mark belongs with the nearer of the two.
  const third = { x: 243, y: 70, w: 14, h: 30 };
  check('of several heights the nearest is taken', pairFor(LOWER, [UPPER, LOWER, third]), third);
}

/** A search look and where it saw the athlete. */
const seen = (look: Look, athlete: Athlete | null = null) => ({ look, athlete });

{
  const plate = (score: number): Box => ({ x: 0, y: 0, w: 10, h: 10, score, name: 'target' });
  const sure = plate(0.89);
  const weak = plate(0.26);
  const look = (...plates: Box[]): Look => ({ plates, balls: [] });
  check(
    'a sure box beside a weak one is placed, two sure boxes ask, a lone weak one asks',
    [
      placeable(seen(look(sure, weak))),
      placeable(seen(look(sure, plate(0.6)))),
      placeable(seen(look(weak))),
      placeable(seen(look())),
    ],
    [[0], null, null, null],
  );
}

{
  // gym-raw-8's search, in pixels of its 1080 x 1920 frame: the athlete's station, its two plates stacked, and the
  // next station out of the model's sight.
  const box = ([x, y, w, h, score]: number[]): Box => ({ x, y, w, h, score, name: 'target' });
  const look = { plates: [box([320, 147, 111, 143, 0.962]), box([320, 9, 124, 164, 0.953])], balls: [] };
  check(
    'two sure plates stacked in one lane are one station, placed whole, the higher first',
    [placeable(seen(look)), placeable(seen(look, { x: 60, torso: 300 }))],
    [
      [1, 0],
      [1, 0],
    ],
  );
}

{
  // The next lane's dark disc, which the model boxes as a ball as well as a plate.
  const plate: Box = { x: 100, y: 100, w: 50, h: 50, score: 0.89, name: 'target' };
  const ball = (x: number): Box => ({ x, y: 100, w: 50, h: 50, score: 0.45, name: 'ball' });
  check(
    'a sure plate the same look also calls a ball asks; a ball elsewhere does not stop it',
    [
      placeable(seen({ plates: [plate], balls: [ball(101)] })),
      placeable(seen({ plates: [plate], balls: [ball(600)] })),
    ],
    [null, [0]],
  );
}

{
  // A plate whose centre is 140 px from the athlete and whose edge is 190 px away, with a 100 px torso.
  const plate: Box = { x: 100, y: 50, w: 100, h: 60, score: 0.89, name: 'target' };
  const look = { plates: [plate], balls: [] };
  check(
    'a sure plate is placed within a lane of the athlete, measured from its centre in torsos, and asks further off',
    [
      placeable(seen(look, { x: 290, torso: 100 })),
      placeable(seen(look, { x: 320, torso: 100 })),
      placeable(seen(look)),
    ],
    [[0], null, [0]],
  );
}

{
  // A wall of two stations read whole: the athlete's and the next one, both sure. gym-raw-11 and gym-raw-14 show the
  // athlete beside the next station while the search looks, walking from the phone to their own.
  const own: Box = { x: 250, y: 50, w: 50, h: 50, score: 0.8, name: 'target' };
  const next: Box = { x: 450, y: 60, w: 50, h: 50, score: 0.9, name: 'target' };
  const look = { plates: [next, own], balls: [] };
  check(
    'two sure stations a lane apart place neither, wherever the search sees the athlete',
    [
      placeable(seen(look, { x: 280, torso: 100 })),
      placeable(seen(look)),
      placeable(seen(look, { x: 460, torso: 100 })),
    ],
    [null, null, null],
  );
}

{
  const pose = (hipVisibility: number): Landmark[] =>
    Array.from({ length: 33 }, (_, i) => {
      const at: Record<number, [number, number]> = {
        11: [0.4, 0.3],
        12: [0.6, 0.3],
        23: [0.4, 0.5],
        24: [0.6, 0.5],
      };
      const [x, y] = at[i] ?? [0, 0];
      return { x, y, visibility: i === 24 ? hipVisibility : 1 };
    });
  // A portrait frame: the torso runs along y, so y scales by the height.
  check('the athlete on a portrait frame, in pixels', athleteFrom(pose(1), 1080, 1920, 0.5), {
    x: 540,
    torso: 384,
  });
  check('a hip out of sight gives no athlete, so no lane', athleteFrom(pose(0.2), 1080, 1920, 0.5), null);
}

it("stops the pose's view short of a person outside the target's lane, on their side, and leaves it for the athlete", () => {
  // A coach 640 px left of the target with a 270 px torso stands 2.4 torso lengths off, outside the 1.5 of a lane.
  const whole = { x0: 0, x1: 1260 };
  expect(narrowView(whole, 900, { x: 260, torso: 270 })).toEqual({ x0: 530, x1: 1260 });
  expect(narrowView(whole, 900, { x: 1200, torso: 100 })).toEqual({ x0: 0, x1: 1100 });
  expect(narrowView(whole, 900, { x: 1000, torso: 100 })).toEqual(whole);
});

{
  // A shelf across the wall: the detector calls it a target, and it is wider
  // than any plate. Offering it makes the judge pick between real marks and it.
  const wide: Box = { x: 0, y: 100, w: 600, h: 60, score: 0.9, name: 'target' };
  const plate: Box = { x: 255, y: 29, w: 179, h: 154, score: 0.9, name: 'target' };
  // Half the picture: the shape passes, because it is not a strip. Only its
  // size says it is the room rather than a mark on the wall.
  const huge: Box = { x: 100, y: 800, w: 760, h: 700, score: 0.9, name: 'target' };
  check(
    'a plate is neither a strip nor half the picture',
    readLook([wide, plate, huge], 1920).look.plates.map((b) => b.w),
    [plate.w],
  );
}
