/** Feeding the board: a recording frame by frame, and the options the pipeline judges with. */
import { wallballVision, type JudgeOptions } from 'wallball-vision';
import { ballCheckOn, CUT_WIDTH, JUDGING_DETECTION, MIN_SCORE, poseConfidence } from './core';
import type { LookAsk, PipelineBoard } from './board';

/** The longest a recording that runs late is judged without a return to the event loop, so the screen keeps updating. */
const MAX_BUSY_MS = 50;

/**
 * How the pipeline judges: the own pose on the CPU, and the ball model at `ballInput` pixels on `ballUnit` when the
 * settings check the ball. The judging pose finds the athlete at the PWA's judging figure and tracks them at the
 * settings' confidence.
 */
export function judgeOptions(ballUnit: string, ballInput: number): JudgeOptions {
  return {
    pose: 'OWN_CPU',
    ball: { unit: ballCheckOn() ? ballUnit : 'off', input: ballInput, minScore: MIN_SCORE, cutWidth: CUT_WIDTH },
    detection: JUDGING_DETECTION,
    presence: poseConfidence(),
    tracking: poseConfidence(),
  };
}

/**
 * Judges every frame of a recording on `board` at the recording's own speed, as the PWA plays it, and ends the set at
 * its last frame or when `stopped` says so. A phone too slow for that speed still judges every frame, later.
 * `onProgress` hears after each frame how many frames are done of how many.
 */
export async function judgeRecording(
  board: PipelineBoard,
  uri: string,
  options: JudgeOptions,
  onProgress: (done: number, total: number) => void,
  stopped: () => boolean,
): Promise<void> {
  const info = wallballVision.openClip(uri, options);
  let done = 0;
  let ask: LookAsk = { wanted: false, window: undefined };
  let clipStartMs: number | null = null;
  let lastYieldMs = wallballVision.nowMs();
  try {
    for (;;) {
      const frame = wallballVision.nextPoseFrame(ask.wanted, ask.window);
      if (!frame) {
        board.end();
        onProgress(info.frames, info.frames);
        return;
      }
      ask = board.frame(frame);
      done += 1;
      onProgress(done, info.frames);
      const now = wallballVision.nowMs();
      clipStartMs ??= now - frame.tMs;
      const earlyMs = clipStartMs + frame.tMs - now;
      if (earlyMs > 0 || now - lastYieldMs >= MAX_BUSY_MS) {
        await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, earlyMs)));
        lastYieldMs = wallballVision.nowMs();
        if (stopped()) {
          board.end();
          return;
        }
      }
    }
  } finally {
    wallballVision.closeClip();
  }
}
