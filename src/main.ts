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
import { bindHome, homeShown } from './home';
import { translatePage } from './i18n';
import { $ } from './dom';
import { bindSettings } from './settings-view';
import { go, watchViews } from './views';

translatePage();
document.documentElement.classList.remove('translating');
registerSW({ immediate: true });

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

watchViews(async (view, from) => {
  // The settings offer the way back to the board only when they were opened from it, as the Android app's do.
  if (view === 'settings') $('settings-board').hidden = from !== 'judge';
  // The camera runs for the board alone.
  if (from === 'judge' && loading) await (await loading.catch(() => null))?.stopSet();
  if (view === 'judge') void loadBoard();
  homeShown(view === 'home');
});

// Ready before the first tap on most visits, and after the home view has painted.
if ('requestIdleCallback' in window) requestIdleCallback(() => void loadBoard(), { timeout: 4000 });
else setTimeout(() => void loadBoard(), 2000);
