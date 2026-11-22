/**
 * The sets the phone keeps: each finished live set's record in a file of the app's own, and the camera's video of it in
 * the phone's Movies folder. A judged video is never kept as a set. What a record holds is the repository's
 * src/set-record.ts.
 */
import { wallballVision } from 'wallball-vision';
import { parseHistory, SetRecorder, type SetHistory, type SetRecord, type Tally, type TallyChange } from './core';
import { SetVideo } from './video';

const FILE = 'sets.json';
const SAVE_SETS_KEY = 'saveSets';
const SAVE_VIDEO_KEY = 'saveSetsVideo';

/** Whether finished sets are kept, the setting; off until it is turned on. */
export function saveSetsOn(): boolean {
  return localStorage.getItem(SAVE_SETS_KEY) === 'true';
}

export function setSaveSets(on: boolean): void {
  localStorage.setItem(SAVE_SETS_KEY, on ? 'true' : 'false');
}

/** Whether a kept live set also keeps the camera's video, the setting; off until it is turned on. */
export function saveVideoOn(): boolean {
  return localStorage.getItem(SAVE_VIDEO_KEY) === 'true';
}

export function setSaveVideo(on: boolean): void {
  localStorage.setItem(SAVE_VIDEO_KEY, on ? 'true' : 'false');
}

/** The kept sets, the newest first, or 'unreadable' when the file holds no history this app reads. */
export function keptSets(): SetHistory | 'unreadable' {
  return parseHistory(wallballVision.readKeptText(FILE));
}

/** Changes the kept sets, unless the file cannot be read: the sets it holds are not written over. */
function changeSets(change: (sets: SetRecord[]) => SetRecord[]): boolean {
  const history = keptSets();
  if (history === 'unreadable') {
    console.log('SETS unreadable, not written');
    return false;
  }
  wallballVision.keepText(FILE, JSON.stringify({ ...history, sets: change(history.sets) }));
  return true;
}

/** Deletes a kept set and the video the app recorded of it. */
export function deleteSet(record: SetRecord): void {
  if (record.video) wallballVision.deleteVideo(record.video);
  changeSets((sets) => sets.filter((set) => set.id !== record.id));
}

/** A video's name from the set's start: the date and time, so the phone's videos sort by when the sets ran. */
function videoTitle(startedAt: number): string {
  const at = new Date(startedAt);
  const two = (n: number) => String(n).padStart(2, '0');
  return `Wall Ball set ${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}-${two(at.getMinutes())}-${two(at.getSeconds())}`;
}

/** What `SetKeeper.end` gives back: when the camera may close, and the record once it is kept. */
export interface SetEnd {
  /** Settles once the recording has stopped; the camera feeds it until then. */
  recorded: Promise<void>;
  /** The kept record, or null for a set that counted nothing or is not kept. */
  kept: Promise<SetRecord | null>;
}

/** One live set from its start to its end: the changes of the board's tally, and the camera's video. */
export class SetKeeper {
  readonly #recorder: SetRecorder;
  readonly #stopWatching: () => void;
  readonly #video: Promise<SetVideo | null> | null;
  #end: SetEnd | null = null;

  /** `keep` is false while Save sets is off, and for a set an adb launch key started, which is no set of the person's. */
  constructor(
    tally: Tally,
    private readonly keep: boolean,
  ) {
    this.#recorder = new SetRecorder(Date.now());
    this.#stopWatching = tally.watch((change) => this.#changed(change));
    this.#video = keep && saveVideoOn() ? SetVideo.start() : null;
  }

  /** Ends the set, once: stops the recording, then keeps the record, with the video, when the set counted anything. */
  end(): SetEnd {
    if (this.#end) return this.#end;
    this.#stopWatching();
    const endedAt = Date.now();
    const path = (async () => {
      const recording = await this.#video;
      return recording ? recording.stop() : null;
    })();
    const recorded = path.then(() => undefined);
    const kept = path.then((video) => this.#keep(endedAt, video));
    this.#end = { recorded, kept };
    return this.#end;
  }

  async #keep(endedAt: number, path: string | null): Promise<SetRecord | null> {
    const record = this.#recorder.finish(endedAt, null);
    if (!record || !this.keep) {
      if (path) wallballVision.dropVideo(path);
      return null;
    }
    if (path) {
      record.video = (await wallballVision.keepVideo(path, videoTitle(record.startedAt))) || null;
      if (!record.video) wallballVision.dropVideo(path);
    }
    if (!changeSets((sets) => [record, ...sets])) return null;
    console.log(`KEPT ${JSON.stringify({ reps: record.reps, targetFaults: record.targetFaults, moveFaults: record.moveFaults, timeMs: record.timeMs, video: record.video })}`);
    return record;
  }

  #changed(change: TallyChange): void {
    if (change.cleared) this.#recorder.reset();
    else if (change.event) {
      this.#recorder.add({
        kind: change.event,
        at: change.at,
        startAt: change.startAt,
        plate: change.plate,
        reason: change.banner?.reason ?? null,
      });
    }
  }
}
