/**
 * Checks the scoreboard's rules: the end of the set, a plate tapped by hand, a correction, Reset against a hold, and
 * what a live tally keeps across a reload.
 *
 * Run: npm test
 */
import { expect, it } from 'vitest';
import type { Target } from '../src/ball';
import { REP_TARGET, Tally, type TallyChange, type TallyStore } from '../src/tally';

const quiet = { rep() {}, noRep() {}, done() {} };

/** A store that remembers what was saved last. */
function memory(text: string | null = null): TallyStore & { text: string | null } {
  return {
    text,
    load() {
      return this.text;
    },
    save(value: string) {
      this.text = value;
    },
  };
}

it('ends the set at the hundredth rep: its clock stops and the end plays once', () => {
  let ends = 0;
  const tally = new Tally({ ...quiet, done: () => (ends += 1) });
  for (let i = 0; i < REP_TARGET; i += 1) tally.rep({ startAt: 1000 * i, at: 1000 * i + 500 });
  tally.rep({ startAt: 200_000, at: 200_500 });
  expect([ends, tally.clock.done, tally.clock.elapsedMs(999_999)]).toEqual([1, true, 99_500]);
});

it('counts a plate tapped at or above the division as a rep, and below it as a target no-rep', () => {
  const tap = (which: Target, required: Target) => {
    const tally = new Tally(quiet);
    tally.hitByHand(which, required);
    return [tally.count, tally.targetFaults];
  };
  expect([
    tap('upper', 'upper'),
    tap('upper', 'lower'),
    tap('lower', 'lower'),
    tap('lower', 'upper'),
  ]).toEqual([
    [1, 0],
    [1, 0],
    [1, 0],
    [0, 1],
  ]);
});

it('opens a done set again when a correction takes its last rep back', () => {
  const tally = new Tally(quiet);
  for (let i = 0; i < REP_TARGET; i += 1) tally.rep();
  tally.removeRep();
  expect([tally.count, tally.clock.done]).toEqual([REP_TARGET - 1, false]);
});

it('reports Reset as clearing the board and a clock hold as not', () => {
  const tally = new Tally(quiet);
  const changes: TallyChange[] = [];
  tally.watch((change) => changes.push(change));
  tally.rep();
  tally.hold();
  tally.reset();
  expect(changes.map((change) => change.cleared)).toEqual([false, false, true]);
});

it('takes up a live board in the shape both apps have stored it, and starts fresh from a corrupt one', () => {
  const kept =
    '{"count":12,"targetFaults":2,"moveFaults":1,"clock":{"startedAt":1000,"lastAt":61000,"done":false}}';
  const live = new Tally(quiet, memory(kept));
  expect([live.count, live.targetFaults, live.moveFaults, live.clock.elapsedMs(0)]).toEqual([
    12, 2, 1, 60_000,
  ]);
  expect(new Tally(quiet, memory('{"count":')).count).toBe(0);
});

it('brings a live board back whole after a reload', () => {
  const store = memory();
  const live = new Tally(quiet, store);
  live.rep({ startAt: 1000, at: 2000 });
  live.targetFault({ startAt: 3000, at: 4000 });
  live.noRep({ startAt: 5000, at: 6000 });
  const back = new Tally(quiet, store);
  expect([back.count, back.targetFaults, back.moveFaults, back.clock.elapsedMs(0)]).toEqual([1, 1, 1, 5000]);
});
