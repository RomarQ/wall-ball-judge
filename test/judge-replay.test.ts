/**
 * Sets the board recorded with `?log=1`, judged again by the shared board:
 * every frame's decision must come out as the board made it.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readLog, replay } from './judge-replay';

describe('a recorded set judged again', () => {
  it("gives the board's decision on every frame", () => {
    // gym-raw-7a under the upper target: the target chosen, then three target faults and a rep.
    const { differences, valid, noRep } = replay(readLog('test/data/judge-excerpt.json.gz'));
    expect(differences).toEqual([]);
    expect([valid, noRep]).toEqual([1, 3]);
  });
});

// Whole sets stay out of git; `JUDGE_LOGS=<folder> npm test` replays every log in the folder.
const folder = process.env.JUDGE_LOGS;
describe.skipIf(!folder)('every set in JUDGE_LOGS judged again', () => {
  for (const file of folder ? readdirSync(folder).filter((f) => f.endsWith('.json')) : []) {
    it(file, () => {
      expect(replay(readLog(join(folder!, file))).differences.slice(0, 5)).toEqual([]);
    });
  }
});
