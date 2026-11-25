/**
 * Drives the rep state machine with synthetic squat waveforms.
 *
 * Run: npm test
 */
import {
  RepCounter,
  Presence,
  FemurRuler,
  computeDepth,
  LM,
  type Depth,
  type RepClosed,
  type RepEvent,
} from '../src/depth';
import { readFileSync } from 'node:fs';
import { landmarksFrom } from '../src/judge-log';
import type { Landmark } from '../src/types';
import { expect, it } from 'vitest';
// Values are captured as the check is written, the way the old runner compared them at once.
const check = (name: string, actual: unknown, expected: unknown) => {
  const [got, want] = [JSON.stringify(actual), JSON.stringify(expected)];
  it(name, () => expect(got).toBe(want));
};

/** A reading, or a loud failure when the metric declined. */
const reading = (d: Depth) => {
  if (!d.ok) throw new Error(d.reason);
  return d;
};

/** One down-up squat per peak, sampled at fps, with a rest between reps. */
function runReps(
  peaks: number[],
  {
    fps = 30,
    repMs = 2000,
    restMs = 500,
    counter,
  }: { fps?: number; repMs?: number; restMs?: number; counter?: RepCounter } = {},
) {
  const rc = counter || new RepCounter();
  const step = 1000 / fps;
  const events: RepEvent[] = [];
  let t = 0;

  const feed = (depth: number) => {
    const e = rc.update({ depth, visible: true, tMs: t });
    if (e) events.push(e);
    t += step;
  };

  for (let i = 0; i < Math.round(1000 / step); i++) feed(-100);
  for (const peak of peaks) {
    const frames = Math.round(repMs / step);
    for (let i = 0; i <= frames; i++) {
      feed(-100 + (peak + 100) * Math.sin(Math.PI * (i / frames)));
    }
    for (let i = 0; i < Math.round(restMs / step); i++) feed(-100);
  }
  return events;
}

{
  const reps = runReps([30, -20, 35]).filter((e): e is RepClosed => e.type === 'rep');
  check(
    'the shallow squat fails depth',
    reps.map((r) => r.depthPass),
    [true, false, true],
  );
}

/** Feeds `readings` a frame apart; null is a frame where the hips or knees are out of sight. */
function judge(readings: (number | null)[], stepMs = 33): RepEvent[] {
  const rc = new RepCounter();
  const events: RepEvent[] = [];
  readings.forEach((depth, i) => {
    const e = rc.update({ depth: depth ?? 0, visible: depth !== null, tMs: i * stepMs });
    if (e) events.push(e);
  });
  return events;
}
const stand = (frames: number) => Array<number>(frames).fill(-100);
const depthPasses = (events: RepEvent[]) =>
  events.filter((e): e is RepClosed => e.type === 'rep').map((r) => r.depthPass);

{
  const squatTo = (deepest: number) =>
    depthPasses(judge([...stand(10), -30, -20, -10, deepest, -10, -30, -60, ...stand(10)]));
  check(
    'a squat that stops just above the depth line is a no-rep, and one just below it counts',
    [squatTo(1.5), squatTo(2.5)],
    [[false], [true]],
  );
}

{
  const events = judge([...stand(10), -30, -20, -10, 20, 20, -20, -20, -20, 20, -10, -30, -60, ...stand(10)]);
  check(
    'a squat that drops back below parallel from the drive closes its rep and starts the next',
    depthPasses(events),
    [true, true],
  );
}

{
  // The knees drop out of sight at the bottom for a moment.
  const events = judge([
    ...stand(10),
    -30,
    -20,
    -10,
    20,
    ...Array<null>(20).fill(null),
    20,
    -30,
    -60,
    -100,
    ...stand(10),
  ]);
  check(
    'a squat seen again within the blind limit still counts',
    events.map((e) => (e.type === 'rep' ? e.depthPass : e.type)),
    [true],
  );
}

{
  // Filmed from behind, a frame or two can read deep while the athlete stands.
  const events = runReps([30], { repMs: 250, fps: 13 });
  check('a bounce of two frames opens no squat', events, []);
}

{
  // At 13 frames a second a fast squat can pass parallel within the readings
  // that open it, and be rising again by the last of them.
  const rc = new RepCounter();
  const events: RepEvent[] = [];
  const depths = [...Array<number>(10).fill(-100), 5, 15, -20, ...Array<number>(10).fill(-100)];
  depths.forEach((depth, i) => {
    const e = rc.update({ depth, visible: true, tMs: i * 77 });
    if (e) events.push(e);
  });
  const reps = events.filter((e): e is RepClosed => e.type === 'rep');
  check(
    'a squat that passed parallel while it opened passes depth',
    reps.map((r) => r.depthPass),
    [true],
  );
}

{
  // Reaching up to throw lifts the hips past the standing line without a squat.
  const rc = new RepCounter();
  const events: RepEvent[] = [];
  for (let i = 0; i < 40; i++) {
    const depth = i > 10 && i < 25 ? -61 : -100;
    const e = rc.update({ depth, visible: true, tMs: i * 33 });
    if (e) events.push(e);
  }
  check('a half-second lift to well above standing raises nothing', events.length, 0);
}

{
  const rc = new RepCounter();
  // Standing has to hold for a few readings before a rep can open from it.
  for (let i = 0; i < 5; i++) rc.update({ depth: -100, visible: true, tMs: i * 33 });
  for (let i = 0; i < 3; i++) rc.update({ depth: 20, visible: true, tMs: 800 + i * 33 });
  const lost = rc.update({ depth: 20, visible: false, tMs: 3000 });
  check('losing tracking mid-rep aborts it', lost, { type: 'abort', reason: 'lost-tracking' });
}

{
  const reps = runReps([30], { repMs: 20000 }).filter((e): e is RepClosed => e.type === 'rep');
  check(
    'a squat in slow motion, twenty seconds down and up, is a rep',
    reps.map((r) => r.depthPass),
    [true],
  );
}

/** Landmarks for a given hip/knee split, in normalised image space. */
function pose({ hipY, kneeY, visibility = 1 }: { hipY: number; kneeY: number; visibility?: number }) {
  const lms = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility }));
  lms[LM.LEFT_HIP] = { x: 0.5, y: hipY, z: 0, visibility };
  lms[LM.RIGHT_HIP] = { x: 0.5, y: hipY, z: 0, visibility };
  lms[LM.LEFT_KNEE] = { x: 0.5, y: kneeY, z: 0, visibility };
  lms[LM.RIGHT_KNEE] = { x: 0.5, y: kneeY, z: 0, visibility };
  return lms;
}

{
  const d = computeDepth(pose({ hipY: 0.6, kneeY: 0.6 }), 1);
  check('a hip on top of the knee, a femur of no length, is not measurable', d.ok, false);
}

{
  const d = computeDepth(pose({ hipY: 0.4, kneeY: 0.6, visibility: 0.2 }), 1);
  check('a hidden hip is rejected', d, { ok: false, reason: 'low-visibility' });
}

{
  // At 0.42 s of a set filmed from behind, the athlete still stood at the phone with a knee below the picture's edge,
  // and the model's guess at the other knee read a squat 18.7% below parallel.
  const frames = JSON.parse(readFileSync('test/data/pose-frames.json', 'utf8')) as Record<
    string,
    { w: number; h: number; landmarks: number[] }
  >;
  const { w, h, landmarks } = frames.kneeOutside;
  check('a knee outside the picture gives no depth', computeDepth(landmarksFrom(landmarks), w / h).ok, false);
}

{
  // A femur at 45 degrees on a 16:9 frame. Scaling x by the aspect keeps the
  // measured length honest, so the depth stays the same as the upright case.
  const aspect = 16 / 9;
  const dy = 0.2;
  const dx = dy / aspect;
  const lms = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  lms[LM.LEFT_HIP] = { x: 0.5, y: 0.4, z: 0, visibility: 1 };
  lms[LM.RIGHT_HIP] = { x: 0.5, y: 0.4, z: 0, visibility: 1 };
  lms[LM.LEFT_KNEE] = { x: 0.5 + dx, y: 0.4 + dy, z: 0, visibility: 1 };
  lms[LM.RIGHT_KNEE] = { x: 0.5 + dx, y: 0.4 + dy, z: 0, visibility: 1 };
  const withAspect = reading(computeDepth(lms, aspect)).depth;
  check('aspect correction gives -71 for a 45 degree femur', Math.round(withAspect), -71);
}

{
  const p = new Presence({ minTorso: 0.06, settleFrames: 10 });
  let seen = false;
  for (let i = 0; i < 40; i += 1) seen = p.update({ ok: true, torso: 0.03 }) || seen;
  check('a skeleton the size of a chair never counts', [seen, p.tooSmall], [false, true]);
}

{
  const p = new Presence({ minTorso: 0.06, settleFrames: 10 });
  const answers: boolean[] = [];
  for (let i = 0; i < 12; i += 1) answers.push(p.update({ ok: true, torso: 0.15 }));
  check(
    'an athlete counts once settled, not at once',
    [answers[8], answers[9], answers[11]],
    [false, true, true],
  );
  const missed = p.update({ ok: false, torso: undefined });
  const back = p.update({ ok: true, torso: 0.15 });
  check('one missed frame blinds that frame only', [missed, back], [false, true]);
  for (let i = 0; i < 10; i += 1) p.update({ ok: false, torso: undefined });
  check('ten missed frames and the athlete is gone', p.update({ ok: true, torso: 0.15 }), false);
}

{
  type XY = [number, number];
  const pose = (lhip: XY, rhip: XY, lknee: XY, rknee: XY) => {
    const lm: Landmark[] = [];
    [lm[LM.LEFT_HIP], lm[LM.RIGHT_HIP], lm[LM.LEFT_KNEE], lm[LM.RIGHT_KNEE]] = [lhip, rhip, lknee, rknee].map(
      ([x, y]) => ({ x, y, visibility: 1 }),
    );
    return lm;
  };
  // Standing from behind: the femur is upright and a fifth of the frame tall.
  const ruler = new FemurRuler();
  const standing = pose([0.45, 0.4], [0.55, 0.4], [0.45, 0.6], [0.55, 0.6]);
  ruler.update(reading(computeDepth(standing, 1)));
  // At the bottom from behind the thigh points at the camera: the hips sit a hundredth above the knees, the femur reads two hundredths.
  const bottom = pose([0.45, 0.59], [0.55, 0.59], [0.43, 0.6], [0.57, 0.6]);
  check(
    'from behind the standing femur is the ruler, so a small shortfall reads small',
    [
      reading(computeDepth(bottom, 1)).depth.toFixed(0),
      reading(computeDepth(bottom, 1, {}, ruler.length)).depth.toFixed(0),
    ],
    ['-45', '-5'],
  );
  // An athlete who stepped closer has a longer femur than the ruler remembers, and is measured with it.
  const closer = pose([0.5, 0.3], [0.5, 0.3], [0.5, 0.7], [0.5, 0.7]);
  check(
    'a longer femur than the ruler is its own ruler',
    +reading(computeDepth(closer, 1, {}, ruler.length)).depth.toFixed(3),
    -100,
  );
  const taller = pose([0.5, 0.3], [0.5, 0.3], [0.5, 0.6], [0.5, 0.6]);
  ruler.update(reading(computeDepth(taller, 1, {}, ruler.length)));
  check('the ruler follows a standing femur a step at a time', +ruler.length.toFixed(3), 0.21);

  // The ruler follows what the frame says is an upright thigh, not what the
  // ruler itself makes the stand read. One that grew on a wrong pose reads
  // every stand after it as a half squat, and a ruler gated on that reading
  // never shrinks back.
  const grown = new FemurRuler();
  grown.update(reading(computeDepth(closer, 1)));
  const stand = reading(computeDepth(standing, 1, {}, grown.length));
  grown.update(stand);
  check(
    'a ruler that outgrew the femur shrinks on the next standing frame',
    [Math.round(stand.depth), +grown.length.toFixed(3)],
    [-50, 0.38],
  );
  grown.update(reading(computeDepth(bottom, 1, {}, grown.length)));
  check('a squatting frame leaves the ruler alone', +grown.length.toFixed(3), 0.38);

  // A deep squat from behind: the left thigh splays out at three quarters of its
  // standing length, and the model guesses the hidden right knee just under the hip.
  const guessedKnee = pose([0.45, 0.63], [0.55, 0.62], [0.3, 0.6], [0.57, 0.66]);
  const seen = reading(computeDepth(guessedKnee, 1, {}, 0.2));
  check(
    'the leg nearer its standing length is the reading',
    [seen.side, Math.round(seen.depth)],
    ['left', 15],
  );
  const unruled = reading(computeDepth(guessedKnee, 1));
  check('with no ruler the two legs are averaged', [unruled.side, Math.round(unruled.depth)], ['both', -35]);
}

{
  // A phone low and close to the athlete reads their stand near -60, where a
  // phone at hip height reads -100. Every rep of this set is a full squat; the
  // counter must not sit waiting for a reading the camera never produces.
  const rc = new RepCounter();
  const events: RepEvent[] = [];
  let t = 0;
  const feed = (depth: number) => {
    const e = rc.update({ depth, visible: true, tMs: t });
    if (e) events.push(e);
    t += 33;
  };
  // The shape one rep of that clip traces at 30 frames a second: two seconds,
  // the hips down from -63 to +15 and back, with the top of every rep at -63.
  const down = [-40, -25, -10, 2, 9, 15];
  const up = [15, 9, 2, -10, -25, -40, -50];
  for (let i = 0; i < 40; i++) feed(-63);
  for (let rep = 0; rep < 8; rep++) {
    for (const depth of down) feed(depth);
    for (let i = 0; i < 6; i++) feed(15);
    for (const depth of up) feed(depth);
    for (let i = 0; i < 40; i++) feed(-63);
  }
  const reps = events.filter((e): e is RepClosed => e.type === 'rep');
  check(
    'a set filmed low, where the athlete never reads as standing, counts every rep',
    [reps.length, reps.every((r) => r.depthPass)],
    [8, true],
  );
}

{
  // A frame where one leg drops out of sight is measured differently from one
  // where both are seen, so the reading can dive most of its range and come
  // straight back. Ending the rep there loses a good squat.
  const rc = new RepCounter();
  const events: RepEvent[] = [];
  const feed = (depth: number, tMs: number) => {
    const e = rc.update({ depth, visible: true, tMs });
    if (e) events.push(e);
  };
  let t = 0;
  for (let i = 0; i < 15; i++, t += 33) feed(-100, t);
  // Long enough to be a real rep, with one frame diving to standing in the middle.
  const squat = [-38, -20, -10, 5, 20, 30, 28, -100, 25, 20, 10, -10, -30, -45, -55];
  for (const depth of squat) {
    feed(depth, t);
    t += 33;
  }
  for (let i = 0; i < 15; i++, t += 33) feed(-100, t);
  const reps = events.filter((e): e is RepClosed => e.type === 'rep');
  check(
    'a single frame reading as standing does not end a squat',
    [reps.length, reps[0]?.depthPass],
    [1, true],
  );
}
