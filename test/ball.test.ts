/**
 * Drives the ball filter and the target window with synthetic boxes and reps.
 *
 * Run: npm test
 */
import { bodyFrame, TargetCheck, type Target } from '../src/ball';
import type { RepClosed } from '../src/depth';
import { LM } from '../src/depth';
import { expect, it } from 'vitest';
// Values are captured as the check is written, the way the old runner compared them at once.
const check = (name: string, actual: unknown, expected: unknown) => {
  const [got, want] = [JSON.stringify(actual), JSON.stringify(expected)];
  it(name, () => expect(got).toBe(want));
};

const must = <T>(v: T | null | undefined): T => {
  if (v == null) throw new Error('unexpected null');
  return v;
};

{
  const lms = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  lms[LM.LEFT_SHOULDER] = lms[LM.RIGHT_SHOULDER] = { x: 0.5, y: 0.4, z: 0, visibility: 1 };
  lms[LM.LEFT_HIP] = lms[LM.RIGHT_HIP] = { x: 0.5, y: 0.6, z: 0, visibility: 1 };
  check(
    'the torso is the shoulder-to-hip distance',
    Number(must(bodyFrame(lms, 16 / 9)).torso.toFixed(3)),
    0.2,
  );
}

const rep = (depthPass = true): RepClosed => ({
  type: 'rep',
  depthPass,
  maxDepth: depthPass ? 20 : -30,
  startMs: 0,
  endMs: 1000,
});
/** A ball the hit rule put on `struck`, or on no target. */
const ballOn = (struck: Target | null = null) => ({ centre: { x: 0.9, y: 0.3 }, struck });

/** The athlete starts the next squat at `t`: the counter reports it open. */
const nextSquat = (tc: TargetCheck, t: number) =>
  tc.update({ tMs: t, state: 'DOWN', squat: { startMs: t, maxDepth: -30, reachedBottom: false } });

function newCheck(required: Target | null = 'upper') {
  const tc = new TargetCheck();
  tc.required = required;
  return tc;
}

/** Walks the counter's states up to the throw. Returns when the window opened. */
function squat(tc: TargetCheck, t: number) {
  const open = { startMs: t + 200, maxDepth: 20, reachedBottom: true };
  tc.update({ tMs: t, state: 'UP' });
  tc.update({ tMs: t + 300, state: 'DOWN', squat: open });
  tc.update({ tMs: t + 800, state: 'BOTTOM', squat: open });
  tc.update({ tMs: t + 1000, state: 'DRIVING', squat: open });
  return t + 1000;
}

{
  const tc = newCheck();
  const t = squat(tc, 0);
  let v = tc.update({ tMs: t + 300, state: 'DRIVING', ball: ballOn() });
  check('a ball on no target gives no verdict yet', v, null);
  v = tc.update({ tMs: t + 500, state: 'UP', repEvent: rep() });
  check('the rep closing with the ball in the air gives no verdict yet', v, null);
  v = tc.update({ tMs: t + 800, state: 'UP', ball: ballOn('upper') });
  // The closed rep replaced the open squat, so its own start is what is reported.
  check('the hit makes the rep valid', [v?.valid, v?.reason, v?.rep.startMs], [true, null, 0]);
  check('and closes the window', tc.detecting, false);
}

{
  // The hit is the rep. A phone low to the floor reads a standing athlete much
  // like a shallow one, so a whole set can run without the counter ever seeing
  // standing and closing a rep. Every hit in it still counts.
  const tc = newCheck();
  const t = squat(tc, 0);
  const v = tc.update({ tMs: t + 200, state: 'DRIVING', ball: ballOn('upper') });
  check('the hit counts with the athlete still on the way up', [v?.valid, v?.reason], [true, null]);
  const after = tc.update({ tMs: t + 500, state: 'UP', repEvent: rep() });
  check('so the rep closing behind it counts nothing twice', after, null);
}

{
  const tc = newCheck();
  const t = squat(tc, 0);
  tc.update({ tMs: t + 300, state: 'DRIVING', ball: ballOn() });
  tc.update({ tMs: t + 500, state: 'UP', repEvent: rep() });
  let v = tc.update({ tMs: t + 60000, state: 'UP' });
  check('a throw that has not hit waits however long the athlete stands', v, null);
  v = nextSquat(tc, t + 60200);
  check(
    'and the next squat makes it a target fault that names no target',
    [v?.valid, v?.reason, v?.ballSeen, v?.target, v?.rep.startMs],
    [false, 'target', true, null, 0],
  );
}

{
  // A rep in slow motion: the athlete stands with the ball and throws long after.
  const tc = newCheck();
  const t = squat(tc, 0);
  tc.update({ tMs: t + 500, state: 'UP', repEvent: rep() });
  const holding = tc.update({ tMs: t + 4000, state: 'UP' });
  const v = tc.update({ tMs: t + 8000, state: 'UP', ball: ballOn('upper') });
  check('a hit long after the athlete stood up counts', [holding, v?.valid, v?.reason], [null, true, null]);
}

{
  const tc = newCheck();
  const t = squat(tc, 0);
  tc.update({ tMs: t + 500, state: 'UP', repEvent: rep() });
  const v = nextSquat(tc, t + 2000);
  check('an unseen ball is reported as unseen', v?.ballSeen, false);
}

{
  const tc = newCheck();
  const t = squat(tc, 0);
  tc.update({ tMs: t + 300, state: 'DRIVING', ball: ballOn() });
  const v = tc.endThrow(t + 900);
  check('ending the throw with no hit calls a target fault', [v?.valid, v?.reason], [false, 'target']);
  check('and leaves nothing waiting', [tc.detecting, tc.endThrow(t + 1000)], [false, null]);
}

{
  const tc = newCheck();
  tc.update({ tMs: 0, state: 'UP' });
  tc.update({ tMs: 300, state: 'DOWN' });
  const v = tc.update({ tMs: 900, state: 'UP', repEvent: rep(false) });
  check('a shallow squat is a depth fault at once', [v?.valid, v?.reason], [false, 'depth']);
  check('and opens no window', tc.detecting, false);
}

{
  // A phone low to the floor never reads the athlete standing, so the rep
  // closes only as the next squat reaches the bottom.
  const tc = newCheck();
  const t = squat(tc, 0);
  tc.update({ tMs: t + 300, state: 'DRIVING', ball: ballOn() });
  const waiting = tc.update({ tMs: t + 9000, state: 'DRIVING' });
  const next = { startMs: t + 9200, maxDepth: 5, reachedBottom: true };
  const v = tc.update({ tMs: t + 9200, state: 'BOTTOM', squat: next, repEvent: rep() });
  // Rep 1 began at 0, the squat under way at t + 9200. The verdict is rep 1's.
  check(
    'a throw that missed waits with no rep to close it, until the next squat calls it a miss',
    [waiting, v?.valid, v?.reason, v?.rep.startMs],
    [null, false, 'target', 0],
  );
  tc.update({ tMs: t + 9400, state: 'DRIVING', squat: next });
  check('and that squat opens a throw of its own', tc.detecting, true);
}

{
  const tc = newCheck();
  const t = squat(tc, 0);
  tc.update({ tMs: t + 200, state: 'DRIVING', ball: ballOn() });
  const v = tc.update({ tMs: t + 400, state: 'READY', repEvent: { type: 'abort', reason: 'lost-tracking' } });
  check('an abort drops the throw and judges nothing', [v, tc.detecting], [null, false]);
}

{
  const tc = newCheck();
  tc.update({ tMs: 0, state: 'UP', ball: ballOn('upper') });
  const t = squat(tc, 100);
  tc.update({ tMs: t + 500, state: 'UP', repEvent: rep() });
  const v = nextSquat(tc, t + 2000);
  check('a hit before the throw does not count for it', [v?.reason, v?.target], ['target', null]);
}

{
  const tc = newCheck('upper');
  const t = squat(tc, 0);
  tc.update({ tMs: t + 300, state: 'DRIVING', ball: ballOn('lower') });
  tc.update({ tMs: t + 500, state: 'UP', repEvent: rep() });
  const v = nextSquat(tc, t + 2000);
  check(
    'and ends as a target fault that names the lower target',
    [v?.valid, v?.reason, v?.target],
    [false, 'target', 'lower'],
  );
}

{
  // On the way up the ball crosses the women's target before the men's.
  const tc = newCheck('upper');
  const t = squat(tc, 0);
  tc.update({ tMs: t + 200, state: 'DRIVING', ball: ballOn('lower') });
  const v = tc.update({ tMs: t + 300, state: 'DRIVING', ball: ballOn('upper') });
  check(
    "a men's throw that strikes the lower target and then the upper counts, and names the upper",
    [v?.valid, v?.target],
    [true, 'upper'],
  );
}

{
  const tc = newCheck('lower');
  const t = squat(tc, 0);
  const v = tc.update({ tMs: t + 300, state: 'DRIVING', ball: ballOn('lower') });
  check('and counts', [v?.valid, v?.target], [true, 'lower']);
}

{
  const tc = newCheck('lower');
  const t = squat(tc, 0);
  const v = tc.update({ tMs: t + 300, state: 'DRIVING', ball: ballOn('upper') });
  check(
    "the upper target counts for a women's athlete too, and is named",
    [v?.valid, v?.target],
    [true, 'upper'],
  );
}

{
  // The first hit picks the division. The ball passes the women's mark on its way to the men's, so the throw's
  // highest hit decides, not its first look.
  const tc = newCheck(null);
  const t = squat(tc, 0);
  const passing = tc.update({ tMs: t + 200, state: 'DRIVING', ball: ballOn('lower') });
  const v = tc.update({ tMs: t + 300, state: 'DRIVING', ball: ballOn('upper') });
  check(
    "before the division is picked, a hit on the women's mark waits, and the men's mark then picks the men's",
    [passing, v?.valid, v?.target, tc.required],
    [null, true, 'upper', 'upper'],
  );
}

{
  const tc = newCheck(null);
  const t = squat(tc, 0);
  tc.update({ tMs: t + 300, state: 'DRIVING', ball: ballOn('lower') });
  const v = nextSquat(tc, t + 2000);
  check(
    "a first throw that hits only the women's mark picks the women's, and is a rep, not a no-rep",
    [v?.valid, v?.target, tc.required],
    [true, 'lower', 'lower'],
  );
  const after = squat(tc, t + 2000);
  check(
    'and the next one counts at once',
    tc.update({ tMs: after + 300, state: 'DRIVING', ball: ballOn('lower') })?.valid,
    true,
  );
}

{
  // A single disc is one mark for both divisions, and a hit on it says nothing about the athlete.
  const tc = newCheck(null);
  tc.twoMarks = false;
  const t = squat(tc, 0);
  const v = tc.update({ tMs: t + 300, state: 'DRIVING', ball: ballOn('upper') });
  check('a hit on a single disc counts and picks no division', [v?.valid, tc.required], [true, null]);
}

{
  const tc = newCheck(null);
  let t = squat(tc, 0);
  const miss = nextSquat(tc, t + 2000);
  t = squat(tc, t + 2000);
  const v = tc.update({ tMs: t + 300, state: 'DRIVING', ball: ballOn('upper') });
  check(
    'a miss picks nothing, and the next hit picks',
    [miss?.reason, v?.valid, tc.required],
    ['target', true, 'upper'],
  );
}

{
  // What the first look of a throw found is not the ball: a racked ball behind
  // the athlete, or the plate itself boxed as one. The rule passes those over,
  // and each throw learns its own, so a ball left somewhere new is seen there.
  const tc = newCheck();
  const t = squat(tc, 0);
  tc.recordScene([{ x: 1, y: 2, w: 3, h: 4, score: 0.5, name: 'ball' }]);
  tc.recordScene([{ x: 5, y: 6, w: 7, h: 8, score: 0.5, name: 'ball' }]);
  check('the first look of the throw is the scene', tc.scene, [{ x: 1, y: 2, w: 3, h: 4 }]);
  squat(tc, t + 2000);
  check('and the next throw starts with a fresh one', tc.scene, []);
}
