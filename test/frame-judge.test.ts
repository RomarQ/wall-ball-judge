/**
 * The order in which FrameJudge takes a look and its answer, on a real set:
 * the committed excerpt brings the judge to the first throw, then each test
 * probes one rule from there.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULTS as DEPTH, LM, type DepthOptions } from '../src/depth';
import { FrameJudge, type FrameInput, type LookTicket } from '../src/frame-judge';
import { landmarksFrom, type LoggedTarget } from '../src/judge-log';
import { DEFAULTS as REACH } from '../src/reach';
import type { Box } from '../src/types';
import { readLog, replay } from './judge-replay';

const log = readLog('test/data/judge-excerpt.json.gz');

/** The target the board held on frame `i`: the last one logged up to it. */
function targetAt(i: number): LoggedTarget {
  for (let k = i; k >= 0; k -= 1) {
    const target = log.frames[k].target;
    if (target) return target;
  }
  throw new Error('no target logged');
}

function inputOf(i: number, change: Partial<FrameInput> = {}): FrameInput {
  const f = log.frames[i];
  const target = targetAt(i);
  return {
    tMs: f.tMs,
    width: f.w,
    height: f.h,
    landmarks: landmarksFrom(f.landmarks ? f.landmarks.map((v) => Math.fround(v)) : null),
    armed: f.armed,
    ballCheck: f.mode === 'target',
    x: target.x,
    plates: target.plates,
    windowSide: null,
    ...change,
  };
}

/** The frame on which the first throw begins: the squat leaves the bottom, driving the ball up. */
const opening = log.frames.findIndex(
  (f, i) => i > 0 && log.frames[i - 1].state === 'BOTTOM' && f.state === 'DRIVING',
);

/** A ball centred on the men's mark, as the frame of `ticket` placed it. */
function ballOnUpperMark(ticket: LookTicket): Box {
  const line = ticket.marks.find((m) => m.which === 'upper')!.line;
  const side = 40;
  return {
    x: ticket.x * ticket.width - side / 2,
    y: line * ticket.height - side / 2,
    w: side,
    h: side,
    score: 0.9,
    name: 'ball',
  };
}

describe('FrameJudge', () => {
  it('starts no look on the frame a throw begins, as the last frame left no throw to look for', () => {
    // A judge that asked after this frame's target update would look one frame early, on a state the board never had.
    const { judge } = replay(log, opening).board;
    expect(judge.frame(inputOf(opening)).look).toBeNull();
    expect(judge.frame(inputOf(opening + 1)).look).not.toBeNull();
  });

  it("judges a look's ball on the target as it stood when the look started", () => {
    // The board can move the target while a look is out; the answer belongs to the frame that asked.
    const { judge } = replay(log, opening + 1).board;
    const ticket = judge.frame(inputOf(opening + 1)).look!;
    judge.frame(inputOf(opening + 2, { x: 0.02, plates: [] }));
    Object.assign(judge.target.lines, { upper: 0.6, lower: 0.7 });
    expect(judge.resolve(ticket, [ballOnUpperMark(ticket)])?.struck).toBe('upper');
  });

  it('counts a hit on the frame right after its look answered', () => {
    // A sighting held for a later frame, or lost, would leave the throw open past the hit.
    const { judge } = replay(log, opening + 1).board;
    const ticket = judge.frame(inputOf(opening + 1)).look!;
    judge.resolve(ticket, [ballOnUpperMark(ticket)]);
    const verdict = judge.frame(inputOf(opening + 2)).verdict;
    expect(verdict).toMatchObject({ valid: true, target: 'upper', ballSeen: true });
  });

  it('looks again once a look that failed is given up', () => {
    // A judge that kept a failed look open would never look again, and every throw after would be a target fault.
    const { judge } = replay(log, opening + 1).board;
    const ticket = judge.frame(inputOf(opening + 1)).look!;
    judge.abandon(ticket);
    expect(judge.frame(inputOf(opening + 2)).look).not.toBeNull();
  });

  it('counts a squat whose knees the body hid on the way down, once the depth reads again at the bottom', () => {
    // From behind, a squat hides the knees. The athlete stays in the picture, so the judge must take the bottom's
    // readings at once rather than wait for the athlete to come back. The first squat sits in frames 70 to 110.
    const config = log.config as { depth: DepthOptions; ball: { bite: number } };
    const judge = new FrameJudge(config.depth, { bite: config.ball.bite });
    const kneesHidden = (i: number) => i >= 70 && i <= 92;
    const reps = [];
    for (let i = 0; i <= 110; i += 1) {
      const input = inputOf(i, { ballCheck: false });
      if (kneesHidden(i) && input.landmarks) {
        input.landmarks = input.landmarks.map((p, k) =>
          k === LM.LEFT_KNEE || k === LM.RIGHT_KNEE ? { ...p, visibility: 0.1 } : p,
        );
      }
      const { event } = judge.frame(input);
      if (event?.type === 'rep') reps.push(event);
    }
    expect(reps).toHaveLength(1);
    expect(reps[0].depthPass).toBe(true);
  });
});

describe('the window a look reads', () => {
  const frame = { width: 1080, height: 1920, windowSide: 320 };
  const judge = new FrameJudge(DEPTH, { bite: REACH.bite });
  Object.assign(judge.target.lines, { upper: 0.25, lower: 0.33 });
  const centre = (w: { x: number; y: number; w: number; h: number } | null) =>
    w && [Math.round(w.x + w.w / 2), Math.round(w.y + w.h / 2), w.w];

  it('is centred on the plates, in frame units, at the scale the detector was trained at', () => {
    const plates = [
      { x: 0.2, y: 0.1, w: 0.05, h: 0.04 },
      { x: 0.21, y: 0.18, w: 0.05, h: 0.04 },
    ];
    expect(centre(judge.lookWindow({ ...frame, x: 0.5, plates }))).toEqual([442, 307, 960]);
  });

  it('is centred on the marks on bare wall', () => {
    expect(centre(judge.lookWindow({ ...frame, x: 0.5, plates: [] }))).toEqual([540, 557, 960]);
  });

  it('is the whole picture when no window side is asked for', () => {
    expect(judge.lookWindow({ ...frame, x: 0.5, plates: [], windowSide: null })).toBeNull();
  });
});

describe('a pose standing on its head', () => {
  // Two frames of a set filmed from behind: one from a pose tracker that turned its crop over when it found the
  // athlete bent over the ball, and the bottom of one of the set's real squats.
  const frames = JSON.parse(readFileSync('test/data/pose-frames.json', 'utf8')) as Record<
    'upsideDown' | 'deepSquat',
    { w: number; h: number; landmarks: number[] }
  >;
  const judged = (name: keyof typeof frames) =>
    new FrameJudge(DEPTH, { bite: REACH.bite }).frame({
      tMs: 0,
      width: frames[name].w,
      height: frames[name].h,
      landmarks: landmarksFrom(frames[name].landmarks),
      armed: true,
      ballCheck: false,
      x: null,
      plates: [],
      windowSide: null,
    });

  it('reads no depth from it and asks for a fresh search, as it reads as a squat 100% below parallel', () => {
    const frame = judged('upsideDown');
    expect(frame.depth.ok).toBe(false);
    expect(frame.retrack).toBe(true);
  });

  it('keeps the bottom of a real squat seen from behind', () => {
    const frame = judged('deepSquat');
    expect(frame.depth.ok).toBe(true);
    expect(frame.retrack).toBe(false);
  });
});
