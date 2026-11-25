/**
 * The shared board's own rules: the verdict a set's end judges, the plates a tap adds and the lane a pair keeps, a
 * plate dragged past the other plate of its pair, a board with no target, the station the athlete's squat picks, the
 * division the first hit picks, and the part of the picture the pose may follow someone in.
 *
 * Run: npm test
 */
import { expect, it } from 'vitest';
import { Board } from '../src/board';
import { DEFAULTS, type DepthOptions } from '../src/depth';
import { landmarksFrom } from '../src/judge-log';
import { DEFAULTS as FINDER } from '../src/placement';
import type { Box, Landmark } from '../src/types';
import { readLog, replay } from './judge-replay';

it('counts a throw still in the air when the set ends, and shows its banner', () => {
  // A board that left the end's verdict to its caller would drop the set's last throw from the tally.
  const log = readLog('test/data/judge-excerpt.json.gz');
  const thrown = log.frames.findIndex(
    (f, i) => i > 0 && log.frames[i - 1].state === 'BOTTOM' && f.state === 'DRIVING',
  );
  const { board } = replay(log, thrown + 2);
  const tMs = log.frames[thrown + 2].tMs;
  const verdict = board.end(tMs);
  expect(verdict).not.toBeNull();
  expect(board.flash).toMatchObject({ valid: verdict!.valid, reason: verdict!.reason, until: tMs + 1200 });
});

it('gives a plate dragged above the other plate of its pair the higher index, so the drag keeps hold of it', () => {
  const board = new Board({ depth: DEFAULTS, ball: { bite: 0.5 }, onVerdict: () => 0 });
  board.width = 1280;
  board.height = 720;
  board.placeBoxes([
    { x: 600, y: 100, w: 60, h: 60 },
    { x: 600, y: 200, w: 60, h: 60 },
  ]);
  const lower = board.plates[1];
  const index = board.setPlate(1, { ...lower, y: 40 / 720 });
  expect([index, board.plates[0].y]).toEqual([0, 40 / 720]);
});

it("keeps a pair in one lane: a second plate added takes the first one's, a sideways drag takes both, and a resize neither", () => {
  // The hit rule judges both marks at one spot across, so a plate beside the other would be judged where none is drawn.
  const board = new Board({ depth: DEFAULTS, ball: { bite: 0.5 }, onVerdict: () => 0 });
  [board.width, board.height] = [1280, 720];
  const centre = (i: number) => board.plates[i].x + board.plates[i].w / 2;
  expect([board.addAt(0.5, 0.3), board.addAt(0.8, 0.45)]).toEqual([0, 1]);
  expect(centre(1)).toBeCloseTo(centre(0));
  board.setPlate(0, { ...board.plates[0], x: board.plates[0].x + 0.05 });
  expect(centre(1)).toBeCloseTo(centre(0));
  // A mirrored picture sizes a plate from its left edge in the frame, and the other plate must stay put.
  const other = board.plates[0].x;
  board.setPlate(1, { ...board.plates[1], x: board.plates[1].x - 0.02, w: board.plates[1].w + 0.02 });
  expect(board.plates[0].x).toBe(other);
  // A third plate has no mark to stand for, and the hit rule would never weigh it.
  expect([board.addAt(0.5, 0.6), board.plates.length]).toEqual([-1, 2]);
});

it('leaves nothing for the ball check to judge once the last plate is removed', () => {
  // Lines left behind would go on judging a target the picture no longer shows.
  const board = new Board({ depth: DEFAULTS, ball: { bite: 0.5 }, onVerdict: () => 0 });
  [board.width, board.height] = [1280, 720];
  board.addAt(0.5, 0.3);
  board.removePlate(0);
  expect([board.placed, board.judge.target.lines, board.targetX]).toEqual([
    false,
    { upper: null, lower: null },
    null,
  ]);
});

it('judges the squat alone while no target is placed, rather than calling each throw a target no-rep', () => {
  const log = readLog('test/data/judge-excerpt.json.gz');
  const verdicts = (ballCheck: boolean) => {
    const valid: boolean[] = [];
    const board = new Board({
      depth: (log.config as { depth: DepthOptions }).depth,
      ball: { bite: 0.1 },
      onVerdict: (verdict) => {
        valid.push(verdict.valid);
        return 0;
      },
    });
    for (const f of log.frames) {
      const landmarks = landmarksFrom(f.landmarks && f.landmarks.map((v) => Math.fround(v)));
      board.step({
        tMs: f.tMs,
        width: f.w,
        height: f.h,
        landmarks,
        armed: f.armed,
        ballCheck,
        windowSide: null,
      });
    }
    return valid;
  };
  const alone = verdicts(false);
  expect(alone.length).toBeGreaterThan(0);
  expect(verdicts(true)).toEqual(alone);
});

it('judges the throw after the squat at whose bottom the target is placed', () => {
  // The athlete's first squat picks the station at its bottom. A check that stopped following the squats while no
  // target was placed would miss the bottom, and with it the throw that follows.
  const log = readLog('test/data/judge-excerpt.json.gz');
  const bottom = log.frames.findIndex(
    (f, i) => f.state === 'BOTTOM' && log.frames[i + 1]?.state === 'DRIVING',
  );
  const board = new Board({
    depth: (log.config as { depth: DepthOptions }).depth,
    ball: { bite: 0.1 },
    onVerdict: () => 0,
  });
  log.frames.slice(0, bottom + 2).forEach((f, i) => {
    if (i === bottom + 1) board.placeBoxes([{ x: 519, y: 136, w: 141, h: 144 }]);
    const landmarks = landmarksFrom(f.landmarks && f.landmarks.map((v) => Math.fround(v)));
    board.step({
      tMs: f.tMs,
      width: f.w,
      height: f.h,
      landmarks,
      armed: f.armed,
      ballCheck: true,
      windowSide: null,
    });
  });
  expect([bottom > 0, board.judge.counter.state, board.judge.target.detecting]).toEqual([
    true,
    'DRIVING',
    true,
  ]);
});

it('judges each throw once when the target is placed while the throw is under way', () => {
  // A box added after a rep closed by its squat alone must not end that rep's throw as a target no-rep as well.
  const log = readLog('test/data/judge-excerpt.json.gz');
  const reps: number[] = [];
  const board = new Board({
    depth: (log.config as { depth: DepthOptions }).depth,
    ball: { bite: 0.1 },
    onVerdict: (verdict) => reps.push(verdict.rep.startMs),
  });
  let placedAt = -1;
  log.frames.forEach((f, i) => {
    const landmarks = landmarksFrom(f.landmarks && f.landmarks.map((v) => Math.fround(v)));
    const out = board.step({
      tMs: f.tMs,
      width: f.w,
      height: f.h,
      landmarks,
      armed: f.armed,
      ballCheck: true,
      windowSide: null,
    });
    if (placedAt < 0 && out.event?.type === 'rep') {
      board.placeBoxes([{ x: 519, y: 136, w: 141, h: 144 }]);
      placedAt = i;
    }
  });
  expect([placedAt > 0, reps.length > 1]).toEqual([true, true]);
  expect(new Set(reps).size).toBe(reps.length);
});

it('places the station the athlete squats under before the throw that follows', () => {
  // gym-raw-7a's search, in pixels of its 1080 x 1920 frame: two stations of two plates. The athlete throws at the
  // left one and stands nearer the right one's left edge than the left one's.
  const log = readLog('test/data/judge-excerpt.json.gz');
  const plate = ([x, y, w, h, score]: number[]): Box => ({ x, y, w, h, score, name: 'target' });
  const plates = [
    [527, 265, 130, 131, 0.973],
    [944, 386, 106, 117, 0.967],
    [933, 269, 114, 126, 0.962],
    [519, 136, 141, 144, 0.962],
  ].map(plate);
  let picked = 0;
  const board = new Board({
    depth: (log.config as { depth: DepthOptions }).depth,
    ball: { bite: 0.1 },
    onVerdict: () => 0,
    onPicked: () => (picked += 1),
  });
  [board.width, board.height] = [1080, 1920];
  const outcome = board.searched({ look: { plates, balls: [] }, athlete: null }, FINDER);
  let placedAtThrow = false;
  for (const f of log.frames) {
    const landmarks = landmarksFrom(f.landmarks && f.landmarks.map((v) => Math.fround(v)));
    const was = board.judge.counter.state;
    board.step({
      tMs: f.tMs,
      width: f.w,
      height: f.h,
      landmarks,
      armed: f.armed,
      ballCheck: false,
      windowSide: null,
    });
    if (was === 'BOTTOM' && board.judge.counter.state === 'DRIVING') {
      placedAtThrow = board.plates.length > 0;
      break;
    }
  }
  const own = [plates[3], plates[0]].map((p) => [p.x, p.y, p.w, p.h].map((v) => v / 1920));
  expect([outcome, placedAtThrow, picked]).toEqual(['squat', true, 1]);
  expect(board.plates.map((p) => [p.x, p.y, p.w, p.h])).toEqual(own);
  expect(board.candidates).toEqual([]);
});

it('counts a first throw at the lower mark as a rep when the first hit picks the division', () => {
  // gym-raw-7a's first throws strike the lower mark, the fourth the upper: under the upper target, three no-reps.
  const { valid, noRep, board } = replay(readLog('test/data/judge-excerpt.json.gz'), undefined, null);
  expect([valid, noRep, board.required]).toEqual([4, 0, 'lower']);
});

it("keeps the pose's view narrowed while the pose follows the athlete, and opens it when the target moves", () => {
  // Opened again for the athlete, the view would let the pose go back to the person it hid; kept after the target
  // moves, it would hide the athlete of the new target.
  const [w, h] = [1260, 1080];
  const person = (x: number, torso: number): Landmark[] =>
    Array.from({ length: 33 }, (_, i) => {
      const at: Record<number, [number, number]> = {
        11: [x - 0.2 * torso, 300],
        12: [x + 0.2 * torso, 300],
        23: [x - 0.15 * torso, 300 + torso],
        24: [x + 0.15 * torso, 300 + torso],
      };
      const [px, py] = at[i] ?? [x, 300];
      return { x: px / w, y: py / h, z: 0, visibility: 1 };
    });
  const board = new Board({ depth: DEFAULTS, ball: { bite: 0.5 }, onVerdict: () => 0 });
  [board.width, board.height] = [w, h];
  board.placeBoxes([{ x: 870, y: 0, w: 60, h: 60 }]);
  const step = (tMs: number, landmarks: Landmark[]) =>
    board.step({ tMs, width: w, height: h, landmarks, armed: true, ballCheck: false, windowSide: null });

  step(0, person(260, 270));
  const narrowed = board.poseView;
  expect(narrowed).toEqual({ x0: 530, x1: w });
  step(33, person(900, 180));
  expect(board.poseView).toEqual(narrowed);
  board.placeBoxes([{ x: 270, y: 0, w: 60, h: 60 }]);
  expect(board.poseView).toBeNull();
});

it('opens the narrowed view for good once it shows no one for a second', () => {
  // A target on another station puts the athlete outside its lane; a view kept closed would hide them for the set.
  const [w, h] = [1260, 1080];
  const athlete: Landmark[] = Array.from({ length: 33 }, (_, i) => ({
    x: (i === 11 || i === 23 ? 230 : i === 12 || i === 24 ? 290 : 260) / w,
    y: (i === 23 || i === 24 ? 600 : 300) / h,
    z: 0,
    visibility: 1,
  }));
  const board = new Board({ depth: DEFAULTS, ball: { bite: 0.5 }, onVerdict: () => 0 });
  [board.width, board.height] = [w, h];
  board.placeBoxes([{ x: 870, y: 0, w: 60, h: 60 }]);
  const step = (tMs: number, landmarks: Landmark[] | null) =>
    board.step({ tMs, width: w, height: h, landmarks, armed: true, ballCheck: false, windowSide: null });

  step(0, athlete);
  expect(board.poseView).not.toBeNull();
  step(100, null);
  step(1000, null);
  expect(board.poseView).not.toBeNull();
  step(1100, null);
  expect(board.poseView).toBeNull();
  step(1200, athlete);
  expect(board.poseView).toBeNull();
});
