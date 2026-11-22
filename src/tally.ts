/**
 * The judge board's scoreboard: the count, the two kinds of no-rep and the set clock, which a camera's verdicts and the
 * judge's taps change, with what each change lights and what it plays. A live board keeps its tally across sets and
 * starts of the app until Reset; a replayed video has a tally of its own, from zero, kept nowhere. No DOM:
 * test/tally.test.ts drives it.
 */
import { counts, type Target, type Verdict } from './ball';
import { SetClock } from './clock';

/** The count at which the set is done. */
export const REP_TARGET = 100;

/** How long a part stays lit after its change. */
export const LIT_MS = 600;

/** The storage key both apps keep a live tally under. */
export const TALLY_KEY = 'judge-state';

/** When a rep started and when it was judged, in epoch milliseconds. A tap by hand passes none: it counts now. */
export interface RepTimes {
  startAt: number;
  at: number;
}

/** A part of the scoreboard that lights when it changes: the count, a no-rep's button, or a target's plate. */
export type LitPart = 'count' | 'targetFault' | 'moveFault' | Target;

/** What a change counted: a rep, or a no-rep for the target or the squat. */
export type TallyEvent = 'rep' | 'targetFault' | 'moveFault';

/** The verdict banner of a rep the camera judged. A tap by hand shows none. */
export interface TallyBanner {
  valid: boolean;
  reason: 'depth' | 'target' | null;
  ballSeen: boolean;
  /** The rep's deepest depth, in percent of the femur's length. */
  maxDepth: number;
}

/** The banner of a camera's verdict. */
export function bannerOf({ valid, reason, ballSeen, rep }: Verdict): TallyBanner {
  return { valid, reason, ballSeen, maxDepth: rep.maxDepth };
}

/**
 * A change of the tally: a rep or a no-rep, with the plate it lit and the banner of a camera's verdict, or `event` null
 * for a change that counts nothing, such as Reset, a correction or a clock hold.
 */
export interface TallyChange {
  event: TallyEvent | null;
  plate: Target | null;
  banner: TallyBanner | null;
  /** When the change was counted, and when its rep started for a camera's verdict, in epoch milliseconds. */
  at: number;
  startAt: number | null;
  /** True for Reset, which clears the board. */
  cleared: boolean;
}

/** What a tally plays: a counted rep's call with its count, a no-rep's tone, and the end of the set. */
export interface TallySounds {
  rep(count: number): void;
  noRep(): void;
  done(): void;
}

/** Where a live tally keeps its numbers. Either call may throw, as a browser's storage does while it is blocked. */
export interface TallyStore {
  load(): string | null;
  save(text: string): void;
}

/** The numbers a store holds, as both apps have always written them. */
interface Stored {
  count: number;
  targetFaults?: number;
  moveFaults?: number;
  clock?: Parameters<typeof SetClock.from>[0];
}

export class Tally {
  count = 0;
  targetFaults = 0;
  moveFaults = 0;
  clock = new SetClock();
  /** When each part last lit, on the wall clock, and whether for a counted rep. */
  readonly lit = new Map<LitPart, { at: number; good: boolean }>();
  readonly #watchers = new Set<(change: TallyChange) => void>();

  /** A tally with a `store` takes up what it kept and keeps each change; one without starts at zero and keeps nothing. */
  constructor(
    private readonly sounds: TallySounds,
    private readonly store: TallyStore | null = null,
  ) {
    if (!store) return;
    try {
      const saved = JSON.parse(store.load() ?? 'null') as Partial<Stored> | null;
      if (saved && typeof saved.count === 'number') {
        this.count = saved.count;
        this.targetFaults = saved.targetFaults ?? 0;
        this.moveFaults = saved.moveFaults ?? 0;
        this.clock = SetClock.from(saved.clock);
      }
    } catch {
      // A corrupt or unreadable entry starts a fresh board.
    }
  }

  get empty(): boolean {
    return this.count === 0 && this.targetFaults === 0 && this.moveFaults === 0;
  }

  /** Calls `watcher` after each change, until the returned function is called. */
  watch(watcher: (change: TallyChange) => void): () => void {
    this.#watchers.add(watcher);
    return () => this.#watchers.delete(watcher);
  }

  /** A rep, counted by hand. */
  rep(times?: RepTimes): void {
    this.#rep(times, null, null);
  }

  /** A squat no-rep, counted by hand. */
  noRep(times?: RepTimes): void {
    this.#noRep(times, null);
  }

  targetFault(times?: RepTimes): void {
    this.#targetFault(times, null, null);
  }

  /** A verdict of the camera's judge, with its banner: a squat no-rep, or the target the ball reached and whether that is enough. */
  judged(verdict: Verdict, times: RepTimes): void {
    const banner = bannerOf(verdict);
    if (verdict.reason === 'depth') this.#noRep(times, banner);
    else this.#targetHit(verdict.target, verdict.valid, times, banner);
  }

  /** A tap on a target's plate: the judge saw the ball hit it, enough when it is the required target or above it. */
  hitByHand(which: Target, required: Target | null): void {
    this.#targetHit(which, counts(which, required), undefined, null);
  }

  /** Takes back the last rep, as a correction: a set below its last rep is no longer done. */
  removeRep(): void {
    this.count = Math.max(0, this.count - 1);
    if (this.count < REP_TARGET) this.clock.reopen();
    this.#changed({ event: null, plate: null, banner: null, at: Date.now(), startAt: null, cleared: false });
  }

  /** Whether `part` is lit at `now`, and for a counted rep. */
  litAt(part: LitPart, now: number): { good: boolean } | null {
    const light = this.lit.get(part);
    return light && now - light.at < LIT_MS ? light : null;
  }

  /** Nothing watches the set any more, so the clock holds at the last verdict. */
  hold(): void {
    this.clock.hold();
    this.#changed({ event: null, plate: null, banner: null, at: Date.now(), startAt: null, cleared: false });
  }

  reset(): void {
    this.count = 0;
    this.targetFaults = 0;
    this.moveFaults = 0;
    this.clock.reset();
    this.#changed({ event: null, plate: null, banner: null, at: Date.now(), startAt: null, cleared: true });
  }

  #rep(times: RepTimes | undefined, plate: Target | null, banner: TallyBanner | null): void {
    const when = this.#mark(times);
    this.count += 1;
    this.sounds.rep(this.count);
    if (this.count === REP_TARGET) {
      this.clock.finish(times?.at ?? Date.now());
      this.sounds.done();
    }
    this.#light('count', true);
    this.#changed({ event: 'rep', plate, banner, cleared: false, ...when });
  }

  #noRep(times: RepTimes | undefined, banner: TallyBanner | null): void {
    const when = this.#mark(times);
    this.moveFaults += 1;
    this.sounds.noRep();
    this.#light('moveFault', false);
    this.#changed({ event: 'moveFault', plate: null, banner, cleared: false, ...when });
  }

  /** The ball reached `which` target, or none, and that is or is not enough. */
  #targetHit(
    which: Target | null,
    valid: boolean,
    times: RepTimes | undefined,
    banner: TallyBanner | null,
  ): void {
    if (which) this.#light(which, valid);
    if (valid) this.#rep(times, which, banner);
    else this.#targetFault(times, which, banner);
  }

  #targetFault(times: RepTimes | undefined, plate: Target | null, banner: TallyBanner | null): void {
    const when = this.#mark(times);
    this.targetFaults += 1;
    this.sounds.noRep();
    this.#light('targetFault', false);
    this.#changed({ event: 'targetFault', plate, banner, cleared: false, ...when });
  }

  #changed(change: TallyChange): void {
    this.#save();
    for (const watcher of this.#watchers) watcher(change);
  }

  #light(part: LitPart, good: boolean): void {
    this.lit.set(part, { at: Date.now(), good });
  }

  #mark(times?: RepTimes): { at: number; startAt: number | null } {
    if (times) {
      this.clock.rep(times.startAt, times.at);
      return times;
    }
    const at = Date.now();
    this.clock.tap(at);
    return { at, startAt: null };
  }

  #save(): void {
    if (!this.store) return;
    try {
      const { count, targetFaults, moveFaults, clock } = this;
      this.store.save(JSON.stringify({ count, targetFaults, moveFaults, clock }));
    } catch {
      // The board still works for the session.
    }
  }
}
