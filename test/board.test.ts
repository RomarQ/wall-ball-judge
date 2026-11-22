/**
 * The shared board's own rules: the verdict a set's end judges, a plate dragged past the other plate of its pair, the
 * station the athlete's squat picks, and the division the first hit picks.
 *
 * Run: npm test
 */
import { expect, it } from 'vitest';
import { Board } from '../src/board';
import { DEFAULTS, type DepthOptions } from '../src/depth';
import { landmarksFrom } from '../src/judge-log';
import { DEFAULTS as FINDER } from '../src/placement';
import type { Box } from '../src/types';
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

it("counts a first throw at the women's mark as a rep when the first hit picks the division", () => {
  // gym-raw-7a's first throws strike the women's mark, the fourth the men's: under the men's target, three no-reps.
  const { valid, noRep, board } = replay(readLog('test/data/judge-excerpt.json.gz'), undefined, null);
  expect([valid, noRep, board.required]).toEqual([4, 0, 'lower']);
});
