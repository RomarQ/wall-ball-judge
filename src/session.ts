/**
 * A judging session: the camera or a clip, the pose and ball models, the rep
 * counter, the target check, and the overlay. Both pages drive one of these.
 *
 * The session decides the verdicts and draws. It makes no sound and touches
 * no page element beyond the video and the canvas it is given, so each page
 * keeps its own counters and its own audio.
 */
import { type TargetCheck, type Target, type Verdict } from './ball';
import { Board, type SearchOutcome } from './board';
import { ballModelInUse, config, modelsInUse, type PoseQuality } from './config';
import type { Presence, RepCounter } from './depth';
import { createBallDetector, type Detector } from './detector';
import { keptClip } from './kept-clip';
import { render, type Mode, type Notice, type Stats } from './overlay';
import type { NoticeTone } from './overlay-layout';
import { createPose, createStillPose, type Delegate, type Pose, type StillPose } from './pose';
import { SessionRecorder, type Recording } from './record';
import { t, warningText } from './i18n';
import { unitFor } from './phone-check';
import { ballCheckOn, requiredAtStart, storeRequired } from './settings';
import { athleteFrom, searchClip, type Look, type Seen } from './placement';
import { TargetFinder } from './target-finder';
import type { LookTicket } from './frame-judge';
import type { RepTimes } from './tally';
import type { Frame } from './frame';
import type { Landmark, Unit } from './types';
import { flatLandmarks, JudgeLog, loggedVerdict, type LoggedTarget } from './judge-log';
import type { Rect } from './reach';

const noop = () => {};

/** Saves a set's judge log as a file, and leaves it on `window.judgeLog` for a script to read. */
function downloadLog(log: JudgeLog): void {
  const blob = new Blob([JSON.stringify(log.data)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `judge-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  (window as unknown as { judgeLog?: JudgeLog }).judgeLog = log;
}
/**
 * How often a held clip is drawn, in milliseconds. Only the overlay changes
 * on it, under a drag, and a camera's rate draws a drag as a live set does.
 */
const HELD_FRAME_MS = 1000 / 30;

/** Moves a paused clip to `to` seconds and waits for the frame to arrive. */
function seekTo(video: HTMLVideoElement, to: number): Promise<void> {
  if (Math.abs(video.currentTime - to) < 0.01) return Promise.resolve();
  return new Promise((resolve) => {
    video.addEventListener('seeked', () => resolve(), { once: true });
    video.currentTime = to;
  });
}

export type FacingMode = 'user' | 'environment';
export type Source = 'camera' | 'file' | null;

/** The video's painted rectangle on screen, under object-fit: contain. */
export interface FrameRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SessionOptions {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  /**
   * Whether a camera session keeps the camera's video for `stop()` to return.
   * Asked at each camera start, so a setting changed since the last one applies.
   */
  record?: () => boolean;
  /** A closed rep, judged at `times`. May return the count the page shows, for the flash. */
  onVerdict?: (verdict: Verdict, times: RepTimes) => number | void;
  /** The athlete vanished mid-rep. */
  onTrackingLost?: () => void;
  /** A message for a status element: what the session is doing or what went wrong. */
  onStatus?: (text: string) => void;
  /** Each judged frame, for a status element that follows the frames. */
  onFrame?: (tick: FrameTick) => void;
  /** After any stop, with the recording or null. */
  onStopped?: (result: Recording | null) => void;
  /** The board placed the station the athlete squats under. */
  onPicked?: () => void;
  /**
   * How the ball check gets its detector on `unit`: the app's own, from the
   * config, by default. A tool passes another to judge a different model, or
   * one that answers as slowly as a phone would.
   */
  loadDetector?: (unit: Unit) => Promise<Detector>;
}

/** One judged frame, as a status element reads it. */
export interface FrameTick {
  fps: number;
  poseModel: PoseQuality;
  poseDelegate: Delegate;
  mode: Mode;
  /** Where the ball detector runs, as `webgpu` or `wasm`, or null without one. */
  detector: string | null;
  /** The hip's depth around parallel in percent, or null when the hip or the knee is not seen. */
  depth: number | null;
  /** The rep counter's phase. */
  phase: string;
  recording: boolean;
}

/** Every reading of a frame on one line, as `24 fps · full/CPU · depth+target/webgpu · depth -63% · UP`. */
export function frameLine(tick: FrameTick): string {
  const check = tick.mode === 'target' ? `depth+target/${tick.detector ?? '?'}` : 'depth only';
  const depth = tick.depth === null ? '--' : `${tick.depth.toFixed(0)}%`;
  const pose = `${tick.poseModel}/${tick.poseDelegate}`;
  return `${tick.fps} fps · ${pose} · ${check} · depth ${depth} · ${tick.phase}${tick.recording ? ' · rec' : ''}`;
}

/** What the finder saw in one frame, and the athlete in the same frame. */
const errorName = (err: unknown) => (err instanceof Error ? err.name : 'Error');
const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The text for each getUserMedia failure a person can act on, by the error's name. */
const CAMERA_ERRORS = {
  NotAllowedError: 'camera.refused',
  NotFoundError: 'camera.notFound',
  NotReadableError: 'camera.inUse',
  OverconstrainedError: 'camera.overconstrained',
  SecurityError: 'camera.blocked',
  AbortError: 'camera.aborted',
} as const;

/**
 * Turns a getUserMedia failure into something a person can act on.
 *
 * The raw DOMException names say nothing useful on a phone, and the most
 * common cause by far reports as a TypeError on `navigator.mediaDevices`.
 */
function explainCameraError(err: unknown): string {
  const name = errorName(err);
  return Object.hasOwn(CAMERA_ERRORS, name)
    ? t(CAMERA_ERRORS[name as keyof typeof CAMERA_ERRORS])
    : `${name}: ${errorMessage(err)}`;
}

function assertCameraAvailable(): void {
  if (!window.isSecureContext) {
    throw new Error(t('camera.insecure'));
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(t('camera.noApi'));
  }
}

export class Session {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  onVerdict: (verdict: Verdict, times: RepTimes) => number | void;
  onTrackingLost: () => void;
  onStatus: (text: string) => void;
  onFrame: (tick: FrameTick) => void;
  onStopped: (result: Recording | null) => void;
  onPicked: () => void;
  readonly record: () => boolean;
  recorder: SessionRecorder | null = null;

  pose: Pose | null = null;
  detector: Detector | null = null;
  readonly loadDetector: (unit: Unit) => Promise<Detector>;
  /** The judging, the target and what the overlay shows of them; see board.ts. */
  readonly board = new Board({
    depth: config.depth,
    ball: { bite: config.ball.bite },
    onVerdict: (verdict, times) => this.#counted(verdict, times),
    onPicked: () => {
      this.#placed();
      this.onPicked();
    },
  });
  finder: TargetFinder | null = null;
  /** The target search's own pose; see createStillPose. */
  #stillPose: Promise<StillPose | null> | null = null;
  ballCheck: boolean;
  facingMode: FacingMode;

  stream: MediaStream | null = null;
  starting: Promise<void> | null = null;
  running = false;
  source: Source = null;
  wakeLock: WakeLockSentinel | null = null;
  /** The frames the loop judged over the last second. */
  fps = { frames: 0, since: 0, value: 0 };
  notice: Notice | null = null;
  torso: number | null = null;
  stats: Stats;
  /** The set's record for `?log=1`, made afresh at each reset; see judge-log.ts. */
  log: JudgeLog | null = null;

  constructor({
    video,
    canvas,
    record = () => false,
    onVerdict = noop,
    onTrackingLost = noop,
    loadDetector = createBallDetector,
    onStatus = noop,
    onFrame = noop,
    onStopped = noop,
    onPicked = noop,
  }: SessionOptions) {
    this.video = video;
    this.canvas = canvas;
    this.onVerdict = onVerdict;
    this.onTrackingLost = onTrackingLost;
    this.loadDetector = loadDetector;
    this.onStatus = onStatus;
    this.onFrame = onFrame;
    this.onStopped = onStopped;
    this.onPicked = onPicked;
    this.record = record;

    this.board.setRequired(requiredAtStart());
    this.ballCheck = ballCheckOn();
    this.facingMode = localStorage.getItem('facingMode') === 'environment' ? 'environment' : 'user';
    this.stats = this.#freshStats();
  }

  get counter(): RepCounter {
    return this.board.judge.counter;
  }

  get presence(): Presence {
    return this.board.judge.presence;
  }

  /** The target check, which holds the lines and the required target the board sets. */
  get target(): TargetCheck {
    return this.board.judge.target;
  }

  /** 'target' only while the ball check is on and the detector is loaded. */
  get mode(): Mode {
    return this.ballCheck && this.detector ? 'target' : 'depth-only';
  }

  /**
   * Looks for the target plate in the picture. The board places the only
   * sure station at once, or picks the athlete's at their first squat;
   * otherwise the plates found stay as candidates, drawn on the overlay,
   * until `placeTarget` picks one or `clearCandidates` runs. See
   * `Board.searched`.
   *
   * Searching again means the target already placed was the wrong one, so
   * every plate found then goes up for a tap however sure the model is of
   * its favourite. Without that, a wall carrying a plate the model knows well
   * and another it knows less well answers the same way every time, and the
   * judge has no way to ask for the other one.
   *
   * When nothing is found the next tap anywhere on the view places a plate,
   * so a gym the model does not know costs one tap.
   */
  async findTargets(): Promise<SearchOutcome> {
    this.finder ??= new TargetFinder();
    let seen: Seen;
    try {
      seen = await this.#lookForPlates(this.finder);
    } finally {
      // The rate is measured afresh: the seconds of the search measure the search, not the pose.
      this.fps.frames = 0;
      this.fps.since = 0;
    }
    const outcome = this.board.searched(seen, this.finder.cfg);
    if (outcome === 'placed') this.#placed();
    else {
      this.tapToPlace = this.board.candidates.length === 0;
      // The search runs before the set starts, when no frame loop is drawing.
      this.#renderIdle();
    }
    return outcome;
  }

  /**
   * The plates in the clearest of several frames of a clip, or in the one
   * frame a camera is showing.
   *
   * A clip is held on its first frame while the target is chosen, and that is
   * the frame where the phone was still being put down: of the clips recorded
   * so far, two open with no plate the finder will take and both show one a
   * second later. The target does not move, so any frame answers for all.
   *
   * The frames come from a second decoder on the same clip, so the picture the
   * judge is looking at stays on the frame the set starts from.
   */
  async #lookForPlates(finder: TargetFinder): Promise<Seen> {
    const src = this.video.currentSrc;
    if (this.source !== 'file' || !this.video.paused || !src) {
      // The judging pose reads every frame of a running camera or clip, so its
      // last answer places the athlete. A second pose would load and run on
      // the main thread, which on a phone freezes the picture.
      const frame = this.video;
      return this.#seen(await finder.find(frame), frame, this.board.landmarks);
    }
    const reader = document.createElement('video');
    reader.muted = true;
    reader.src = src;
    try {
      await new Promise<void>((resolve, reject) => {
        reader.addEventListener('loadeddata', () => resolve(), { once: true });
        reader.addEventListener('error', () => reject(new Error(t('session.clipNotOpened'))), { once: true });
      });
      const found = await searchClip(
        reader.duration,
        async (at) => {
          await seekTo(reader, at);
          const seen = await this.#look(finder, reader);
          return { seen, best: finder.lastBest };
        },
        finder.cfg,
      );
      finder.lastBest = found.best;
      return found.seen;
    } finally {
      reader.removeAttribute('src');
      reader.load();
    }
  }

  /** The plates and balls in a frame the judging pose has not read, and where the athlete stands in it. */
  async #look(finder: TargetFinder, frame: Frame): Promise<Seen> {
    const look = await finder.find(frame);
    // Without a pose there is no lane to hold a plate to, and the ball guard still stands.
    this.#stillPose ??= createStillPose(config.poseQuality).catch(() => null);
    const pose = await this.#stillPose;
    return this.#seen(look, frame, pose ? pose.find(frame) : null);
  }

  #seen(look: Look, frame: Frame, landmarks: Landmark[] | null): Seen {
    const [w, h] =
      frame instanceof HTMLVideoElement ? [frame.videoWidth, frame.videoHeight] : [frame.width, frame.height];
    return { look, athlete: athleteFrom(landmarks, w, h, config.depth.visibilityMin) };
  }

  /**
   * Places the target as a plate box centred where a tap landed, `y` a
   * fraction of the picture's height and `x` of its width as shown.
   *
   * The box keeps the size of the plate already placed, so the judge sizes it
   * once at a gym; the first is `HAND_PLATE` tall and square.
   */
  placeAt(y: number, x: number): void {
    this.board.placeAt(this.#mirrored() ? 1 - x : x, y);
    this.#placed();
  }

  /**
   * Adds a plate centred where a tap landed, `y` a fraction of the picture's
   * height and `x` of its width as shown, and returns its index; or returns -1
   * when the target holds two already. See `Board.addAt`.
   */
  addAt(y: number, x: number): number {
    const index = this.board.addAt(this.#mirrored() ? 1 - x : x, y);
    if (index >= 0) this.#placed();
    return index;
  }

  /** Removes plate `index`. */
  removePlate(index: number): void {
    this.board.removePlate(index);
    this.#placed();
  }

  /** Places the target from one plate box in pixels of the picture, as the judge drew it. */
  placeBox(box: Rect): void {
    this.board.placeBoxes([box]);
    this.#placed();
  }

  /**
   * Places both lines from candidate `index` and forgets the rest.
   *
   * A mark stacked in the same lane holds the other height, so the two give a
   * line each. Alone, the box gives both lines the way its shape says.
   */
  placeTarget(index: number): void {
    if (!this.board.candidates[index]) return;
    this.board.placeCandidate(index);
    this.#placed();
  }

  /**
   * Moves or resizes plate `index` to `shown`, in frame units as the picture
   * shows it, and puts the lines where the plates now say. Returns the plate's
   * index, which changes when it passes the other plate of a pair.
   */
  setPlate(index: number, shown: Rect): number {
    const { w, h } = this.#frameSize();
    if (!this.board.plates[index] || !h) return index;
    const higher = this.board.setPlate(index, {
      ...shown,
      x: this.#mirrored() ? w / h - (shown.x + shown.w) : shown.x,
    });
    this.#placed();
    return higher;
  }

  /** The placed plates in frame units as the picture shows them, mirrored with it. */
  shownPlates(): Rect[] {
    const { plates } = this.board;
    if (!this.#mirrored()) return plates;
    const { w, h } = this.#frameSize();
    return plates.map((p) => ({ ...p, x: w / h - (p.x + p.w) }));
  }

  /** Takes the target as the board now holds it, and draws it while no frame loop does. */
  #placed(): void {
    this.tapToPlace = false;
    this.#renderIdle();
  }

  /**
   * True while a tap on the running set's view should add a plate: a search
   * came back without a target to tap, so placing one by hand is all there is.
   */
  tapToPlace = true;

  /** True while a target is placed, by a tap or the finder. Each set starts with none. */
  get placed(): boolean {
    return this.board.placed;
  }

  /**
   * False while the target is being chosen: the picture, the pose and the
   * finder all run, and no rep is counted.
   *
   * The target has to be set before a set starts, not during one. Counting
   * from the first frame would judge the reps thrown while the judge was
   * still placing the line, against wherever the line happened to be.
   */
  armed = true;

  /**
   * The last timestamp handed to the pose.
   *
   * It counts the life of the pose model, not of a clip, so `#reset` leaves
   * it alone. The model takes video frames in strictly increasing order and
   * throws on one that goes back, which a second clip starting again at zero
   * would otherwise do on every frame for the rest of the session.
   */
  #poseMs = 0;
  /** The landmarks of the frame a paused clip is holding, read once. */
  #held: { tMs: number; landmarks: Landmark[] | null } | null = null;
  /** The revision the loaded target detector came from. */
  #detectorsOf: string | null = null;
  /** The ball model the loaded ball detector runs, as `ballModelInUse` names it. */
  #ballModelOf: string | null = null;
  /** The unit the open pose was asked for, which a fallback can leave apart from the one it runs on. */
  #poseUnit: Unit | null = null;
  /** The unit the loaded ball detector was asked for. */
  #ballUnit: Unit | null = null;
  /** The newest frame loop; a pass of an older one ends it. */
  #loopId = 0;

  /**
   * True while the target takes no taps and no drags.
   *
   * Pressing find locks it: the plates it draws are what a tap is for, and a
   * mark on the wall is small enough that a tap meant for one would otherwise
   * land on bare picture and add a plate instead. A search that finds nothing
   * unlocks it again, because then placing a plate by hand is all there is.
   */
  targetLocked = false;

  /** A banner on the camera view for `holdMs`, in the tone 'ok', 'warn' or 'plain'. */
  showNotice(text: string, holdMs: number, tone: NoticeTone = 'plain'): void {
    this.notice = { text, tone, until: performance.now() + holdMs };
  }

  clearCandidates(): void {
    this.board.clearCandidates();
    this.#renderIdle();
  }

  /** Which target this athlete must reach: 'upper' for men, 'lower' for women. */
  setRequiredTarget(which: string): void {
    const required: Target = which === 'lower' ? 'lower' : 'upper';
    this.board.setRequired(required);
    storeRequired(required);
    this.#renderIdle();
  }

  #renderIdle(): void {
    if (!this.running) render(this.canvas, { target: this.#targetFrame() });
  }

  #mirrored(): boolean {
    return this.source === 'camera' && this.facingMode === 'user';
  }

  frameRect(): FrameRect | null {
    const r = this.video.getBoundingClientRect();
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (!vw || !vh || !r.width || !r.height) return null;
    const scale = Math.min(r.width / vw, r.height / vh);
    const width = vw * scale;
    const height = vh * scale;
    return {
      left: r.left + (r.width - width) / 2,
      top: r.top + (r.height - height) / 2,
      width,
      height,
    };
  }

  /** Picks the camera. Mid-session it restarts the stream and keeps the counts. */
  async setFacingMode(mode: FacingMode): Promise<void> {
    this.facingMode = mode;
    localStorage.setItem('facingMode', mode);
    if (this.starting) await this.starting.catch(() => {});
    if (this.source !== 'camera' || !this.running) return;
    const stats = { ...this.stats };
    // A camera switch does not end the set, so a throw in the air is dropped rather than called a miss.
    this.target.reset();
    await this.stop();
    await this.startCamera();
    this.stats = stats;
  }

  /**
   * Opens the camera and starts judging. A second call while a start is in
   * progress joins it: a second tap must not open a second stream and hand it
   * to the same video, which interrupts the first play and leaks the first
   * stream.
   */
  startCamera(): Promise<void> {
    if (!this.starting) {
      this.starting = this.#startCamera().finally(() => {
        this.starting = null;
      });
    }
    return this.starting;
  }

  async #startCamera(): Promise<void> {
    assertCameraAvailable();

    // Ask for the camera before loading the model. The permission prompt
    // appears at once, and a blocked camera is reported without a 9 MB
    // download first.
    this.onStatus(t('session.opening'));
    const stream = await this.#openCamera();
    this.stream = stream;

    try {
      await this.#ensurePose();
      this.ballCheck = ballCheckOn();
      this.#followModels();
      await this.#ensureDetector();

      // The front camera is shown mirrored, the way a gym mirror behaves. The
      // depth metric is unaffected: flipping x leaves hip_y, knee_y and the
      // femur length unchanged, so the same number comes out either way.
      this.video.classList.toggle('mirror', this.facingMode === 'user');
      this.video.srcObject = stream;
      this.video.muted = true;
      await this.video.play();
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      throw err;
    }

    this.#reset();
    this.source = 'camera';
    this.running = true;
    this.recorder = this.record() ? new SessionRecorder() : null;
    this.recorder?.start(stream);
    this.#loop();
    // Not awaited: a slow or refused wake lock must not hold up the first frame.
    void this.#requestWakeLock();
  }

  /** Starts a clip that has been waiting on its first frame. */
  async play(): Promise<void> {
    if (this.source === 'file' && this.video.paused) await this.video.play();
  }

  async loadFile(file: File): Promise<void> {
    // Started before the models load: a picked file may stop being readable soon after the pick.
    const clip = keptClip(file);
    await this.#ensurePose();
    this.ballCheck = ballCheckOn();
    this.#followModels();
    await this.#ensureDetector();

    this.video.classList.remove('mirror');
    this.video.srcObject = null;
    this.video.src = URL.createObjectURL(await clip);
    this.video.muted = true;
    await new Promise<void>((resolve, reject) => {
      this.video.addEventListener('loadeddata', () => resolve(), { once: true });
      this.video.addEventListener('error', () => reject(new Error(t('session.clipNotLoaded'))), {
        once: true,
      });
    });

    this.#reset();
    this.source = 'file';
    this.running = true;
    this.video.onended = () => void this.stop();
    this.#loop();
    // A clip waits on its first frame while the target is chosen. Playing
    // through the choosing would spend the set's own reps on it. The element
    // carries `autoplay`, so it has to be stopped rather than simply not started.
    if (this.armed) await this.video.play();
    else {
      this.video.pause();
      this.video.currentTime = 0;
    }
  }

  /** Stops the stream. Resolves to the recording, or null when not recording. */
  async stop(): Promise<Recording | null> {
    if (this.starting) await this.starting.catch(() => {});
    this.running = false;
    // A clip plays on by itself; the view keeps the frame the set stopped on.
    if (this.source === 'file') this.video.pause();
    this.board.clearCandidates();
    // Judging ends here, so a throw that has not hit by now never will.
    const tMs = this.#judgingMs(performance.now());
    const last = this.board.end(tMs);
    if (this.log) {
      this.log.data.end = { tMs, verdict: last ? loggedVerdict(last) : null };
      downloadLog(this.log);
    }
    let result: Recording | null = null;
    if (this.recorder?.active) {
      result = await this.recorder.stop();
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.wakeLock?.release();
    this.wakeLock = null;
    this.onStopped(result);
    return result;
  }

  /** The judging clock at `nowMs` on the performance clock: the clip's own time on a recording. */
  #judgingMs(nowMs: number): number {
    return this.source === 'file' ? this.video.currentTime * 1000 : nowMs;
  }

  #freshStats(): Stats {
    return { counted: 0, valid: 0, noRep: 0, streak: 0, mode: this.mode };
  }

  #reset(): void {
    this.log = new URLSearchParams(location.search).has('log')
      ? new JudgeLog({ depth: config.depth, ball: config.ball })
      : null;
    // A tap or a script may place the target before the first frame sizes the board.
    const { w, h } = this.#frameSize();
    this.board.width = w;
    this.board.height = h;
    this.board.clearTarget();
    this.board.reset();
    this.board.setRequired(requiredAtStart());
    this.stats = this.#freshStats();
    this.notice = null;
    this.#held = null;
  }

  #loggedTarget(): LoggedTarget {
    return {
      lines: { ...this.target.lines },
      required: this.target.required,
      x: this.board.targetX,
      plates: this.board.plates.map((p) => ({ ...p })),
    };
  }

  #targetFrame() {
    if (!this.ballCheck) return null;
    const { board } = this;
    return {
      required: this.target.required,
      plates: board.plates,
      editable: !this.armed,
      ball: board.ball,
      candidates: board.candidates,
      stations: board.stations,
      single: board.singleTarget,
    };
  }

  /**
   * Opens the pose model before the first set, or takes the settings'
   * confidence on the one already open. A pose opened for another unit than
   * the one asked for now is closed and opened again.
   */
  async #ensurePose(): Promise<void> {
    const unit = config.pose.askedUnit ?? unitFor('pose');
    if (this.pose && this.#poseUnit === unit) return this.pose.update();
    this.pose?.close();
    this.pose = null;
    this.onStatus(t('session.loadingPose'));
    this.pose = await createPose({ quality: config.poseQuality, unit });
    this.#poseUnit = unit;
    this.onStatus(t('session.poseReady')(this.pose.delegate, config.models === 'local'));
  }

  /**
   * Drops the ball detector when the settings now choose another ball model,
   * and the target detector when they choose another revision, so the loads
   * that follow take the chosen ones.
   */
  #followModels(): void {
    const ball = ballModelInUse();
    if (ball !== this.#ballModelOf) {
      this.detector?.close();
      this.detector = null;
      this.#ballModelOf = ball;
    }
    const revision = modelsInUse();
    if (revision !== this.#detectorsOf) {
      this.finder?.close();
      this.#detectorsOf = revision;
    }
  }

  /**
   * Loads the ball detector when the ball check is on.
   *
   * A failed load switches the check off, so the HUD says depth only rather
   * than claiming a target check it cannot run.
   */
  async #ensureDetector(): Promise<void> {
    if (!this.ballCheck) return;
    const unit = unitFor('ball');
    if (this.detector && this.#ballUnit === unit) return;
    this.detector?.close();
    this.detector = null;
    this.onStatus(t('session.loadingBall'));
    try {
      this.detector = await this.loadDetector(unit);
      this.#ballUnit = unit;
      this.onStatus(t('session.ballReady')(this.detector.delegate));
    } catch (err) {
      // The ball check is the detector, so without it there is only the depth.
      this.ballCheck = false;
      this.onStatus(t('session.ballUnavailable')(errorMessage(err)));
    }
  }

  /** Counts a judged frame at `nowMs`. */
  #trackFps(nowMs: number): void {
    this.fps.frames += 1;
    if (!this.fps.since) this.fps.since = nowMs;
    const elapsed = nowMs - this.fps.since;
    if (elapsed >= 1000) {
      this.fps.value = Math.round((this.fps.frames * 1000) / elapsed);
      this.fps.frames = 0;
      this.fps.since = nowMs;
    }
  }

  /**
   * Runs the look the judge asked for on this frame. A detection may be
   * asynchronous, so the judge takes its boxes when they come and judges the
   * ball on the frame after; one frame of delay is nothing against the throw.
   */
  #lookForBall(ticket: LookTicket, detector: Detector, frame: Frame): void {
    const log = this.log;
    const lookId = log?.lookStarted(ticket.window);
    Promise.resolve(detector.detect(frame, ticket.tMs, ticket.window ?? undefined))
      .then((found) => {
        if (lookId !== undefined) log?.lookDone(lookId, found);
        this.board.answer(ticket, found);
      })
      .catch((err: unknown) => {
        if (lookId !== undefined) log?.lookDone(lookId, null);
        this.board.judge.abandon(ticket);
        this.onStatus(t('session.detectorError')(errorMessage(err)));
      });
  }

  /** Counts a closed rep once its verdict is in, and returns the count its banner shows. */
  #counted(verdict: Verdict, times: RepTimes): number {
    this.stats.counted += 1;
    if (verdict.valid) {
      this.stats.valid += 1;
      this.stats.streak += 1;
    } else {
      this.stats.noRep += 1;
      this.stats.streak = 0;
    }
    // The page keeps the count the athlete sees, with its resets and manual
    // corrections, so the banner shows the number it returns.
    const shown = this.onVerdict(verdict, times);
    return typeof shown === 'number' && Number.isFinite(shown) ? shown : this.stats.valid;
  }

  /** The picture's size in pixels. */
  #frameSize(): { w: number; h: number } {
    return { w: this.video.videoWidth, h: this.video.videoHeight };
  }

  #resizeCanvas(): void {
    const { w, h } = this.#frameSize();
    if (!w || !h) return;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  #processFrame(tMs: number): void {
    const pose = this.pose;
    if (!pose) return;
    this.#resizeCanvas();
    const frame = this.video;

    const landmarks = this.#landmarks(pose, frame, tMs);
    const logged = this.log?.frame(
      {
        tMs,
        w: this.canvas.width,
        h: this.canvas.height,
        armed: this.armed,
        mode: this.mode,
        landmarks: flatLandmarks(landmarks),
      },
      this.#loggedTarget(),
    );
    this.stats.mode = this.mode;
    const detector = this.detector;
    const { depth, event, verdict, look, retrack } = this.board.step({
      tMs,
      width: this.canvas.width,
      height: this.canvas.height,
      landmarks,
      armed: this.armed,
      ballCheck: this.stats.mode === 'target',
      windowSide: config.ball.windows && detector?.size ? detector.size : null,
    });
    if (retrack) pose.retrack();
    if (event?.type === 'abort' && event.reason === 'lost-tracking') this.onTrackingLost();
    if (logged) {
      logged.depth = depth.ok ? depth.depth : null;
      logged.state = this.counter.state;
    }
    if (look && detector) this.#lookForBall(look, detector, frame);
    if (verdict && logged) logged.verdict = loggedVerdict(verdict);
    if (this.notice && performance.now() > this.notice.until) this.notice = null;
    const { warning } = this.board;
    // As in the Android app: a replay shows no pose before its set starts, and a warning waits for the set.
    const showPose = this.source === 'camera' || this.armed;

    render(this.canvas, {
      landmarks: showPose ? this.board.landmarks : null,
      depth: showPose ? depth : null,
      flash: this.board.flash,
      notice: this.notice,
      warning: this.armed && warning ? warningText(warning) : null,
      mirror: this.#mirrored(),
      target: this.#targetFrame(),
    });

    this.onFrame({
      fps: this.fps.value,
      poseModel: pose.quality,
      poseDelegate: pose.delegate,
      mode: this.stats.mode,
      detector: this.detector?.delegate ?? null,
      depth: depth.ok ? depth.depth : null,
      phase: this.counter.state,
      recording: this.recorder?.active ?? false,
    });
  }

  /**
   * The pose in the frame, read once per frame.
   *
   * A clip held on a frame while the target is chosen shows that frame on
   * every pass, so it is read once and its landmarks serve every pass. MediaPipe's video mode also takes strictly increasing
   * timestamps; judging keeps `tMs`, the clip's own clock, and only the pose
   * gets the counter.
   */
  #landmarks(pose: Pose, frame: Frame, tMs: number): Landmark[] | null {
    const held = this.video.paused;
    if (held && this.#held?.tMs === tMs) return this.#held.landmarks;
    this.#poseMs = Math.max(tMs, this.#poseMs + 1);
    const landmarks = pose.detect(frame, this.#poseMs);
    this.#held = held ? { tMs, landmarks } : null;
    return landmarks;
  }

  #loop(): void {
    // A stopped loop can leave a frame callback waiting on the video, which
    // the next clip's first frame fires while `running` is true again.
    const loop = ++this.#loopId;
    const step = (nowMs: number) => {
      if (!this.running || loop !== this.#loopId) return;
      // Asked for before this frame is read: the frame callback fires only for
      // frames shown after the request, and the read outlasts a camera frame on
      // a phone, so asking after it would skip the frame shown meanwhile.
      const next = this.#onShownFrame(step);
      this.#trackFps(nowMs);
      // Replay uses the video clock so rep durations match the recording.
      const tMs = this.#judgingMs(nowMs);
      try {
        this.#processFrame(tMs);
      } catch (err) {
        this.onStatus(t('session.error')(errorMessage(err)));
      }
      if (next !== null && this.video.paused) this.video.cancelVideoFrameCallback(next);
      if (next === null || this.video.paused) this.#onTick(step);
    };
    if (this.#onShownFrame(step) === null) this.#onTick(step);
  }

  /** Calls `step` for the next frame the video shows; null, with no call, for a paused video or a browser with no frame callback. */
  #onShownFrame(step: (nowMs: number) => void): number | null {
    if (!this.video.requestVideoFrameCallback || this.video.paused) return null;
    return this.video.requestVideoFrameCallback((now) => step(now));
  }

  /**
   * Calls `step` again with no frame shown: a paused clip shows none, and the
   * overlay must still follow the target being chosen on top of it.
   */
  #onTick(step: (nowMs: number) => void): void {
    if (this.video.paused) setTimeout(() => step(performance.now()), HELD_FRAME_MS);
    else requestAnimationFrame((now) => step(now));
  }

  async #requestWakeLock(): Promise<void> {
    try {
      this.wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
    } catch {
      this.wakeLock = null;
    }
  }

  async #openCamera(): Promise<MediaStream> {
    const ideal: MediaStreamConstraints = {
      video: {
        facingMode: { ideal: this.facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
      audio: false,
    };
    try {
      return await navigator.mediaDevices.getUserMedia(ideal);
    } catch (err) {
      // A phone that rejects the preferred size can still give a usable stream.
      const name = errorName(err);
      if (name === 'OverconstrainedError' || name === 'NotFoundError') {
        this.onStatus(t('session.retrying'));
        try {
          return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch (retryErr) {
          throw new Error(explainCameraError(retryErr), { cause: retryErr });
        }
      }
      throw new Error(explainCameraError(err), { cause: err });
    }
  }
}
