import { describe, expect, it } from 'vitest';
import { ballFileAt, type BallModels } from '../src/ball-model';

const REVISION: BallModels = {
  files: { 'small.tflite': { input: 320 }, 'large.tflite': { input: 416 }, 'finder.tflite': { input: 640 } },
  ball: 'small.tflite',
  balls: ['small.tflite', 'large.tflite'],
};

describe('the ball model at a chosen input size', () => {
  it.each([
    { input: 416, file: 'large.tflite' },
    // A size stored for another revision, or the finder's, is no ball model here.
    { input: 640, file: 'small.tflite' },
  ])('at $input is $file', ({ input, file }) => {
    expect(ballFileAt(REVISION, input)).toBe(file);
  });
});
