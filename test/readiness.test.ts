import { describe, expect, it } from 'vitest';
import { ballReadiness, phoneReadiness, poseReadiness, type Parts } from '../src/readiness';

const GOOD: Parts = { camera: 'good', pose: 'good', ball: 'good', finder: 'good' };

describe('a part of the judge', () => {
  it('runs fast enough up to its limit, and slower past it', () => {
    // 15 frames a second for the pose.
    expect(poseReadiness(66)).toBe('good');
    expect(poseReadiness(67)).toBe('slow');
    expect(ballReadiness(90)).toBe('good');
    expect(ballReadiness(91)).toBe('slow');
  });

  it('is never good before it is measured, and does not run when it failed', () => {
    expect(poseReadiness(null)).toBe('none');
    expect(ballReadiness('failed')).toBe('bad');
    expect(poseReadiness(0)).toBe('bad');
  });
});

describe('the phone', () => {
  it('cannot judge live without the camera or the pose', () => {
    expect(phoneReadiness({ ...GOOD, pose: 'bad' })).toBe('bad');
    expect(phoneReadiness({ ...GOOD, camera: 'bad', ball: 'none' })).toBe('bad');
  });

  it('still judges, slowly, without the ball check or the finder', () => {
    expect([phoneReadiness({ ...GOOD, ball: 'bad' }), phoneReadiness({ ...GOOD, finder: 'bad' })]).toEqual([
      'slow',
      'slow',
    ]);
  });

  it('is not known while a part is not', () => {
    expect(phoneReadiness({ ...GOOD, finder: 'none' })).toBe('none');
    expect(phoneReadiness(GOOD)).toBe('good');
  });
});
