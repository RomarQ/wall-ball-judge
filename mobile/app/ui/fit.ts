/** Where a frame sits in a view: scaled to fit whole and centred, as the PWA's object-fit: contain. */
export interface Fit {
  /** The painted frame's top-left corner and scale, in view points. */
  left: number;
  top: number;
  scale: number;
  /** The frame's own size, in pixels. */
  width: number;
  height: number;
  /** Shown mirrored, as the front camera is: the frame's x runs right to left on screen. */
  mirrored: boolean;
}

export function fitFrame(viewWidth: number, viewHeight: number, width: number, height: number, mirrored: boolean): Fit {
  const scale = Math.min(viewWidth / width, viewHeight / height) || 0;
  return { left: (viewWidth - width * scale) / 2, top: (viewHeight - height * scale) / 2, scale, width, height, mirrored };
}

/** A point in frame pixels, in view points. */
export function toView(fit: Fit, x: number, y: number): { x: number; y: number } {
  const across = fit.mirrored ? fit.width - x : x;
  return { x: fit.left + across * fit.scale, y: fit.top + y * fit.scale };
}

/** A box in frame pixels, in view points. */
export function boxToView(fit: Fit, box: { x: number; y: number; w: number; h: number }) {
  const corner = toView(fit, fit.mirrored ? box.x + box.w : box.x, box.y);
  return { left: corner.x, top: corner.y, width: box.w * fit.scale, height: box.h * fit.scale };
}

/** A tap in view points, as fractions of the frame as judged, or null when it lands off the frame. */
export function fromView(fit: Fit, x: number, y: number): { x: number; y: number } | null {
  if (!fit.scale) return null;
  const across = (x - fit.left) / fit.scale / fit.width;
  const down = (y - fit.top) / fit.scale / fit.height;
  if (across < 0 || across > 1 || down < 0 || down > 1) return null;
  return { x: fit.mirrored ? 1 - across : across, y: down };
}
