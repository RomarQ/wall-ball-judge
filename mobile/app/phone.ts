/** The phone check, run once per app start and ball model size: each part of the judge timed on this phone. */
import { wallballVision, type PhoneCheck } from 'wallball-vision';
import { CUT_WIDTH } from './core';

const checks = new Map<number, Promise<PhoneCheck>>();

/** The phone check with the ball model at `input` pixels, which runs the first time it is asked for and keeps its answer. */
export function phoneCheck(input: number): Promise<PhoneCheck> {
  let check = checks.get(input);
  if (!check) {
    check = wallballVision.checkPhone(CUT_WIDTH, input);
    checks.set(input, check);
  }
  return check;
}
