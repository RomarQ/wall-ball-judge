import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import manifest from '../models/manifest.json';
import { saveTimes, savedTimes, unitFor } from '../src/phone-check';
import { ballCheckOn, setBallCheckOn, setBallInput } from '../src/settings';

beforeEach(() => {
  const held = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => void held.set(key, value),
  });
});

afterEach(() => vi.unstubAllGlobals());

const MODELS = `${manifest.revision}/${manifest.ball}`;

describe('the stored phone check', () => {
  it('is not shown for a model revision other than the one this build runs', () => {
    localStorage.setItem(
      'phoneCheck',
      JSON.stringify({ models: `${manifest.revision}-before`, ball: { gpu: 30, cpu: 90 } }),
    );

    expect(savedTimes('ball')).toBeNull();
  });

  it('measured at one ball input size is not shown at the other', () => {
    setBallInput(320);
    saveTimes('ball', { gpu: 30, cpu: 90 });
    setBallInput(416);

    expect(savedTimes('ball')).toBeNull();
  });

  it('stopped after the finder loaded, with no times, reads as not checked and leaves the ball on the GPU', () => {
    localStorage.setItem('phoneCheck', JSON.stringify({ models: MODELS, finder: true }));

    expect(savedTimes('pose')).toBeNull();
    expect(savedTimes('ball')).toBeNull();
    expect(unitFor('ball')).toBe('gpu');
  });

  it("keeps one model's times when the other model's are saved", () => {
    saveTimes('pose', { gpu: 41, cpu: 23 });
    saveTimes('ball', { gpu: 72, cpu: 120 });

    expect(savedTimes('pose')).toEqual({ gpu: 41, cpu: 23 });
  });

  it('and the ball-check setting keep each other', () => {
    saveTimes('ball', { gpu: 30, cpu: 90 });
    setBallCheckOn(false);

    expect(savedTimes('ball')).toEqual({ gpu: 30, cpu: 90 });
    expect(ballCheckOn()).toBe(false);
  });

  it("stored under the setting's key, as 0.15.8 and earlier stored it, leaves the ball check on", () => {
    localStorage.setItem('ballCheck', JSON.stringify({ runner: 'graphics', msPerLook: 30, models: 'v10' }));

    expect(ballCheckOn()).toBe(true);
  });
});

describe('the unit a model runs on', () => {
  it('is the faster unit that ran in the check', () => {
    saveTimes('pose', { gpu: 41, cpu: 23 });
    // A unit the model did not run on is never the faster one.
    saveTimes('ball', { gpu: 72, cpu: null });

    expect(unitFor('pose')).toBe('cpu');
    expect(unitFor('ball')).toBe('gpu');
  });
});
