/**
 * What crosses Bluetooth from a judging phone to a scoreboard: the GATT
 * contract of docs/scoreboard.md.
 *
 * A board takes `score`, the count and the no-reps. A display that also calls
 * the reps takes `board` too: the whole scoreboard and its last change, which
 * the display calls once. The judging phone owns the count and writes after
 * every change. A display may ask the judging phone for a Reset or another
 * division through `command`. No DOM: test/scoreboard-wire.test.ts drives it.
 */
import type { Target } from './ball';

export interface Score {
  count: number;
  noRep: number;
}

const u16 = (n: number) => Math.max(0, Math.min(0xffff, Math.round(n)));

/** The `score` payload: u16 count, u16 noRep, little-endian. */
export function encodeScore({ count, noRep }: Score): ArrayBuffer {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint16(0, u16(count), true);
  view.setUint16(2, u16(noRep), true);
  return buf;
}

/** A change on the judging phone that a display calls: a rep, or a no-rep of either kind. */
export type BoardEvent = 'rep' | 'targetFault' | 'moveFault';

/** The verdict banner of a rep the camera judged. A tap by hand shows none. */
export interface BoardFlash {
  valid: boolean;
  reason: 'depth' | 'target' | null;
  ballSeen: boolean;
  /** The rep's deepest depth, in percent of the femur's length. */
  maxDepth: number;
}

export interface BoardState {
  /**
   * The number of the last change, from 0 to 255 and round again. It moves
   * only for a change to call, so a write sent again, after a reconnect, a
   * clock hold or a new division, keeps its number.
   */
  seq: number;
  /** The change numbered `seq`. */
  event: BoardEvent | null;
  /** The plate that change lit: the one the ball reached, or the one the judge tapped. */
  plate: Target | null;
  count: number;
  targetFaults: number;
  moveFaults: number;
  /** The set clock's reading when written. A display runs it on from there while `running`. */
  elapsedMs: number;
  running: boolean;
  /** The target the athlete must reach, or null until the set's first hit picks it. */
  required: Target | null;
  /** The banner of the change numbered `seq`. */
  flash: BoardFlash | null;
}

/** The `board` payload's length. It fits one write at Bluetooth's smallest packet size, so a link needs no larger one. */
export const BOARD_BYTES = 18;
const BOARD_VERSION = 1;
const EVENTS: (BoardEvent | null)[] = [null, 'rep', 'targetFault', 'moveFault'];
const PLATES: (Target | null)[] = [null, 'upper', 'lower'];
const REASONS: BoardFlash['reason'][] = [null, 'depth', 'target'];
// Bit 2 stays unset: the contract in docs/scoreboard.md reserves it.
const FLAG = { running: 1, lower: 4, flash: 8, valid: 16, ballSeen: 32, unpicked: 64 } as const;
/** `maxDepth` crosses in tenths. */
const DEPTH_SCALE = 10;

/** The `board` payload, laid out as the contract's table gives it. */
export function encodeBoard(state: BoardState): Uint8Array {
  const bytes = new Uint8Array(BOARD_BYTES);
  const view = new DataView(bytes.buffer);
  const { flash } = state;
  let flags = 0;
  if (state.running) flags |= FLAG.running;
  if (state.required === 'lower') flags |= FLAG.lower;
  if (state.required === null) flags |= FLAG.unpicked;
  if (flash) flags |= FLAG.flash;
  if (flash?.valid) flags |= FLAG.valid;
  if (flash?.ballSeen) flags |= FLAG.ballSeen;
  view.setUint8(0, BOARD_VERSION);
  view.setUint8(1, state.seq & 0xff);
  view.setUint8(2, EVENTS.indexOf(state.event));
  view.setUint8(3, PLATES.indexOf(state.plate));
  view.setUint16(4, u16(state.count), true);
  view.setUint16(6, u16(state.targetFaults), true);
  view.setUint16(8, u16(state.moveFaults), true);
  view.setUint32(10, Math.max(0, Math.min(0xffffffff, Math.round(state.elapsedMs))), true);
  view.setUint8(14, flags);
  view.setUint8(15, flash ? REASONS.indexOf(flash.reason) : 0);
  view.setInt16(
    16,
    flash ? Math.max(-0x8000, Math.min(0x7fff, Math.round(flash.maxDepth * DEPTH_SCALE))) : 0,
    true,
  );
  return bytes;
}

/** The state a `board` payload holds, or null for one too short or of a version this app does not read. */
export function decodeBoard(bytes: ArrayLike<number>): BoardState | null {
  if (bytes.length < BOARD_BYTES || bytes[0] !== BOARD_VERSION) return null;
  const view = new DataView(Uint8Array.from(bytes).buffer);
  const event = EVENTS[view.getUint8(2)];
  const plate = PLATES[view.getUint8(3)];
  const reason = REASONS[view.getUint8(15)];
  if (event === undefined || plate === undefined || reason === undefined) return null;
  const flags = view.getUint8(14);
  const on = (flag: number) => (flags & flag) !== 0;
  return {
    seq: view.getUint8(1),
    event,
    plate,
    count: view.getUint16(4, true),
    targetFaults: view.getUint16(6, true),
    moveFaults: view.getUint16(8, true),
    elapsedMs: view.getUint32(10, true),
    running: on(FLAG.running),
    required: on(FLAG.unpicked) ? null : on(FLAG.lower) ? 'lower' : 'upper',
    flash: on(FLAG.flash)
      ? {
          valid: on(FLAG.valid),
          reason,
          ballSeen: on(FLAG.ballSeen),
          maxDepth: view.getInt16(16, true) / DEPTH_SCALE,
        }
      : null,
  };
}

/** What a display plays: a rep's beep and its count spoken, or a no-rep's tone. */
export type Call = { kind: 'rep'; count: number } | { kind: 'noRep' };

/**
 * The calls a display makes when `next` arrives after `last`, the board it
 * drew. The first board a display receives is drawn and not called: its change
 * happened before the display started. A board sent again after a dropped
 * link keeps its number, so nothing is called twice.
 */
export function callsFor(last: BoardState | null, next: BoardState): Call[] {
  if (!last || next.seq === last.seq) return [];
  if (next.event === 'rep') return [{ kind: 'rep', count: next.count }];
  if (next.event === 'targetFault' || next.event === 'moveFault') return [{ kind: 'noRep' }];
  return [];
}

/**
 * The calls for a judge that writes `score` alone: a count that rises is a
 * rep, and no-reps that rise are a no-rep. A cleared or corrected count calls
 * nothing, nor does the first score of a link.
 */
export function scoreCalls(last: Score | null, next: Score): Call[] {
  if (!last) return [];
  if (next.count > last.count) return [{ kind: 'rep', count: next.count }];
  if (next.noRep > last.noRep) return [{ kind: 'noRep' }];
  return [];
}

/** What the person at a display asks of the judging phone: to clear its board, or to judge another division. */
export type DisplayCommand = { kind: 'reset' } | { kind: 'required'; target: Target };

const COMMAND_VERSION = 1;
const COMMANDS: DisplayCommand[] = [
  { kind: 'reset' },
  { kind: 'required', target: 'upper' },
  { kind: 'required', target: 'lower' },
];
const sameCommand = (a: DisplayCommand, b: DisplayCommand) =>
  a.kind === b.kind && (a.kind === 'reset' || (b.kind === 'required' && a.target === b.target));

/** The `command` payload: the version, then 1 for Reset, 2 for the upper target, 3 for the lower. */
export function encodeCommand(command: DisplayCommand): Uint8Array {
  return Uint8Array.of(COMMAND_VERSION, COMMANDS.findIndex((known) => sameCommand(known, command)) + 1);
}

/** The command a `command` payload holds, or null for one of a version or a code this app does not know. */
export function decodeCommand(bytes: ArrayLike<number>): DisplayCommand | null {
  if (bytes.length < 2 || bytes[0] !== COMMAND_VERSION) return null;
  return COMMANDS[bytes[1] - 1] ?? null;
}
