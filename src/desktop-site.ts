/**
 * The hint that a phone's browser draws the app as a desktop site.
 *
 * A browser's "Desktop site" setting ignores the page's `width=device-width`: it lays the page out about 980 px
 * wide and shrinks it to fit the screen, so every button shows at about 40% of its size. A page cannot turn the
 * setting off, so the hint asks the person to.
 */
import { $ } from './dom';

/** A layout this many times wider than the screen is a desktop layout, not a rounding of the screen's width. */
const SHRUNK = 1.2;

export interface Layout {
  /** The page's layout width in CSS pixels, `innerWidth`. */
  width: number;
  /** The screen's sides in CSS pixels. iOS keeps them as in portrait however the phone is turned. */
  screen: { width: number; height: number };
  landscape: boolean;
  /** Whether the main pointer is a finger. */
  touch: boolean;
}

/** How many times the browser shrinks the page to fit a touch screen, or null when it lays the page out at the screen's width. */
export function desktopShrink({ width, screen, landscape, touch }: Layout): number | null {
  if (!touch) return null;
  const across = landscape ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
  const shrink = width / across;
  return shrink > SHRUNK ? shrink : null;
}

let closed = false;

function showHint(): void {
  const shrink = desktopShrink({
    width: innerWidth,
    screen,
    landscape: matchMedia('(orientation: landscape)').matches,
    touch: matchMedia('(pointer: coarse)').matches,
  });
  const hint = $('desktop-hint');
  hint.hidden = closed || shrink === null;
  // Zoomed by what the browser shrinks, so the hint shows at the size the phone gives the app.
  hint.style.zoom = String(shrink ?? 1);
}

/** Shows the hint while the browser draws the app as a desktop site, until the person closes it. */
export function bindDesktopHint(): void {
  $('desktop-hint-close').addEventListener('click', () => {
    closed = true;
    $('desktop-hint').hidden = true;
  });
  showHint();
  addEventListener('resize', showHint);
}
