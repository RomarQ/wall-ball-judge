/**
 * The judge board: the station screen, counted by the camera or by hand.
 *
 * Mirrors the HYROX Labs station screen. The two targets are the men's and
 * the women's heights, and the division switch says which one the athlete
 * must reach. A hit on the required target or above counts a rep; a hit
 * that falls short of it is a target fault; NO REP records a movement
 * fault. The camera session raises the same events, naming the target the
 * ball reached. The buttons stay for corrections.
 */
import * as audio from './audio';
import { TARGETS, type Target } from './ball';
import { clockText, paceOf, STATION_REPS } from './clock';
import { $, setText } from './dom';
import { decimal, onLanguage, t } from './i18n';
import { downloadUrl, videoName } from './record';
import { Session, frameLine, type FrameTick } from './session';
import { recordVideo } from './settings';
import { bindTargetDrag, pointOnFrame } from './target-drag';
import { saveLastSet, SetTrace } from './trace';
import { Tally, TALLY_KEY, type TallyChange } from './tally';
import type { Box } from './types';

/** How far from a candidate's centre a tap still picks it, as a share of the frame height. */
const TAP_REACH = 0.08;

const sounds = { rep: audio.repValid, noRep: audio.repNoRep };

/** The live board's tally, kept in the browser's storage across sets until Reset. */
const liveTally = () =>
  new Tally(sounds, {
    load: () => localStorage.getItem(TALLY_KEY),
    save: (text) => localStorage.setItem(TALLY_KEY, text),
  });

/** The board's tally: the live one, or a replayed file's own, from zero and kept nowhere. */
let tally = liveTally();
let stopWatching = (): void => {};

/** Counts on `next` from now on: the board lights and draws each of its changes. */
function follow(next: Tally): void {
  stopWatching();
  tally = next;
  stopWatching = tally.watch((change) => {
    light(change);
    render();
  });
}

/** The camera's video of the last set and the address a save hands the browser, kept until the next set replaces them. */
let lastVideo: { blob: Blob; url: string } | null = null;

/** The frame rate of the set under way, for the home view's last set. */
let trace: SetTrace | null = null;

/** Closes the trace of the set and keeps its summary for the home view. */
function endTrace(): void {
  if (!trace) return;
  saveLastSet(trace.end(session));
  trace = null;
}

function keepVideo(blob: Blob): void {
  // A save can wait on the browser's download prompt for as long as the judge
  // takes, so the address lives as long as the video does.
  if (lastVideo) URL.revokeObjectURL(lastVideo.url);
  lastVideo = { blob, url: URL.createObjectURL(blob) };
}

const session = new Session({
  video: $<HTMLVideoElement>('video'),
  canvas: $<HTMLCanvasElement>('canvas'),
  onStatus(text) {
    if (!$('cam-loading').hidden) setText('cam-loading', text);
    if (Date.now() < noticeUntil || session.board.candidates.length) return;
    setText('cam-status', text);
  },
  onFrame(tick) {
    showChips();
    if (Date.now() < noticeUntil || session.board.candidates.length) return;
    setText('cam-status', statusDetails ? frameLine(tick) : plainLine(tick));
  },
  onVerdict(verdict, times) {
    tally.judged(verdict, times);
    // The set's first hit may have picked the division.
    renderDivision();
    return tally.count;
  },
  onPicked() {
    // The boxes go with the pick, and with them the reason to lock the target.
    session.targetLocked = false;
    notice(t('board.picked'), t('board.placedBanner'), 'ok');
  },
  onTrackingLost: () => audio.trackingLost(),
  record: recordVideo,
  onStopped(result) {
    if (result?.video) keepVideo(result.video);
    endTrace();
    tally.hold();
    showCamera(false);
  },
});

/** How long the reset button waits for the second tap before it forgets. */
const RESET_ARMED_MS = 4000;
let resetArmed = false;
let resetForgets: number | undefined;

/** Puts the button back to how it sits when nothing is pending. */
function disarmReset(): void {
  clearTimeout(resetForgets);
  resetForgets = undefined;
  resetArmed = false;
  const button = $('reset');
  button.textContent = t('board.reset');
  button.classList.remove('armed');
}

/**
 * Asks for the reset on the button rather than in a dialog.
 *
 * A judge holds the phone in one hand mid-set. A browser dialog covers the
 * board, names the address rather than the station, and has to be dismissed
 * before the count is readable again. Two taps on the button itself say the
 * same thing, and walking away undoes it.
 */
function askReset(): void {
  const button = $('reset');
  if (resetArmed) {
    disarmReset();
    tally.reset();
    return;
  }
  clearTimeout(resetForgets);
  if (tally.empty) {
    button.textContent = t('board.nothingToReset');
    resetForgets = window.setTimeout(disarmReset, 1500);
    return;
  }
  resetArmed = true;
  button.textContent = t('board.tapToClear');
  button.classList.add('armed');
  resetForgets = window.setTimeout(disarmReset, RESET_ARMED_MS);
}

function renderClock(): void {
  const { clock } = tally;
  const elapsed = clock.elapsedMs(Date.now());
  setText('timer', clockText(elapsed));
  const pace = paceOf(elapsed, tally.count);
  setText(
    'pace',
    pace
      ? t('board.pace')(
          decimal(pace.msPerRep / 1000, 1),
          STATION_REPS,
          pace.targetAtMs === null ? null : clockText(pace.targetAtMs),
        )
      : '',
  );
}

function render(): void {
  $('count').textContent = String(tally.count);
  $('target-faults').textContent = String(tally.targetFaults);
  $('move-faults').textContent = String(tally.moveFaults);
  renderClock();
}

function flash(el: HTMLElement, cls = 'lit'): void {
  el.classList.remove(cls);
  void el.offsetWidth; // restart the animation
  el.classList.add(cls);
}

/** Lights the parts a change of the board touched, as the station screen does. */
function light(change: TallyChange): void {
  if (change.event === 'rep') flash($('count'), 'bump');
  else if (change.event === 'moveFault') flash($('fault-move'));
  else if (change.event === 'targetFault') flash($('fault-target'));
  if (change.plate) {
    const icon = $(`target-${change.plate}`);
    icon.classList.remove('lit', 'lit-fault');
    flash(icon, change.event === 'rep' ? 'lit' : 'lit-fault');
  }
}

const isTarget = (which: string): which is Target => (TARGETS as readonly string[]).includes(which);

/** A tap on a target: the judge saw the ball hit it. Enough or not depends on the division. */
function onHit(which: string): void {
  if (isTarget(which)) tally.hitByHand(which, session.target.required);
}

function renderDivision(): void {
  const required = session.target.required;
  for (const button of document.querySelectorAll<HTMLButtonElement>('button.pill')) {
    button.classList.toggle('on', button.dataset.target === required);
  }
  for (const which of TARGETS) $(`target-${which}`).classList.toggle('required', which === required);
}

/** The camera view: the tap-to-start prompt while off, the buttons under the picture while on. */
function showCamera(on: boolean): void {
  $('cam-prompt').hidden = on;
  $('cam-loading').hidden = true;
  $('cam-save').hidden = !lastVideo;
  // As in the Android app: a replay offers its stop once the set runs, and the camera's flip goes while it counts.
  $('stop').hidden = !on || (session.source === 'file' && !session.armed);
  $('flip').hidden = !on || session.source !== 'camera' || session.armed;
  // Choosing the target comes before the set, so the finder is offered and
  // counting waits. Once armed the finder shrinks to a button beside the
  // status line, because a camera knocked mid-set still has to be put right.
  $('setup').hidden = !on || session.armed;
  $('refind').hidden = !on || !session.armed;
  fitPicture();
  if (!on) $('cam-status').textContent = '';
}

/** Shapes the camera view like the picture, so no bars flank the picture and it takes all the room it can. */
function fitPicture(): void {
  const { videoWidth: width, videoHeight: height } = session.video;
  const fitted = session.running && width > 0 && height > 0;
  const viewport = $('viewport');
  viewport.classList.toggle('fitted', fitted);
  if (fitted) viewport.style.setProperty('--aspect', String(width / height));
}

/** The chip a delegate runs a model on: the GPU for WebGPU and MediaPipe's GPU, the CPU for WASM and MediaPipe's CPU. */
function chipOf(delegate: string | undefined): string {
  const chip: Record<string, string> = { webgpu: 'GPU', GPU: 'GPU', wasm: 'CPU', CPU: 'CPU' };
  return delegate ? (chip[delegate] ?? delegate) : '?';
}

/**
 * The footer's second line: the chip each loaded model runs on. Always in
 * view, because the status line gives way to the target search's messages.
 */
function showChips(): void {
  const models: ['ball' | 'finder' | 'pose', string | undefined][] = [
    ['ball', session.ballCheck ? session.detector?.delegate : undefined],
    ['finder', session.finder?.detector?.delegate],
    ['pose', session.pose?.delegate],
  ];
  const text = models
    .flatMap(([model, delegate]) => (delegate ? [t('board.chip')(model, chipOf(delegate))] : []))
    .join(' · ');
  setText('chips', text);
}

/** The status line as the judge reads it: what counts, and how fast. */
function plainLine(tick: FrameTick): string {
  const what = !session.armed
    ? t('board.notCounting')
    : tick.mode === 'target' && session.placed
      ? session.board.singleTarget
        ? t('board.judgingTarget')
        : t('board.judging')(session.target.required)
      : t('board.depthOnly');
  return [what, `${tick.fps} fps`, ...(tick.recording ? [t('board.recording')] : [])].join(' · ');
}

const DETAILS_KEY = 'statusDetails';

/** The status line gives every reading of a frame, for a screen recording of a problem. A tap on the line turns it on or off. */
let statusDetails = localStorage.getItem(DETAILS_KEY) === 'on';

/**
 * A message on the camera status line that the session's ticks leave alone
 * for a while, and as a banner on the camera view, which is what a judge
 * standing back from the phone can read.
 */
let noticeUntil = 0;
function notice(text: string, banner: string, tone: 'ok' | 'warn' | 'plain' = 'plain', holdMs = 6000): void {
  noticeUntil = Date.now() + holdMs;
  $('cam-status').textContent = text;
  session.showNotice(banner, holdMs, tone);
}

/** Looks for the plate; places it, or leaves numbered boxes for a tap. */
async function findTarget(): Promise<void> {
  notice(t('board.looking'), t('board.lookingBanner'), 'plain', 30000);
  // Locked while it looks, so a tap during the search cannot add a plate.
  session.targetLocked = true;
  const started = performance.now();
  try {
    const outcome = await session.findTargets();
    // One number on the preview for each station, the plates of a station together.
    const n = session.board.stations.length;
    session.targetLocked = n > 0;
    showChips();
    const took = t('board.searched')(
      chipOf(session.finder?.detector?.delegate),
      decimal((performance.now() - started) / 1000, 1),
    );
    if (outcome === 'placed') notice(t('board.placed') + took, t('board.placedBanner'), 'ok');
    else if (outcome === 'squat') notice(t('board.atSquat')(n) + took, t('board.atSquatBanner'), 'ok', 15000);
    else if (n === 1) {
      notice(t('board.oneCandidate') + took, t('board.oneCandidateBanner'), 'ok', 15000);
    } else if (n) {
      notice(t('board.candidates')(n) + took, t('board.candidatesBanner')(n), 'ok', 15000);
    } else {
      const best = session.finder?.lastBest ?? 0;
      notice(
        t('board.noTarget')(best > 0 ? decimal(best, 2) : null) + took,
        t('board.noTargetBanner'),
        'warn',
        20000,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    notice(t('board.finderUnavailable')(message), t('board.finderUnavailableBanner'), 'warn', 8000);
  }
}

/**
 * A tap near a candidate picks it, and a tap well away from every one places
 * the target where it lands. Runs before the drag, and swallows the tap.
 *
 * Near, not inside: a mark on the wall is a few percent of the frame, which on
 * a phone is smaller than the finger aiming at it. So the nearest candidate
 * wins as long as the tap lands within a reach of it. A mark the finder does
 * not know is not among them, and the judge tapping it is saying where it is.
 */
function pickCandidate(e: PointerEvent): void {
  if (!session.board.candidates.length || (e.target instanceof Element && e.target.closest('button'))) return;
  const r = session.frameRect();
  const p = r ? pointOnFrame(r, e.clientX, e.clientY) : null;
  if (!p) return;
  const mirrored = session.source === 'camera' && session.facingMode === 'user';
  const px = (mirrored ? 1 - p.x : p.x) * session.video.videoWidth;
  const py = p.y * session.video.videoHeight;
  const height = session.video.videoHeight;
  // A finger's worth of the picture, or the candidate's own size when it is bigger.
  const reach = (c: Box) => Math.max(c.w, c.h, height * TAP_REACH);
  let index = -1;
  let closest = Infinity;
  session.board.candidates.forEach((c, i) => {
    const away = Math.hypot(px - (c.x + c.w / 2), py - (c.y + c.h / 2));
    if (away <= reach(c) && away < closest) [index, closest] = [i, away];
  });
  e.stopImmediatePropagation();
  // The boxes go with the choice, and with them the reason to lock the target.
  session.targetLocked = false;
  if (index < 0) {
    // None of them was it, and the tap shows where it is.
    session.clearCandidates();
    session.placeAt(p.y, p.x);
    notice(t('board.placedByTap'), t('board.placedBanner'), 'ok');
    return;
  }
  session.placeTarget(index);
  notice(t('board.placedPick'), t('board.placedBanner'), 'ok');
}

/**
 * Starts the board on a camera or on a recording.
 *
 * A recording runs through the same pipeline and shows in the same viewport,
 * so the target is found and dragged the same way and the verdicts are the
 * ones the camera would have given. What differs is the clock: a clip is timed
 * by itself, so rep durations are the ones it holds.
 */
async function start(open: () => Promise<void>, source: 'camera' | 'file'): Promise<void> {
  audio.unlockAudio();
  // A replayed file counts from zero, apart from the camera's sets, which take up the stored scoreboard again.
  follow(source === 'file' ? new Tally(sounds) : liveTally());
  render();
  $('cam-prompt').hidden = true;
  $('cam-status').textContent = t('board.starting');
  // The models take a while on a first run, and the view says what it waits for.
  $('cam-loading').textContent = t('board.starting');
  $('cam-loading').hidden = false;
  trace = new SetTrace();
  // Set before opening: a clip waits on its first frame while the target is
  // chosen, rather than playing the set through the choosing.
  session.armed = false;
  try {
    await open();
    // Each start takes the division afresh, as the settings say.
    renderDivision();
    showCamera(true);
    // Search before offering the view. Until something is found there is
    // nothing to tap, and a tap would add a plate wherever it landed.
    await findTarget();
  } catch (err) {
    const failure = t('board.failed')(source === 'file', err instanceof Error ? err.message : String(err));
    endTrace();
    showCamera(false);
    $('cam-status').textContent = failure;
  }
}

/** The start under way, so a stop can wait for it. */
let starting: Promise<void> = Promise.resolve();

/** Starts the board on the camera. */
export function startCamera(): Promise<void> {
  starting = start(() => session.startCamera(), 'camera');
  return starting;
}

/** Starts the board on a recording. */
export function playFile(file: File): Promise<void> {
  starting = start(() => session.loadFile(file), 'file');
  return starting;
}

/** Stops the camera or the recording, once any start under way has finished. */
export async function stopSet(): Promise<void> {
  await starting;
  if (session.running) await session.stop();
}

/** Ends the target-choosing phase and starts counting. */
function arm(): void {
  session.armed = true;
  showCamera(true);
  if (session.ballCheck && !session.placed)
    notice(t('board.untargeted'), t('board.untargetedBanner'), 'warn', 4000);
  else notice(t('board.counting'), t('board.goBanner'), 'ok', 2000);
  void session.play();
}

function bind(): void {
  const unlock = () => audio.unlockAudio();
  document.addEventListener('pointerdown', unlock, { once: true });
  $('reset').addEventListener('click', askReset);
  $('target-upper').addEventListener('click', () => onHit('upper'));
  $('target-lower').addEventListener('click', () => onHit('lower'));
  for (const button of document.querySelectorAll<HTMLButtonElement>('button.pill')) {
    button.addEventListener('click', () => {
      session.setRequiredTarget(button.dataset.target ?? 'upper');
      renderDivision();
    });
  }
  renderDivision();
  $('fault-target').addEventListener('click', () => tally.targetFault());
  $('fault-move').addEventListener('click', () => tally.noRep());

  setInterval(() => {
    if (tally.clock.running) renderClock();
  }, 250);
  setInterval(() => {
    if (session.running && session.armed && session.fps.value) trace?.sample(session.fps.value);
  }, 1000);
  $('go').addEventListener('click', () => arm());
  $('cam-start').addEventListener('click', () => void startCamera());
  $('cam-save').addEventListener('click', () => {
    if (lastVideo) downloadUrl(lastVideo.url, videoName(lastVideo.blob));
  });
  $<HTMLInputElement>('cam-file').addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    // Cleared, so the same clip can be played again straight after.
    (e.target as HTMLInputElement).value = '';
    if (file) void playFile(file);
  });
  $('find').addEventListener('click', () => void findTarget());
  $('refind').addEventListener('click', () => void findTarget());
  $('cam-status').addEventListener('click', () => {
    statusDetails = !statusDetails;
    localStorage.setItem(DETAILS_KEY, statusDetails ? 'on' : 'off');
  });
  session.video.addEventListener('loadedmetadata', fitPicture);
  // A phone turned on its side turns the camera's picture with it.
  session.video.addEventListener('resize', fitPicture);
  $('viewport').addEventListener('pointerdown', pickCandidate, true);
  $('stop').addEventListener('click', () => void session.stop());
  $('flip').addEventListener('click', () => {
    const next = session.facingMode === 'user' ? 'environment' : 'user';
    session
      .setFacingMode(next)
      .then(() => {
        // The switch stopped the session and closed its trace; the set goes on under a new one.
        if (session.running) {
          trace = new SetTrace();
        }
        showCamera(session.running);
      })
      .catch((err: unknown) => {
        $('cam-status').textContent = t('board.failed')(
          false,
          err instanceof Error ? err.message : String(err),
        );
      });
  });
  bindTargetDrag($('viewport'), session);
}

// Exposed so the session can be tuned from the browser console.
window.session = session;

follow(tally);
bind();
render();
onLanguage(() => {
  disarmReset();
  renderClock();
  showChips();
});
