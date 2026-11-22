/**
 * Whether a detector's GPU computes what its model says, judged by the
 * processor's answer to the same frame.
 *
 * A backend can load, run without error, and hand back numbers that are not
 * the model's. One phone's GPU answers a third out on every value, so no score
 * ever clears the threshold and the detector goes quietly blind while the app
 * reports it working. Only the numbers say so, so each detector worker
 * compares them once, when it opens a model.
 */

/**
 * How far a backend's answer may sit from the processor's, as a share of it.
 *
 * Measured on the same model and input: two backends that both work differ by
 * about a ten millionth in full precision and about a thousandth when the
 * GPU computes in half precision, as LiteRT.js's does, and a phone whose GPU
 * is wrong differs by a third. Anything between settles it, so the figure
 * needs no precision.
 */
const AGREEMENT = 0.01;

/** A frame of pattern, so a backend that answers with nothing is told from one that is right about nothing. */
export function pattern(size: number): Float32Array {
  const chw = new Float32Array(3 * size * size);
  // Two primes, for a sequence that does not repeat across the frame.
  for (let i = 0; i < chw.length; i += 1) chw[i] = ((i * 7919) % 997) / 997;
  return chw;
}

/** Whether `mine` sits within AGREEMENT of `theirs`, the processor's answer to the same pattern. */
export function answersAgree(mine: ArrayLike<number>, theirs: ArrayLike<number>): boolean {
  if (mine.length !== theirs.length) return false;
  let apart = 0;
  let scale = 0;
  for (let i = 0; i < mine.length; i += 1) {
    apart += Math.abs(mine[i] - theirs[i]);
    scale += Math.abs(theirs[i]);
  }
  return scale > 0 && apart / scale < AGREEMENT;
}
