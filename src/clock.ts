/**
 * The set clock: the time from the start of the first rep to the set's last verdict.
 *
 * It runs from the start of the first rep, pauses included, the way the station
 * clock runs at a race. When nothing watches the set any more, after a stop or a
 * reload, it holds at the last verdict, which is where the set ended; a rep after
 * that runs it on from the same start. Times are epoch milliseconds, so the clock
 * survives a reload. No DOM: test/clock.test.ts drives it.
 */

export interface ClockJSON {
  startedAt: number | null;
  lastAt: number | null;
}

export class SetClock {
  startedAt: number | null = null;
  /** When the last rep was judged. The clock holds here while it does not run. */
  lastAt: number | null = null;
  running = false;

  reset(): void {
    this.startedAt = null;
    this.lastAt = null;
    this.running = false;
  }

  /** A rep that started at `startAt` and was judged at `at`. The first one starts the clock. */
  rep(startAt: number, at: number): void {
    this.startedAt ??= startAt;
    this.lastAt = at;
    this.running = true;
  }

  /**
   * A rep or a fault the judge counted by hand at `at`. It starts the clock or
   * moves a running one; on a held clock it corrects the count, not the time.
   */
  tap(at: number): void {
    if (this.startedAt !== null && !this.running) return;
    this.rep(at, at);
  }

  /** Nothing watches the set any more, so the clock holds at the last verdict. */
  hold(): void {
    this.running = false;
  }

  elapsedMs(now: number): number {
    if (this.startedAt === null) return 0;
    const end = this.running ? now : (this.lastAt ?? this.startedAt);
    return Math.max(0, end - this.startedAt);
  }

  /** `running` stays out: a reloaded board watches nothing until a rep comes. */
  toJSON(): ClockJSON {
    const { startedAt, lastAt } = this;
    return { startedAt, lastAt };
  }

  static from(json: (Partial<ClockJSON> & { finishedAt?: number | null }) | null | undefined): SetClock {
    const clock = new SetClock();
    const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    if (!json || !finite(json.startedAt)) return clock;
    // A board saved by 0.9.6 or earlier holds `finishedAt`, set when the set was
    // complete, and no `lastAt`. With neither, nothing says where its set ended.
    const end = finite(json.lastAt) ? json.lastAt : finite(json.finishedAt) ? json.finishedAt : null;
    if (end === null) return clock;
    clock.startedAt = json.startedAt;
    clock.lastAt = end;
    return clock;
  }
}

/** Milliseconds as mm:ss. */
export function clockText(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/** The fewest reps a pace is read from: the first few say more about the start than the set. */
const PACE_MIN_REPS = 3;

/** The reps of a HYROX wall-ball station, which the pace projects to. A set may go on past them. */
export const STATION_REPS = 100;

/**
 * The set's pace for the station screen: the milliseconds a rep takes, and
 * the time at which the set reaches `STATION_REPS` at that pace, until the
 * count reaches them. Null until a few reps count.
 */
export function paceOf(
  elapsedMs: number,
  reps: number,
): { msPerRep: number; targetAtMs: number | null } | null {
  if (reps < PACE_MIN_REPS || elapsedMs <= 0) return null;
  const msPerRep = elapsedMs / reps;
  return { msPerRep, targetAtMs: reps < STATION_REPS ? msPerRep * STATION_REPS : null };
}
