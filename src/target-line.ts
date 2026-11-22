/**
 * Placing the target on a video viewport: a plate box the judge moves and
 * sizes, or the two lines and the spot along them where the ball hits.
 *
 * The canvas ignores pointers, so the drag is bound to the viewport and
 * measured against the video's painted area, which object-fit: contain
 * letterboxes inside it. A grab on a plate moves it, and on its lower right
 * corner sizes it; with no plate, a grab near a line drags the line. A tap
 * elsewhere places a plate where it lands while the judge is still choosing
 * the target; once the set runs, see `tapPlaces`.
 */
import type { Target } from './ball';
import { grabPlate, type PlateGrab } from './placement';
import type { Rect } from './reach';
import type { FrameRect, Session } from './session';
import type { Point } from './types';

/** How near a grab must land to a plate, or to its corner, to take it, in CSS pixels: about a fingertip. */
const GRAB_PX = 24;
/** The smallest a plate may be sized, in frame units. */
const MIN_PLATE = 0.015;

/**
 * Where a pointer landed on the painted frame, in fractions of it, or null
 * when it landed beside the picture.
 *
 * `object-fit: contain` leaves a band on two sides, and a portrait clip in a
 * landscape viewport leaves more band than picture. A touch on the band names
 * no point on the wall, so a caller must not read one out of it.
 */
export function pointOnFrame(rect: FrameRect, clientX: number, clientY: number): Point | null {
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  return x < 0 || x > 1 || y < 0 || y > 1 ? null : { x, y };
}

/**
 * True when a tap away from the target places it where it landed.
 *
 * Until the set starts the judge is placing the target, and a tap is how a
 * mark the finder did not offer gets placed. Once the set runs, a stray touch
 * on the preview moves nothing, unless the target was never placed here or a
 * search came back with nothing to tap.
 */
export function tapPlaces({
  armed,
  placed,
  tapToPlace,
}: Pick<Session, 'armed' | 'placed' | 'tapToPlace'>): boolean {
  return !armed || !placed || tapToPlace;
}

type Drag =
  | { id: number; kind: 'line'; which: Target }
  | { id: number; kind: PlateGrab['part']; index: number; from: Point; plate: Rect };

export function bindTargetDrag(viewport: HTMLElement, session: Session): void {
  let drag: Drag | null = null;

  /**
   * The pointer on the picture in fractions of it, and in frame units, where
   * y is the same and x is scaled by the aspect; and a fingertip's reach in
   * frame units, which grows as the picture shows smaller.
   */
  const pointAt = (e: PointerEvent): { at: Point; unit: Point; reach: number } | null => {
    const r = session.frameRect();
    const at = r ? pointOnFrame(r, e.clientX, e.clientY) : null;
    return r && at
      ? { at, unit: { x: (at.x * r.width) / r.height, y: at.y }, reach: GRAB_PX / r.height }
      : null;
  };

  viewport.addEventListener('pointerdown', (e) => {
    // The prompt veils the last frame a stopped set left, and a tap on it is for the prompt.
    if (
      session.linesLocked ||
      !session.ballCheck ||
      (e.target instanceof Element && e.target.closest('button, .prompt'))
    )
      return;
    const point = pointAt(e);
    if (point === null) return;
    const { at, unit, reach } = point;
    if (!session.board.plates.length) {
      const lines = session.target.lines;
      const upper = lines.upper ?? 0;
      const lower = lines.lower ?? 1;
      const which: Target = Math.abs(at.y - upper) <= Math.abs(at.y - lower) ? 'upper' : 'lower';
      if (Math.abs(at.y - (which === 'upper' ? upper : lower)) <= 0.08) {
        drag = { id: e.pointerId, kind: 'line', which };
        viewport.setPointerCapture(e.pointerId);
        return;
      }
    }
    const grab = grabPlate(session.shownPlates(), unit, reach);
    if (!grab) {
      if (!tapPlaces(session)) return;
      session.placeAt(at.y, at.x);
    }
    const index = grab?.index ?? 0;
    const plate = session.shownPlates()[index];
    if (!plate) return;
    drag = { id: e.pointerId, kind: grab?.part ?? 'move', index, from: unit, plate };
    viewport.setPointerCapture(e.pointerId);
  });

  viewport.addEventListener('pointermove', (e) => {
    if (drag?.id !== e.pointerId) return;
    const point = pointAt(e);
    if (point === null) return;
    if (drag.kind === 'line') {
      session.setTarget({ which: drag.which, line: point.at.y, x: point.at.x });
      return;
    }
    const { plate, from } = drag;
    const [dx, dy] = [point.unit.x - from.x, point.unit.y - from.y];
    const next =
      drag.kind === 'move'
        ? { ...plate, x: plate.x + dx, y: plate.y + dy }
        : { ...plate, w: Math.max(MIN_PLATE, plate.w + dx), h: Math.max(MIN_PLATE, plate.h + dy) };
    const index = session.setPlate(drag.index, next);
    // Passing the other plate of a pair reorders them, and the drag keeps its plate.
    if (index !== drag.index) drag = { ...drag, index, plate: next, from: point.unit };
  });

  const end = (e: PointerEvent) => {
    if (drag?.id !== e.pointerId) return;
    const ended = drag;
    drag = null;
    session.placed = true;
    if (ended.kind === 'line') {
      session.setTarget({ which: ended.which, line: session.target.lines[ended.which] ?? undefined }, true);
      return;
    }
    const plate = session.shownPlates()[ended.index];
    if (plate) session.setPlate(ended.index, plate, true);
  };
  viewport.addEventListener('pointerup', end);
  viewport.addEventListener('pointercancel', end);
}
