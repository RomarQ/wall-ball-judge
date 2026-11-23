/**
 * Audio feedback: the primary output during a set.
 *
 * The athlete watches the wall, not the phone, so the count has to be audible.
 * The count is spoken in the language chosen in the settings view, by the
 * device's own speech engine.
 */
import { language } from './settings';
import { ATTACK_MS, FLOOR, SPEECH_RATE, TONES, type Tone } from './tones';

let ctx: AudioContext | null = null;

/**
 * The installed voice that fits the language best: the same tag, else the
 * same language in any region, else none, and the engine picks. Voices load
 * late on some engines, so this asks every time rather than caching.
 */
function pickVoice(tag: string): SpeechSynthesisVoice | null {
  const wanted = tag.toLowerCase();
  const voices = window.speechSynthesis.getVoices();
  const langOf = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-');
  return (
    voices.find((v) => langOf(v) === wanted) ??
    voices.find((v) => langOf(v).split('-')[0] === wanted.split('-')[0]) ??
    null
  );
}

/** The voice `say` will use for the chosen language, or null when none fits and the engine picks. */
export function chosenVoice(): SpeechSynthesisVoice | null {
  return 'speechSynthesis' in window ? pickVoice(language()) : null;
}

/** Speaks `text` in the chosen language. Anything still pending is dropped. */
export function say(text: string): boolean {
  if (!('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = language();
  u.voice = pickVoice(u.lang);
  u.rate = SPEECH_RATE;
  window.speechSynthesis.speak(u);
  return true;
}

/**
 * Starts the audio context.
 *
 * Call this from a user gesture. iOS refuses to start audio without one.
 */
export function unlockAudio(): boolean {
  if (!ctx) {
    const AudioCtx =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return false;
    ctx = new AudioCtx();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return true;
}

function beep({ freq, ms, gain, wave }: Tone): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = wave;
  osc.frequency.value = freq;

  const now = ctx.currentTime;
  const dur = ms / 1000;
  amp.gain.setValueAtTime(0, now);
  amp.gain.linearRampToValueAtTime(gain, now + ATTACK_MS / 1000);
  amp.gain.exponentialRampToValueAtTime(FLOOR, now + dur);

  osc.connect(amp).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

/** Plays `tones`, each at its own start. */
function play(tones: Tone[]): void {
  for (const tone of tones) {
    if (tone.atMs) setTimeout(() => beep(tone), tone.atMs);
    else beep(tone);
  }
}

export function repValid(count: number): void {
  play(TONES.valid);
  // Speech queues up and falls behind above about one rep per second, which
  // is why `say` drops anything still pending.
  say(String(count));
}

export function repNoRep(): void {
  play(TONES.noRep);
}

export function trackingLost(): void {
  play(TONES.trackingLost);
}
