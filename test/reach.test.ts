/**
 * Checks whether a throw hit the chosen target.
 *
 * Run: npm test
 */
import { awayFromMarks, computeReach, plateAt } from '../src/reach';
import type { Box } from '../src/types';
import { expect, it } from 'vitest';

const check = (name: string, actual: unknown, expected: unknown) => {
  const [got, want] = [JSON.stringify(actual), JSON.stringify(expected)];
  it(name, () => expect(got).toBe(want));
};

const ball = (x: number, y: number, w: number, h: number, score = 0.9): Box => ({
  x,
  y,
  w,
  h,
  score,
  name: 'ball',
});
const off = (r: ReturnType<typeof computeReach>) => (r.ok ? Number(r.off.toFixed(2)) : r.reason);

// One throw of gym-raw-3 in its 1080 x 1920 frame: the upper mark on the wall,
// the ball a tenth of a second before it reached it and once it was there.
const UPPER = { x: 255, y: 29, w: 179, h: 154 };
const AT = ball(257, 31, 190, 196);
const SHORT = ball(250, 209, 180, 171);

check(
  'a ball on the target reads within its own radius, one short of it does not',
  [off(computeReach([AT], UPPER)), off(computeReach([SHORT], UPPER))],
  [0.12, 1.1],
);

check(
  'a plate is centred on its mark, so a ball centred on the mark is no distance from it',
  off(computeReach([ball(250, 50, 100, 100)], plateAt(300, 100, 150))),
  0,
);

{
  // The lower mark below the upper, which the ball passes on the way up, and a ball at the upper height one lane over.
  const LOWER = { ...UPPER, y: 220 };
  const nextLane = ball(UPPER.x + 400, 31, 190, 196);
  check(
    'the reading is the distance to the target given, across as well as up',
    [
      off(computeReach([SHORT], UPPER)),
      off(computeReach([SHORT], LOWER)),
      off(computeReach([nextLane], UPPER)),
    ],
    [1.1, 0.03, 2.07],
  );
}

{
  // A spare ball on the floor, which the detector is surer of than the one in
  // play. Judging the frame by that one leaves the throw unseen.
  const spare = ball(700, 1600, 200, 200, 0.95);
  const thrown = ball(257, 31, 190, 196, 0.6);
  const r = computeReach([spare, thrown], UPPER);
  check(
    'the ball measured is the one at the target, not the one the detector is surest of',
    [r.ok && r.ball.score, off(r)],
    [0.6, 0.12],
  );
}

{
  // The spare on the floor, named as resting. Without that the throw is measured
  // from whichever ball the frame happens to hold.
  const spare = ball(700, 1600, 200, 200, 0.95);
  const thrown = ball(257, 31, 190, 196, 0.6);
  check(
    'a ball named as resting is not the ball in play',
    [
      off(computeReach([spare], UPPER, { idle: [spare] })),
      off(computeReach([spare, thrown], UPPER, { idle: [spare] })),
    ],
    ['no-ball', 0.12],
  );
}

// Two balls when a throw begins: one racked far below the mark, one already at it.
const mark = { x: 540, y: 200 };
check(
  'a ball at the mark on the first look is the throw, not a resting ball',
  awayFromMarks([ball(500, 1500, 80, 80), ball(510, 170, 80, 80)], [mark]).map((b) => b.y),
  [1500],
);

{
  // The rule is contact. A ball that strikes the lower half of the plate has
  // the plate's centre outside it, and a ball that stops a gap short does not
  // touch. Between them, the graze: the ball's edge at the plate's rim, which
  // sits inside the boxes' own error and does not count.
  const hit = (r: ReturnType<typeof computeReach>) => (r.ok ? r.hit : r.reason);
  const low = ball(246, 145, 196, 196);
  const graze = ball(246, 172, 196, 196);
  const gap = ball(246, 224, 196, 196);
  check(
    'a ball on the lower half of the plate touches it, one at the rim or a gap short does not',
    [hit(computeReach([low], UPPER)), hit(computeReach([graze], UPPER)), hit(computeReach([gap], UPPER))],
    [true, false, false],
  );
  const touch = (r: ReturnType<typeof computeReach>) => (r.ok ? Number(r.touch.toFixed(2)) : null);
  check(
    'the plate box sets the reach, and a plate with no box is taken as a ball across',
    [touch(computeReach([AT], UPPER)), touch(computeReach([AT], { ...UPPER, w: 0, h: 0 }))],
    [0.89, 1],
  );
}
