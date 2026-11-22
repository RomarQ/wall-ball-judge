/**
 * The app's colours and typeface for drawing on a canvas.
 *
 * They are set once, as custom properties in src/styles/base.css, and read
 * from there the first time a canvas asks, so the overlay and the pages
 * cannot drift apart.
 */

export interface Palette {
  chalk: string;
  rep: string;
  norep: string;
  tape: string;
  graphite: string;
  /** The page's text face, as a canvas font family list. */
  face: string;
}

let read: Palette | null = null;

export function palette(): Palette {
  if (read) return read;
  const style = getComputedStyle(document.documentElement);
  const value = (name: string) => style.getPropertyValue(name).trim() || 'white';
  read = {
    chalk: value('--chalk'),
    rep: value('--rep'),
    norep: value('--norep'),
    tape: value('--tape'),
    graphite: value('--graphite'),
    face: style.getPropertyValue('--face').trim() || 'sans-serif',
  };
  return read;
}

/** Sets a canvas font in the page's text face. */
export function setFont(ctx: CanvasRenderingContext2D, weight: number, size: number): void {
  ctx.font = `${weight} ${size}px ${palette().face}`;
}
