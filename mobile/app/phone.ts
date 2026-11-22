/** The phone check, run once per app start: each part of the judge timed on this phone. */
import { wallballVision, type PhoneCheck } from 'wallball-vision';
import { CUT_WIDTH } from './core';

let check: Promise<PhoneCheck> | null = null;

/** The phone check, which runs the first time it is asked for and keeps its answer. */
export function phoneCheck(): Promise<PhoneCheck> {
  check ??= wallballVision.checkPhone(CUT_WIDTH);
  return check;
}
