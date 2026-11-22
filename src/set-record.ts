/**
 * One live set as the app keeps it: when it ran, what it judged and what it counted, from the start of the set to its
 * end, and the list of sets the phone keeps. A judged video is never kept as a set. No DOM: test/set-record.test.ts
 * drives it.
 */
import type { Target } from './ball';
import { SetClock } from './clock';

/** What a set counts: a rep, or a no-rep for the target or the squat. */
export type SetChangeKind = 'rep' | 'targetFault' | 'moveFault';

/** A change the set counted, by a camera's verdict or by a tap. */
export interface SetChange {
  kind: SetChangeKind;
  /** When it was counted, in epoch milliseconds. */
  at: number;
  /** When the rep started, for a camera's verdict; a tap has none. */
  startAt: number | null;
  /** The plate that lit: the one the ball reached, or the one the judge tapped. */
  plate: Target | null;
  /** Why a camera's no-rep was one; null for a rep or a tap. */
  reason: 'depth' | 'target' | null;
}

export interface SetRecord {
  version: 1;
  id: string;
  startedAt: number;
  endedAt: number;
  reps: number;
  targetFaults: number;
  moveFaults: number;
  /** From the start of the set's first rep to its last change, as the board's clock runs. */
  timeMs: number;
  /** The changes, oldest first, each at milliseconds from `startedAt`. */
  changes: (Omit<SetChange, 'at' | 'startAt'> & { atMs: number })[];
  /** The camera's video of a live set, which the app saved and owns, as an address; null for none. */
  video: string | null;
}

/** Collects one set's changes from its start. A Reset starts the record over, as it starts the scoreboard over. */
export class SetRecorder {
  #changes: SetChange[] = [];

  constructor(readonly startedAt: number) {}

  add(change: SetChange): void {
    this.#changes.push(change);
  }

  reset(): void {
    this.#changes = [];
  }

  /** The record of the set, ended at `endedAt`, or null when it counted nothing, which is no set to keep. */
  finish(endedAt: number, video: string | null): SetRecord | null {
    const changes = this.#changes;
    if (changes.length === 0) return null;
    const clock = new SetClock();
    for (const change of changes) {
      if (change.startAt === null) clock.tap(change.at);
      else clock.rep(change.startAt, change.at);
    }
    clock.hold();
    const count = (kind: SetChangeKind) => changes.filter((change) => change.kind === kind).length;
    return {
      version: 1,
      id: `${this.startedAt}-${Math.random().toString(36).slice(2, 8)}`,
      startedAt: this.startedAt,
      endedAt,
      reps: count('rep'),
      targetFaults: count('targetFault'),
      moveFaults: count('moveFault'),
      timeMs: clock.elapsedMs(endedAt),
      changes: changes.map(({ at, startAt: _startAt, ...rest }) => ({ ...rest, atMs: at - this.startedAt })),
      video,
    };
  }
}

/** The sets the phone keeps, the newest first. */
export interface SetHistory {
  version: 1;
  sets: SetRecord[];
}

export const emptyHistory = (): SetHistory => ({ version: 1, sets: [] });

/**
 * The history a stored text holds: empty when nothing is stored, and 'unreadable' when the text is no history this
 * app reads, so that a caller never writes an empty list over sets it could not read.
 */
export function parseHistory(text: string | null | undefined): SetHistory | 'unreadable' {
  if (text === null || text === undefined || text === '') return emptyHistory();
  try {
    const value = JSON.parse(text) as Partial<SetHistory>;
    return value.version === 1 && Array.isArray(value.sets) ? { version: 1, sets: value.sets } : 'unreadable';
  } catch {
    return 'unreadable';
  }
}
