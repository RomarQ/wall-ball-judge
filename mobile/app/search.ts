/** The target search on the phone: the PWA's search rules over looks of the native search model. */
import { wallballVision, type TargetLook } from 'wallball-vision';
import { athleteFrom, CUT_WIDTH, DEPTH, FINDER, readLook, searchClip, SEARCH_CONFIDENCE, type Landmark, type Seen } from './core';
import { boxesOf, SEARCH_MODEL } from './detect';
import { landmarksOf } from './board';

/** A search's outcome: the look to place from, its best plate score, and the frame it was taken of. */
export interface Searched {
  seen: Seen;
  best: number;
  frame: TargetLook;
}

function seenOf(look: TargetLook, landmarks: Landmark[] | null): { seen: Seen; best: number } {
  const boxes = boxesOf(look.found.rows, look.found.count, SEARCH_MODEL, look.width, look.height, FINDER.lookScore, 'target');
  const { look: plates, best } = readLook(boxes, look.height, FINDER);
  return { seen: { look: plates, athlete: athleteFrom(landmarks, look.width, look.height, DEPTH.visibilityMin) }, best };
}

/** Searches a recording's frames at the PWA's search seconds, each with the still pose. */
export async function searchRecording(source: string, durationMs: number): Promise<Searched> {
  const frames = new Map<number, TargetLook>();
  const found = await searchClip(
    durationMs / 1000,
    async (at) => {
      const look = await wallballVision.searchClipAt(source, at, CUT_WIDTH, FINDER.lookScore, SEARCH_CONFIDENCE);
      frames.set(at, look);
      return seenOf(look, landmarksOf(look.landmarks));
    },
    FINDER,
  );
  const frame = frames.get(found.at) ?? [...frames.values()][0];
  if (!frame) throw new Error('the search read no frame of the recording');
  return { seen: found.seen, best: found.best, frame };
}

/** Searches the camera's next frame, with the judging pose's last landmarks placing the athlete. */
export async function searchCamera(landmarks: Landmark[] | null): Promise<Searched> {
  const frame = await wallballVision.searchCamera(CUT_WIDTH, FINDER.lookScore);
  const { seen, best } = seenOf(frame, landmarks);
  return { seen, best, frame };
}
