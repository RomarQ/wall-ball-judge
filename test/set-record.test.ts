/**
 * Checks what a kept set holds: its counts across a Reset, its time, a set that counted nothing, and a history that
 * cannot be read.
 *
 * Run: npm test
 */
import { expect, it } from 'vitest';
import { parseHistory, SetRecorder, type SetChange } from '../src/set-record';

const START = 1_000_000;

const verdict = (kind: SetChange['kind'], at: number, startAt = at - 1500): SetChange => ({
  kind,
  at: START + at,
  startAt: START + startAt,
  plate: null,
  reason: kind === 'rep' ? null : 'depth',
});

const tap = (kind: SetChange['kind'], at: number): SetChange => ({
  kind,
  at: START + at,
  startAt: null,
  plate: null,
  reason: null,
});

it('starts the record over at a Reset, as the scoreboard starts over', () => {
  const set = new SetRecorder(START);
  set.add(verdict('rep', 5000));
  set.add(verdict('moveFault', 8000));
  set.reset();
  set.add(verdict('rep', 12000));
  const record = set.finish(START + 20000, null);
  expect([record?.reps, record?.moveFaults, record?.changes.length]).toEqual([1, 0, 1]);
});

it('keeps no record of a set that counted nothing', () => {
  const set = new SetRecorder(START);
  set.add(verdict('rep', 5000));
  set.reset();
  expect(set.finish(START + 9000, null)).toBeNull();
});

it('times a set from the start of its first rep to its last change, not from Start to Stop', () => {
  const set = new SetRecorder(START);
  set.add(verdict('rep', 10_000, 8_000));
  set.add(verdict('targetFault', 14_000));
  expect(set.finish(START + 30_000, null)?.timeMs).toBe(6_000);
});

it('counts a tap by hand, which starts the time where it was counted', () => {
  const set = new SetRecorder(START);
  set.add(tap('rep', 4_000));
  set.add(verdict('rep', 9_000, 7_000));
  const record = set.finish(START + 12_000, null);
  expect([record?.reps, record?.timeMs]).toEqual([2, 5_000]);
});

it('reads a history it cannot parse as unreadable, never as an empty one to write over', () => {
  expect(parseHistory('{"version":1,"sets":[')).toBe('unreadable');
  expect(parseHistory('{"version":2,"sets":[]}')).toBe('unreadable');
  expect(parseHistory(null)).toEqual({ version: 1, sets: [] });
});
