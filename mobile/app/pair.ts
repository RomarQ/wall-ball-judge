/**
 * Two phones for one set: a judging phone at the athlete's side or behind, and a display in front, which shows the
 * board and calls each rep. The judge owns the count and sends it after every change; the display draws and calls what
 * it receives. The link is the scoreboard contract of the repository's docs/scoreboard.md.
 */
import { PermissionsAndroid } from 'react-native';
import { scoreLink, type FoundDisplay } from 'wallball-vision';
import {
  callsFor,
  decodeBoard,
  decodeCommand,
  encodeBoard,
  encodeCommand,
  encodeScore,
  scoreCalls,
  type BoardState,
  type Call,
  type DisplayCommand,
  type Flash,
  REP_TARGET,
  Tally,
  type Score,
  type TallyChange,
  type Target,
} from './core';
import { callOnDisplay, repNoRep, repValid, sessionDone, tallySounds } from './sound';

/** The judge's link to a display: none, connecting, connected, or dropped and connecting again. */
export type LinkState = 'none' | 'linking' | 'linked' | 'lost';

/** What the board sends from: a tally, the division it judges, and how a display's command switches that division. */
export interface Source {
  tally: Tally;
  required: () => Target;
  setRequired: (which: Target) => void;
}

/**
 * Asks for the Nearby devices permissions that the display's side or the judge's needs, and returns what still stands
 * in the way, as `scoreLink.trouble` names it, or ''.
 */
export async function readyBluetooth(display: boolean): Promise<string> {
  const { BLUETOOTH_ADVERTISE, BLUETOOTH_CONNECT, BLUETOOTH_SCAN } = PermissionsAndroid.PERMISSIONS;
  await PermissionsAndroid.requestMultiple(display ? [BLUETOOTH_ADVERTISE, BLUETOOTH_CONNECT] : [BLUETOOTH_SCAN, BLUETOOTH_CONNECT]);
  return scoreLink.trouble(display);
}

/** Calls listeners after a change, for the screens that draw it. */
class Changes {
  readonly #listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  protected notify(): void {
    for (const listener of this.#listeners) listener();
  }
}

/**
 * The judging phone's side: the display it links to, and the board it sends after each change of the tally it watches,
 * the open board's or, with none open, the live one. While a display that calls the reps is linked, this phone stays
 * silent; a display that only shows the count leaves the calls here.
 */
export class DisplaySender extends Changes {
  state: LinkState = 'none';
  /** The linked display's name, as its scan gave it. */
  name: string | null = null;
  #seq = 0;
  #last: TallyChange = { event: null, plate: null, banner: null, at: 0, startAt: null, cleared: false };
  #source: Source;
  #stopWatching: () => void;

  /** `live` is what the link sends while no board is open. */
  constructor(private readonly live: Source) {
    super();
    this.#source = live;
    this.#stopWatching = this.#follow(live);
  }

  link(display: FoundDisplay): void {
    this.name = display.name;
    this.#set('linking');
    scoreLink.link(
      display.address,
      display.name,
      (state) => this.#set(state === 'linked-score' ? 'linked' : (state as LinkState), state === 'linked'),
      (bytes) => this.#command(decodeCommand(bytes)),
    );
    this.#send();
  }

  unlink(): void {
    scoreLink.unlink();
    this.name = null;
    this.#set('none');
  }

  /** Sends from `source` from now on, until the returned function goes back to the live board. */
  watch(source: Source): () => void {
    this.#stopWatching();
    this.#stopWatching = this.#follow(source);
    return () => {
      if (this.#source !== source) return;
      this.#stopWatching();
      this.#stopWatching = this.#follow(this.live);
    };
  }

  #follow(source: Source): () => void {
    this.#source = source;
    const stop = source.tally.watch((change) => this.#changed(change));
    this.#send();
    return stop;
  }

  /** Sends the board again, as after a change of division, which the tally does not see. */
  resend(): void {
    this.#send();
  }

  /** Does a display's command as a tap on this phone's board would, which sends the new board back. */
  #command(command: DisplayCommand | null): void {
    if (!command) return;
    console.log(`COMMAND ${JSON.stringify(command)}`);
    if (command.kind === 'reset') {
      this.#source.tally.reset();
    } else {
      this.#source.setRequired(command.target);
      this.#send();
    }
    this.notify();
  }

  #changed(change: TallyChange): void {
    if (change.event) {
      this.#seq = (this.#seq + 1) & 0xff;
      this.#last = change;
      if (this.state !== 'none') console.log(`SEND ${JSON.stringify({ seq: this.#seq, event: change.event })}`);
    }
    this.#send();
  }

  #set(state: LinkState, calls = false): void {
    this.state = state;
    callOnDisplay(state === 'linked' && calls);
    console.log(`LINK ${state}`);
    this.notify();
  }

  #send(): void {
    const { tally, required } = this.#source;
    if (this.state === 'none') return;
    const board: BoardState = {
      seq: this.#seq,
      event: this.#last.event,
      plate: this.#last.plate,
      count: tally.count,
      targetFaults: tally.targetFaults,
      moveFaults: tally.moveFaults,
      elapsedMs: tally.clock.elapsedMs(Date.now()),
      running: tally.clock.running,
      done: tally.clock.done,
      required: required(),
      flash: this.#last.banner,
    };
    const score = new Uint8Array(encodeScore({ count: tally.count, noRep: tally.targetFaults + tally.moveFaults }));
    scoreLink.send([...encodeBoard(board)], [...score]);
  }
}

/** How long the display shows a verdict's banner. */
const BANNER_MS = 2500;

/**
 * The display's side: the board a judge sends, drawn and called. Its tally is a copy, never stored, so the phone's own
 * board keeps its count.
 */
export class DisplayMirror extends Changes {
  readonly tally = new Tally(tallySounds);
  required: Target = 'upper';
  flash: Flash | null = null;
  /** Whether the judge sends `board`. A judge that sends `score` alone has one count of no-reps, in `moveFaults`. */
  full = false;
  /** The connected phones that have written. */
  judges = 0;
  #last: BoardState | null = null;
  #lastScore: Score | null = null;

  /** What stands in the way of the display, '' while it serves, or null before the first answer. */
  trouble: string | null = null;

  /** Advertises and serves until `hide`, again each time Bluetooth comes back on. */
  show(): void {
    scoreLink.showDisplay(
      (which, bytes) => this.#write(which, bytes),
      (judges) => {
        this.judges = judges;
        // The next judge may write `score` alone; a judge that writes `board` sets this again with its first write.
        if (judges === 0) this.full = false;
        this.notify();
      },
      (trouble) => {
        this.trouble = trouble;
        this.notify();
      },
    );
  }

  hide(): void {
    scoreLink.hideDisplay();
  }

  /** Asks the linked judges to do `command`; the new board they send shows it. Says whether a judge received it. */
  ask(command: DisplayCommand): boolean {
    const reached = scoreLink.command([...encodeCommand(command)]);
    console.log(`ASK ${JSON.stringify(command)} reached ${reached}`);
    return reached > 0;
  }

  #write(which: string, bytes: number[]): void {
    if (which === '6504') {
      const next = decodeBoard(bytes);
      if (!next) return;
      const calls = callsFor(this.#last, next, REP_TARGET);
      this.#last = next;
      this.full = true;
      this.#draw(next.count, next.targetFaults, next.moveFaults, next);
      if (calls.length > 0) this.#light(next);
      this.#call(calls);
    } else if (which === '6503' && !this.full && bytes.length >= 4) {
      const score = { count: bytes[0] | (bytes[1] << 8), noRep: bytes[2] | (bytes[3] << 8) };
      const calls = scoreCalls(this.#lastScore, score, REP_TARGET);
      this.#lastScore = score;
      this.#draw(score.count, 0, score.noRep, null);
      if (calls.length > 0) this.tally.lit.set(calls[0].kind === 'noRep' ? 'moveFault' : 'count', { at: Date.now(), good: calls[0].kind !== 'noRep' });
      this.#call(calls);
    }
    this.notify();
  }

  #draw(count: number, targetFaults: number, moveFaults: number, board: BoardState | null): void {
    const { tally } = this;
    tally.count = count;
    tally.targetFaults = targetFaults;
    tally.moveFaults = moveFaults;
    if (!board) return;
    this.required = board.required;
    const { clock } = tally;
    if (board.elapsedMs === 0 && !board.running) {
      clock.reset();
      return;
    }
    // The clock reads `elapsedMs` now and runs on from here while the judge's runs.
    const now = Date.now();
    clock.startedAt = now - board.elapsedMs;
    clock.lastAt = now;
    clock.running = board.running;
    clock.done = board.done;
  }

  /** Lights what the change numbered `board.seq` lit, and shows its banner. */
  #light(board: BoardState): void {
    const at = Date.now();
    const good = board.event === 'rep';
    this.tally.lit.set(board.event === 'rep' ? 'count' : board.event === 'targetFault' ? 'targetFault' : 'moveFault', { at, good });
    if (board.plate) this.tally.lit.set(board.plate, { at, good });
    this.flash = board.flash
      ? { count: board.count, target: board.plate, until: at + BANNER_MS, ...board.flash }
      : null;
  }

  #call(calls: Call[]): void {
    for (const call of calls) {
      console.log(`CALL ${JSON.stringify(call)}`);
      if (call.kind === 'rep') repValid(call.count);
      else if (call.kind === 'noRep') repNoRep();
      else sessionDone();
    }
  }
}
