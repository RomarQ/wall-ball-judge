/**
 * The board's sounds as tones, so every player of them sounds the same.
 *
 * Each tone rises over `ATTACK_MS` to its gain and falls exponentially to
 * `FLOOR` by its end.
 */
export interface Tone {
  /** When it starts, after the sound starts. */
  atMs: number;
  freq: number;
  ms: number;
  gain: number;
  wave: 'sine' | 'square';
}

export const ATTACK_MS = 10;
export const FLOOR = 0.0001;

/** How fast the count is spoken, against the speech engine's normal rate. */
export const SPEECH_RATE = 1.4;

const sine = (atMs: number, freq: number, ms: number): Tone => ({ atMs, freq, ms, gain: 0.25, wave: 'sine' });

export const TONES = {
  valid: [sine(0, 880, 120)],
  noRep: [{ atMs: 0, freq: 220, ms: 260, gain: 0.2, wave: 'square' }],
  trackingLost: [sine(0, 330, 90), sine(130, 330, 90)],
} satisfies Record<string, Tone[]>;
