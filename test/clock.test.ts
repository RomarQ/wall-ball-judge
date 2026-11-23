/**
 * Drives the set clock with synthetic rep times.
 *
 * Run: npm test
 */
import { SetClock, clockText, paceOf } from '../src/clock';
import { expect, it } from 'vitest';
// Values are captured as the check is written, the way the old runner compared them at once.
const check = (name: string, actual: unknown, expected: unknown) => {
  const [got, want] = [JSON.stringify(actual), JSON.stringify(expected)];
  it(name, () => expect(got).toBe(want));
};

{
  const c = new SetClock();
  // The rep is handed its start, which is when the hips left the top, not when
  // the ball landed and the verdict came.
  c.rep(1000, 2400);
  check("the clock starts at the first rep's start, not at its verdict", c.elapsedMs(2500), 1500);
}

{
  // The judge walks to the phone and stops it eight seconds after the last throw.
  const c = new SetClock();
  c.rep(1000, 3000);
  c.rep(4000, 6000);
  c.hold();
  check('a stop holds the clock at the last verdict, not at the stop', c.elapsedMs(14000), 5000);
  // Then the judge corrects the count by hand.
  c.tap(20000);
  check('a tap on a held clock corrects the count, not the time', c.elapsedMs(60000), 5000);
}

{
  const c = new SetClock();
  c.rep(1000, 3000);
  c.hold();
  c.rep(30000, 32000);
  check(
    'a rep the camera judges after a stop runs the clock on from the first start',
    c.elapsedMs(33000),
    32000,
  );
  const byHand = new SetClock();
  byHand.tap(1000);
  byHand.tap(3000);
  check('counted by hand, the first tap starts the clock and it runs', byHand.elapsedMs(4000), 3000);
}

{
  const c = new SetClock();
  c.rep(1000, 5000);
  const copy = SetClock.from(JSON.parse(JSON.stringify(c)));
  check('a reload holds a running clock at its last verdict', copy.elapsedMs(60000), 4000);
  const old = SetClock.from({ startedAt: 1000, finishedAt: 15000 });
  check('a board saved with finishedAt holds at that end', old.elapsedMs(60000), 14000);
  // That board's clock ran on until Reset, so it holds no end to stop at.
  const unended = SetClock.from({ startedAt: 1000, finishedAt: null });
  unended.rep(90000000, 90001000);
  check('a board saved with no end starts the clock again', unended.elapsedMs(90002000), 2000);
  check('an old state without a clock starts fresh', SetClock.from(undefined).elapsedMs(1), 0);
}

check('mm:ss', [clockText(0), clockText(65000), clockText(3599999)], ['00:00', '01:05', '59:59']);

check(
  "the pace projects the station's reps until the count reaches them, and waits for a few",
  [paceOf(25000, 10), paceOf(150000, 100), paceOf(5000, 2)],
  [{ msPerRep: 2500, targetAtMs: 250000 }, { msPerRep: 1500, targetAtMs: null }, null],
);
