/**
 * The home view: the drawing of a rep, the controls that start a set, the
 * how-to video, whether this device runs the app, the download of the models
 * for use with no network, the check that tests the device, the speed test that
 * each start runs again, and the offer to install the app.
 */
import { playDemo } from './demo';
import { cameraBlocker } from './diagnostics';
import { $ } from './dom';
import { onLanguage, t } from './i18n';
import { HOW_TO, LINKS } from './links';
import { confirmDownload, keepStored, readOfflineState, storedKept, type OfflineState } from './offline';
import { savedFinder, savedTimes, unitFor, type UnitTimes } from './phone-check';
import { DOWNLOADS, SPEED_TEST, STEPS, modelFiles, preload } from './preload';
import {
  ballReadiness,
  phoneReadiness,
  poseReadiness,
  type Measured,
  type Parts,
  type Readiness,
} from './readiness';
import type { TimedModel } from './settings';
import { lastSet } from './trace';
import { watchVersion } from './version';

/** Chromium's offer to install the page as an app, which the page may show later. */
interface InstallOffer extends Event {
  prompt(): Promise<unknown>;
}

/** How a row of the device's list reads: well, slowly, badly, or not known yet. */
type State = Readiness;

/** The state of each part of the judge on this device, which the answer to whether it runs the app sums up. */
const parts: Parts = { camera: 'none', pose: 'none', ball: 'none', finder: 'none' };

/**
 * A run of the home view's steps: `download` stores the models that the caches lack, `check` is the check that the
 * person starts, and `speed` times the models again on each start.
 */
type Run = 'download' | 'check' | 'speed';

const RUN_STEPS = { download: DOWNLOADS, check: STEPS, speed: SPEED_TEST } as const;

/** The run in progress, which stops when another view takes the place of the home view. */
let checking: AbortController | null = null;

/** The kind of the run in progress, while `checking` holds one. */
let running: Run = 'download';

/** Whether a run timed the models since this page opened, so that the home view starts no speed test by itself. */
let timed = false;

/** Whether a run failed in this visit, so that the home view starts no run by itself again. */
let failed = false;

/** Whether the home view shows, the one view that downloads the models by itself. */
let shown = false;

/** Whether the last check timed both models, though it may have found no time for the pose. */
let checked = false;

const ANSWER = { good: 'home.yes', slow: 'home.maybe', bad: 'home.no' } as const;
const WHY = { slow: 'home.readySlow', bad: 'home.readyBad' } as const;

/**
 * Answers whether this device runs the app, with the reason for a maybe or a no. Until every part is known, it says
 * that it checks while a part is read, that the device is not checked before the check, and that the answer waits
 * for a set when the check gave the pose no time.
 */
function showReady(): void {
  const state = phoneReadiness(parts);
  if (state !== 'none') {
    setSpec('home-ready', state, t(ANSWER[state]));
    setNote('home-ready', state === 'good' ? '' : t(WHY[state]));
    return;
  }
  const reading = (checking !== null && running !== 'download') || parts.camera === 'none';
  const text = reading ? 'home.checking' : checked ? 'home.notKnown' : 'home.notChecked';
  setSpec('home-ready', state, t(text));
  setNote('home-ready', text === 'home.notKnown' ? t('home.firstSet') : '');
}

const OFFLINE = {
  ready: { text: () => t('home.yes'), state: 'good' },
  'not-ready': { text: () => t('home.notYet'), state: 'none' },
  pending: { text: () => t('home.checking'), state: 'none' },
  off: import.meta.env.DEV
    ? { text: () => t('home.devServer'), state: 'none' }
    : { text: () => t('home.notInBrowser'), state: 'bad' },
} as const satisfies Record<OfflineState, { text: () => string; state: State }>;

/** Writes one row of the device's list. */
function setSpec(id: string, state: State, text: string, detail = ''): void {
  const value = document.createElement('span');
  value.dataset.state = state;
  value.textContent = text;
  const row = $(id);
  row.replaceChildren(value);
  if (detail) {
    const small = document.createElement('small');
    small.textContent = detail;
    row.append(small);
  }
}

/** Writes a sentence under one row of the device's list, across the row's whole width, or removes it. */
function setNote(id: string, note: string): void {
  const row = $(id).parentElement;
  if (!row) return;
  let line = row.querySelector<HTMLElement>('dd.note');
  if (!note) {
    line?.remove();
    return;
  }
  if (!line) {
    line = document.createElement('dd');
    line.className = 'note';
    row.append(line);
  }
  line.textContent = note;
}

/** Whether the browser gives the app a camera. */
async function readCamera(): Promise<void> {
  if (cameraBlocker()) parts.camera = 'bad';
  else {
    // Without the camera permission the list names no camera, but it still holds one entry for each.
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    parts.camera = devices.some((device) => device.kind === 'videoinput') ? 'good' : 'bad';
  }
  showReady();
}

/** Whether the target finder's model loaded in the check. */
function readFinder(): void {
  const loaded = savedFinder();
  parts.finder = loaded === null ? 'none' : loaded ? 'good' : 'bad';
}

/**
 * The time of a frame of the pose or a look of the ball check on the unit a set runs it on, else on the other unit,
 * which a set takes when the first does not run the model. With no time on either, the ball check ran nowhere; the
 * pose had no athlete to time on, and the rate of the last set says how it ran.
 */
function measured(model: TimedModel, times: UnitTimes | null): Measured {
  if (!times) return null;
  const unit = unitFor(model);
  const ms = times[unit] ?? times[unit === 'gpu' ? 'cpu' : 'gpu'];
  if (ms !== null) return ms;
  if (model === 'ball') return 'failed';
  const fps = lastSet()?.fps?.mean;
  return fps ? 1000 / fps : null;
}

/** Reads how fast the last check ran each timed model on the unit a set runs it on, and whether it timed both. */
function readUnits(): void {
  checked = true;
  for (const model of ['pose', 'ball'] as const) {
    const times = savedTimes(model);
    if (!times) checked = false;
    const ms = measured(model, times);
    parts[model] = model === 'pose' ? poseReadiness(ms) : ballReadiness(ms);
  }
}

function showLastSet(): void {
  const set = lastSet();
  $('home-pose-row').hidden = !set?.fps;
  if (!set?.fps) return;
  const [quality, delegate] = (set.pose ?? '').split('/');
  const model = t('home.poseModel')(quality === 'lite', delegate === 'GPU' ? 'GPU' : 'CPU');
  setSpec('home-pose', 'none', t('home.frames')(set.fps.mean), model);
}

/** The browser's offer to install the app, held until the person taps Install. It prompts once. */
let offer: InstallOffer | null = null;
/**
 * The browser reported an install from this page, which leaves this page in its browser tab. It proves no install:
 * Brave reports one before the home screen asks to place the icon, which the person can still cancel.
 */
let installed = false;

/** This page runs as the installed app, the one install state that a page can know for sure. */
const runsAsApp = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** An iPad reports itself as a Mac, so a touch screen tells the two apart. */
const onIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

function installSteps(): string {
  if (onIos()) return t('home.installIos');
  return /Android/.test(navigator.userAgent) ? t('home.installAndroid') : t('home.installOther');
}

/**
 * Says Yes inside the installed app. A browser tab cannot tell whether the device has the app (Brave offers the
 * install again in every tab after it adds the app to the home screen), so there the row offers the install: a button
 * where the browser offers one, its own steps elsewhere, and where to open the app once this page installed it.
 */
function showInstalled(): void {
  const app = runsAsApp();
  $('home-installed-label').textContent = t(app ? 'home.installed' : 'home.installApp');
  if (app) {
    setSpec('home-installed', 'good', t('home.yes'));
    setNote('home-installed', '');
    return;
  }
  if (!offer) {
    $('home-installed').replaceChildren();
    setNote('home-installed', installed ? t('home.openInstalled') : installSteps());
    return;
  }
  setNote('home-installed', '');
  const button = document.createElement('button');
  button.className = 'install';
  button.textContent = t('home.install');
  button.addEventListener('click', () => {
    const asked = offer;
    offer = null;
    void asked?.prompt().finally(showInstalled);
  });
  $('home-installed').replaceChildren(button);
}

/** Offers the full check when the device lacks a result or the stored models, and a second check otherwise. */
function offerCheck(needed: boolean): void {
  $('home-check').hidden = !needed;
  $('home-recheck').hidden = needed;
}

/**
 * Shows the rows that come from the last check and from the caches, offers the check that either lacks, and downloads
 * the models that the caches lack.
 *
 * The last check shows at once. The caches can be read only once a service
 * worker controls the page, which on a first visit takes a moment.
 */
async function showReadiness(problem = ''): Promise<void> {
  readUnits();
  readFinder();
  showReady();
  offerCheck(!checked);
  $('home-check-progress').hidden = true;
  const status = $('home-check-status');
  status.textContent = problem;
  status.classList.toggle('failed', Boolean(problem));

  const offline = await readOfflineState(modelFiles());
  const kept = offline === 'ready' && (await storedKept());
  if (checking) return;
  setSpec('home-offline', OFFLINE[offline].state, OFFLINE[offline].text());
  setNote('home-offline', offline === 'ready' ? keptNote(kept) : '');
  offerCheck(!checked || offline === 'not-ready');
  if (!shown || failed) return;
  // Without a controlling worker, the download stores nothing and would start again on each visit.
  if (offline === 'not-ready' && navigator.serviceWorker?.controller) void runSteps('download');
  // A check that ran on a busy or hot GPU would otherwise hold every set on the CPU.
  else if (offline === 'ready' && !timed) void runSteps('speed');
}

/** What may undo a ready phone: nothing once the browser keeps the files, else a full phone. */
function keptNote(kept: boolean): string {
  if (kept) return '';
  return runsAsApp() || installed ? t('home.mayClear') : t('home.mayClearInstall');
}

/**
 * Runs the steps of `kind`, and lists them unless it is the speed test, which the device's row shows. Only the check
 * asks the browser to keep the files, because Firefox puts that request to the person, and the check is the run that
 * they started.
 */
async function runSteps(kind: Run): Promise<void> {
  const steps = RUN_STEPS[kind];
  const listed = kind !== 'speed';
  const progress = $<HTMLProgressElement>('home-check-progress');
  const status = $('home-check-status');
  checking = new AbortController();
  running = kind;
  showReady();
  const { signal } = checking;
  $('home-check').hidden = true;
  $('home-recheck').hidden = true;
  progress.max = steps.length;
  progress.value = 0;
  progress.hidden = !listed;
  status.classList.remove('failed');
  let problem = '';
  try {
    await preload(
      steps,
      (index, name) => {
        progress.value = index;
        if (listed) status.textContent = t('home.step')(index + 1, steps.length, name);
      },
      signal,
    );
    timed ||= kind !== 'download';
    if (listed) {
      progress.value = steps.length;
      status.textContent = t('home.storing');
      if ((await confirmDownload(modelFiles())) === 'not-ready') problem = t('home.notKept');
      else if (kind === 'check') await keepStored();
    }
  } catch (err) {
    if (!signal.aborted) {
      const why = err instanceof Error ? err.message : String(err);
      problem = t('home.stopped')(why);
    }
  } finally {
    checking = null;
  }
  failed ||= Boolean(problem);
  await showReadiness(problem);
}

/**
 * Whether the check that the person started runs, which a reload would stop. A reload loses nothing of a run that
 * the home view starts by itself, as the next page starts it again from the files already cached.
 */
export function checkRunning(): boolean {
  return checking !== null && running === 'check';
}

let demo: (on: boolean) => void = () => {};

/** Tells the home view that it shows, or that another view took its place. */
export function homeShown(visible: boolean): void {
  shown = visible;
  demo(shown);
  if (shown) {
    showLastSet();
    void showReadiness();
  } else {
    checking?.abort();
    $<HTMLDialogElement>('home-how-to-player').close();
  }
}

export function bindHome(start: { live: () => void; recording: (file: File) => void }): void {
  demo = playDemo($<SVGSVGElement>('home-demo'));
  $<HTMLAnchorElement>('link-contact').href = LINKS.contact;
  $<HTMLAnchorElement>('link-github').href = LINKS.github;
  $<HTMLAnchorElement>('link-hugging-face').href = LINKS.huggingFace;

  const live = $<HTMLButtonElement>('home-live');
  const blocked = cameraBlocker();
  if (blocked) {
    live.disabled = true;
    $('home-blocked').textContent = blocked;
    $('home-blocked').hidden = false;
  }
  live.addEventListener('click', start.live);
  void readCamera();

  const file = $<HTMLInputElement>('home-file');
  file.addEventListener('change', () => {
    const picked = file.files?.[0];
    // Cleared, so the same video can be picked again straight after.
    file.value = '';
    if (picked) start.recording(picked);
  });

  const player = $<HTMLDialogElement>('home-how-to-player');
  const video = player.querySelector('video')!;
  video.src = HOW_TO.path;
  $('home-how-to-length').textContent = HOW_TO.length;
  $('home-how-to').addEventListener('click', () => {
    player.showModal();
    void video.play();
  });
  $('home-how-to-close').addEventListener('click', () => player.close());
  player.addEventListener('close', () => video.pause());

  $('home-check').addEventListener('click', () => void runSteps('check'));
  $('home-recheck').addEventListener('click', () => void runSteps('check'));
  navigator.serviceWorker?.addEventListener('controllerchange', () => void showReadiness());

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    offer = e as InstallOffer;
    showInstalled();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    offer = null;
    showInstalled();
    // An installed app is what Chrome keeps the files for, so the request goes again now.
    void keepStored().then(() => showReadiness());
  });
  showInstalled();

  let installedVersion: string | null = null;
  const showVersion = () =>
    ($('home-version').textContent = installedVersion ? t('home.version')(installedVersion) : '');
  watchVersion((version) => {
    installedVersion = version;
    showVersion();
  });

  onLanguage(() => {
    showLastSet();
    void showReadiness();
    showInstalled();
    showVersion();
    const blocked = cameraBlocker();
    if (blocked) $('home-blocked').textContent = blocked;
  });
}
