/**
 * One set on the board, fed with the native pipeline's frames: the repository's shared board, with the looks the
 * pipeline runs and what the line under the picture says. React-free, so a recording and the camera share it.
 */
import type { Look, LookWindow, PoseFrame } from 'wallball-vision';
import { Board, DEPTH, MIN_SCORE, REACH, storedRequired, storeRequired, t, type Landmark, type LookTicket, type Tally, type Target, type Verdict } from './core';
import { BALL_MODEL, boxesOf } from './detect';
import { trackingLost } from './sound';

const VALUES_PER_LANDMARK = 4;

/** The pipeline's flat landmarks as the judge's points, or null for no athlete. */
export function landmarksOf(values: number[]): Landmark[] | null {
  if (values.length === 0) return null;
  const points: Landmark[] = [];
  for (let i = 0; i < values.length; i += VALUES_PER_LANDMARK) {
    points.push({ x: values[i], y: values[i + 1], z: values[i + 2], visibility: values[i + 3] });
  }
  return points;
}

/** The looks a frame asks the pipeline for: whether the next frames start one, and the part of the frame it reads. */
export interface LookAsk {
  wanted: boolean;
  window: LookWindow | undefined;
}

export class PipelineBoard extends Board {
  armed = false;
  /** This set's verdicts; the tally holds the board's count across sets. */
  verdicts: Verdict[] = [];
  /** The looks the judge asked for, by the index of the frame that started each. */
  #tickets = new Map<number, LookTicket>();

  /** `ballCheck` says whether the ball is judged: the setting is on and a ball model runs. Verdicts count on `tally`. */
  constructor(
    readonly ballCheck: boolean,
    readonly tally: Tally,
  ) {
    super({
      depth: DEPTH,
      ball: { bite: REACH.bite },
      onVerdict: (verdict, times) => {
        tally.judged(verdict, times);
        return tally.count;
      },
    });
    super.setRequired(storedRequired());
  }

  override setRequired(which: Target): void {
    super.setRequired(which);
    storeRequired(which);
  }

  get placed(): boolean {
    return this.targetX !== null;
  }

  /** What the line under the picture says while judging. */
  get mode(): string {
    if (!this.armed) return t('board.notCounting');
    if (!this.ballCheck) return t('board.depthOnly');
    return this.singleTarget ? t('board.judgingTarget') : t('board.judging')(this.required === 'lower');
  }

  /** Judges one frame of the pipeline, and says whether the next frames should start looks for the ball, and where. */
  frame(frame: PoseFrame): LookAsk {
    // Looks of earlier frames answered before this frame, as a detection answers between two frames on the board.
    for (const look of frame.looks) if (look.frameIndex < frame.index) this.#answer(look, frame);
    const judged = this.step({
      tMs: frame.tMs,
      width: frame.width,
      height: frame.height,
      landmarks: landmarksOf(frame.landmarks),
      armed: this.armed,
      ballCheck: this.ballCheck,
      windowSide: BALL_MODEL.input,
    });
    if (judged.event?.type === 'abort') trackingLost();
    if (judged.look) {
      if (frame.lookStarted) this.#tickets.set(frame.index, judged.look);
      else this.judge.abandon(judged.look);
    }
    for (const look of frame.looks) if (look.frameIndex === frame.index) this.#answer(look, frame);
    if (judged.verdict) this.verdicts.push(judged.verdict);
    return {
      wanted: this.ballCheck && this.judge.target.detecting,
      window: this.lookWindow(frame.width, frame.height, BALL_MODEL.input) ?? undefined,
    };
  }

  /** Ends the set: a throw still in the air is judged as the PWA's board judges it when the set stops. */
  override end(): Verdict | null {
    const verdict = super.end();
    if (verdict) this.verdicts.push(verdict);
    this.#tickets.clear();
    return verdict;
  }

  /** Hands a finished look to the ticket of its frame; a look no ticket asked for judges nothing. */
  #answer(look: Look, frame: PoseFrame): void {
    const ticket = this.#tickets.get(look.frameIndex);
    if (!ticket) return;
    this.#tickets.delete(look.frameIndex);
    // Read with the window the pipeline drew, which the window on the ticket equals unless the target moved between.
    this.answer(ticket, boxesOf(look.rows, look.count, BALL_MODEL, frame.width, frame.height, MIN_SCORE, 'ball', look.window));
  }
}
