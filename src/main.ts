/**
 * The app's page: the home view, the judge board and the settings.
 *
 * The board's code, with the pose and detection libraries, loads when the
 * board is first wanted, or once the home view is idle, so the home view
 * paints without it.
 */
import { registerSW } from 'virtual:pwa-register';
import { unlockAudio } from './audio';
import { bindDesktopHint } from './desktop-site';
import { bindHome, checkRunning, homeShown } from './home';
import { translatePage } from './i18n';
import { $ } from './dom';
import { bindSettings } from './settings-view';
import { watchVersion } from './version';
import { go, watchViews } from './views';

translatePage();
document.documentElement.classList.remove('translating');

let registration: ServiceWorkerRegistration | undefined;
let reloadDue = false;

/**
 * Moves the page to a new build once a reload loses nothing: on the home view with no device check running, or on
 * the settings. The board never reloads in place, so a set and its video keep their build. Until then the new build
 * waits in its service worker, and the old one serves the page whole.
 */
function takeNewBuild(): void {
  if (location.hash === '#judge' || checkRunning()) return;
  if (reloadDue) location.reload();
  else if (registration?.waiting) void releaseNewBuild();
}

const releaseNewBuild = registerSW({
  immediate: true,
  onRegisteredSW: (_url, registered) => {
    registration = registered;
  },
  onNeedRefresh: takeNewBuild,
  // The page reloads by its controller rule below. The plugin's own rule misses a page that had no worker at first.
  onNeedReload: () => {},
});

let controlled = Boolean(navigator.serviceWorker?.controller);
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  // A page with no worker yet runs the build the server holds, which its first worker brings too. Another page of the
  // app may release a new build while this one runs a set, so the reload still waits for takeNewBuild.
  if (controlled) {
    reloadDue = true;
    takeNewBuild();
  }
  controlled = true;
});

type Board = typeof import('./judge');

let loading: Promise<Board> | null = null;

const RELOADED_KEY = 'reloadedForBuild';

/**
 * The board's module, loaded once.
 *
 * A page opened before a deploy asks for a chunk the server no longer holds,
 * and the new service worker has dropped it too. One reload fetches the
 * build the server holds now; a second failure is a real one and stays an error.
 */
function loadBoard(): Promise<Board> {
  loading ??= import('./judge').then(
    (module) => {
      sessionStorage.removeItem(RELOADED_KEY);
      return module;
    },
    (err: unknown) => {
      loading = null;
      if (!sessionStorage.getItem(RELOADED_KEY)) {
        sessionStorage.setItem(RELOADED_KEY, '1');
        location.reload();
      }
      throw err;
    },
  );
  return loading;
}

/**
 * Opens the board and runs `begin` on it, unless the person has left the
 * board by the time its code arrives: a camera started then would run unseen.
 */
function openBoard(begin: (b: Board) => Promise<void>): void {
  // Inside the tap: the board starts after an import, which no longer counts as one.
  unlockAudio();
  go('judge');
  void loadBoard().then((b) => (location.hash === '#judge' ? begin(b) : undefined));
}

bindHome({
  live: () => openBoard((b) => b.startCamera()),
  recording: (file) => openBoard((b) => b.playFile(file)),
});
bindSettings();
bindDesktopHint();
watchVersion((version) => {
  for (const label of document.querySelectorAll('.bar .version'))
    label.textContent = version ? `v${version}` : '';
});

watchViews(async (view, from) => {
  // The settings offer the way back to the board only when they were opened from it, as the Android app's do.
  if (view === 'settings') $('settings-board').hidden = from !== 'judge';
  // The camera runs for the board alone.
  if (from === 'judge' && loading) await (await loading.catch(() => null))?.stopSet();
  if (view === 'judge') void loadBoard();
  homeShown(view === 'home');
  takeNewBuild();
});

// Ready before the first tap on most visits, and after the home view has painted.
if ('requestIdleCallback' in window) requestIdleCallback(() => void loadBoard(), { timeout: 4000 });
else setTimeout(() => void loadBoard(), 2000);
