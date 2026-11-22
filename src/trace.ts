/**
 * The summary of one set for the home view: the pose model with its delegate, and the mean frame rate. The last
 * summary stays in localStorage, so the home view still shows it after the app closes.
 */
import type { Session } from './session';

const KEY = 'lastSet';

/** The last set as stored. Phones keep it across updates, so a change to this shape must still read the stored ones. */
export interface SetSummary {
  /** The pose model and its delegate, as `quality/delegate`. */
  pose: string | null;
  /** The mean frame rate over the seconds of judging. */
  fps: { mean: number } | null;
}

/** Collects the frame rate from the start of a set until `end`. */
export class SetTrace {
  readonly #fps = { sum: 0, seconds: 0 };

  /** Counts one second of judging at `fps`. */
  sample(fps: number): void {
    this.#fps.sum += fps;
    this.#fps.seconds += 1;
  }

  /** The summary of the set, with the pose model that `session` still holds once it stops. */
  end(session: Session): SetSummary {
    const { pose } = session;
    const { sum, seconds } = this.#fps;
    return {
      pose: pose ? `${pose.quality}/${pose.delegate}` : null,
      fps: seconds ? { mean: Math.round(sum / seconds) } : null,
    };
  }
}

export function saveLastSet(summary: SetSummary): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(summary));
  } catch {
    // Storage may be full or blocked; the home view then shows the set before.
  }
}

/** The summary of the last set the board ran on this phone, or null. */
export function lastSet(): SetSummary | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') as SetSummary | null;
  } catch {
    return null;
  }
}
