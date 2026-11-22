import { describe, expect, it } from 'vitest';
import { searchClip, type Seen } from '../src/placement';
import type { Box } from '../src/types';

const plate = (score: number, x = 100): Box => ({ x, y: 50, w: 40, h: 40, score, name: 'target' });
const seenWith = (...plates: Box[]): Seen => ({ look: { plates, balls: [] }, athlete: null });

describe('the search over a clip', () => {
  it('keeps the frame with the best plate, and stops at the first one it can place', async () => {
    const frames: Record<number, Seen> = {
      0: seenWith(plate(0.3)),
      1: seenWith(plate(0.5)),
      2: seenWith(plate(0.4)),
      4: seenWith(plate(0.45)),
    };
    const asked: number[] = [];
    const lookAt = async (at: number) => {
      asked.push(at);
      return { seen: frames[at], best: frames[at].look.plates[0].score };
    };

    const found = await searchClip(10, lookAt);

    expect(found.at).toBe(1);
    expect(found.best).toBe(0.5);

    asked.length = 0;
    frames[1] = seenWith(plate(0.7));
    const placedEarly = await searchClip(10, lookAt);

    expect(asked).toEqual([0, 1]);
    expect(placedEarly.at).toBe(1);
  });

  it('passes over a frame whose look fails, and throws only when every look fails', async () => {
    const broken = new Error('no backend');
    const someFail = await searchClip(10, async (at) => {
      if (at === 0) throw broken;
      return { seen: seenWith(plate(0.4)), best: 0.4 };
    });

    expect(someFail.at).toBe(1);
    await expect(
      searchClip(10, async () => {
        throw broken;
      }),
    ).rejects.toBe(broken);
  });
});
