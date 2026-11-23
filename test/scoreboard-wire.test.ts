/**
 * Checks the `board` payload against the contract's layout, and what a display calls for each write it receives.
 *
 * Run: npm test
 */
import { expect, it } from 'vitest';
import {
  callsFor,
  decodeBoard,
  decodeCommand,
  encodeBoard,
  encodeCommand,
  scoreCalls,
  type BoardState,
} from '../src/scoreboard-wire';

const board = (change: Partial<BoardState> = {}): BoardState => ({
  seq: 7,
  event: 'targetFault',
  plate: 'lower',
  count: 258,
  targetFaults: 3,
  moveFaults: 1,
  elapsedMs: 70_000,
  running: true,
  required: 'lower',
  flash: { valid: false, reason: 'target', ballSeen: true, maxDepth: -12.3 },
  ...change,
});

/** Boards and their bytes as the contract table in docs/scoreboard.md lays them out, worked by hand. */
const LAYOUTS: [BoardState, number[]][] = [
  // version, seq, event, plate, count, targetFaults, moveFaults, elapsedMs, flags, reason, maxDepth in tenths
  [board(), [1, 7, 2, 2, 2, 1, 3, 0, 1, 0, 112, 17, 1, 0, 45, 2, 133, 255]],
  [
    board({
      seq: 8,
      event: 'rep',
      plate: 'upper',
      count: 100,
      targetFaults: 0,
      moveFaults: 0,
      elapsedMs: 95_000,
      running: false,
      required: 'upper',
      flash: { valid: true, reason: null, ballSeen: true, maxDepth: 25 },
    }),
    [1, 8, 1, 1, 100, 0, 0, 0, 0, 0, 24, 115, 1, 0, 56, 0, 250, 0],
  ],
  [
    board({
      seq: 9,
      event: 'moveFault',
      plate: null,
      count: 5,
      targetFaults: 0,
      moveFaults: 2,
      elapsedMs: 0,
      required: 'upper',
      flash: { valid: false, reason: 'depth', ballSeen: false, maxDepth: -5 },
    }),
    [1, 9, 3, 0, 5, 0, 0, 0, 2, 0, 0, 0, 0, 0, 9, 1, 206, 255],
  ],
  [
    board({
      seq: 10,
      event: null,
      plate: null,
      count: 0,
      targetFaults: 0,
      moveFaults: 0,
      elapsedMs: 0,
      running: false,
      required: 'upper',
      flash: null,
    }),
    [1, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],
  [
    board({
      seq: 11,
      event: 'rep',
      count: 42,
      flash: { valid: true, reason: null, ballSeen: false, maxDepth: 10 },
    }),
    [1, 11, 1, 2, 42, 0, 3, 0, 1, 0, 112, 17, 1, 0, 29, 0, 100, 0],
  ],
  // A set whose first hit has not picked the division yet.
  [board({ seq: 12, required: null }), [1, 12, 2, 2, 2, 1, 3, 0, 1, 0, 112, 17, 1, 0, 105, 2, 133, 255]],
];

it('lays the board out as the contract table gives it', () => {
  for (const [state, bytes] of LAYOUTS) expect([...encodeBoard(state)]).toEqual(bytes);
});

it('reads back every field it writes', () => {
  for (const [state] of LAYOUTS) expect(decodeBoard(encodeBoard(state))).toEqual(state);
});

it('reads nothing from a board of another version', () => {
  const bytes = encodeBoard(board());
  bytes[0] = 2;
  expect(decodeBoard(bytes)).toBeNull();
});

it('calls nothing for the first board a display receives, whose change came before it', () => {
  expect(callsFor(null, board({ event: 'rep', seq: 9 }))).toEqual([]);
});

it('calls nothing for a board whose change it has seen', () => {
  expect(callsFor(board({ seq: 9 }), board({ seq: 9, count: 0, targetFaults: 0 }))).toEqual([]);
});

it('calls a no-rep of either kind with the no-rep tone', () => {
  expect([
    callsFor(board({ seq: 255 }), board({ seq: 0, event: 'moveFault' })),
    callsFor(board({ seq: 3 }), board({ seq: 4, event: 'targetFault' })),
  ]).toEqual([[{ kind: 'noRep' }], [{ kind: 'noRep' }]]);
});

it('calls a judge that writes the score alone from its counts, and not its corrections', () => {
  const last = { count: 4, noRep: 1 };
  expect(scoreCalls(last, { count: 5, noRep: 1 })).toEqual([{ kind: 'rep', count: 5 }]);
  expect(scoreCalls(last, { count: 4, noRep: 2 })).toEqual([{ kind: 'noRep' }]);
  expect(scoreCalls(last, { count: 0, noRep: 0 })).toEqual([]);
});

it('sends each command as the contract gives it, and reads it back as the same command', () => {
  const reset = { kind: 'reset' } as const;
  const men = { kind: 'required', target: 'upper' } as const;
  const women = { kind: 'required', target: 'lower' } as const;
  expect([reset, men, women].map((command) => [...encodeCommand(command)])).toEqual([
    [1, 1],
    [1, 2],
    [1, 3],
  ]);
  expect(
    [
      [1, 1],
      [1, 2],
      [1, 3],
    ].map(decodeCommand),
  ).toEqual([reset, men, women]);
});

it('reads no command from a payload of another version or an unknown code', () => {
  expect(decodeCommand([2, 1])).toBeNull();
  expect(decodeCommand([1, 4])).toBeNull();
});
