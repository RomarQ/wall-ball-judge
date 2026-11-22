/** The board's sounds and the spoken count, as the PWA's board plays them, on the phone's own player and voice. */
import { wallballVision } from 'wallball-vision';
import { ATTACK_MS, FLOOR, language, SPEECH_RATE, TALLY_KEY, TONES, type Tone, type TallySounds, type TallyStore } from './core';

function play(tones: Tone[]): void {
  const parts = tones.flatMap((tone) => [tone.atMs, tone.ms, tone.freq, tone.gain, tone.wave === 'square' ? 1 : 0]);
  wallballVision.tones(parts, ATTACK_MS, FLOOR);
}

/** True while a linked display calls the reps, so this phone does not call them a second time. */
let callsElsewhere = false;

export function callOnDisplay(elsewhere: boolean): void {
  callsElsewhere = elsewhere;
}

/** A valid rep: a beep, then the count spoken in the settings' language. */
export function repValid(count: number): void {
  if (callsElsewhere) return;
  play(TONES.valid);
  wallballVision.say(String(count), language(), SPEECH_RATE);
}

export function repNoRep(): void {
  if (callsElsewhere) return;
  play(TONES.noRep);
}

export function trackingLost(): void {
  play(TONES.trackingLost);
}

export function sessionDone(): void {
  if (callsElsewhere) return;
  play(TONES.done);
}

/** What a tally plays on this phone. */
export const tallySounds: TallySounds = { rep: repValid, noRep: repNoRep, done: sessionDone };

/** Where the live board's tally is kept across starts of the app: the settings, under the PWA's key. */
export const liveTallyStore: TallyStore = {
  load: () => localStorage.getItem(TALLY_KEY),
  save: (text) => localStorage.setItem(TALLY_KEY, text),
};
