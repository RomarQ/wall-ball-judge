/**
 * The shared board's own rules: the verdict a set's end judges, and a plate dragged past the other plate of its pair.
 *
 * Run: npm test
 */
import { expect, it } from 'vitest';
import { Board } from '../src/board';
import { DEFAULTS } from '../src/depth';
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
