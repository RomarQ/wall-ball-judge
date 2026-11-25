/**
 * What the drawing on the home view shows at each moment: two stations side by side, a man's and a woman's, as the
 * judge board's overlay draws them. Each station shows the athlete's legs, the parallel line at the knees, the box on
 * each target, the box on the ball, and the verdict. The camera sees the athletes from behind.
 *
 * Each station runs its own set. The man's set holds both kinds of no-rep: a squat that stays above parallel, and a
 * throw that reaches only the women's target. Only a good rep counts.
 *
 * No DOM: src/demo.ts paints a scene into the page's drawing, and the native app into its own.
 */
import { t } from './i18n';

/** How long one rep takes, in milliseconds. */
const LOOP_MS = 4400;

/** Where the loop's events fall, as shares of the loop. */
const AT = {
  squat: [0.1, 0.38],
  bottom: 0.42,
  stand: 0.56,
  arms: [0.46, 0.54, 0.68, 0.8],
  release: 0.5,
  hit: 0.64,
  /** When a throw that reached only the women's target is called: once the ball is on its way down. */
  short: 0.7,
  catch: 0.8,
  clear: 0.92,
} as const;

type Rep = 'good' | 'shallow' | 'short';
export type Division = 'men' | 'women';

interface Station {
  division: Division;
  /** The reps of the station's set, in order. */
  set: readonly Rep[];
  /** How far this station runs behind the first one, as a share of a loop, so the two do not move as one. */
  lag: number;
  /** The width of the athlete's shoulders and hips, as a share of the man's. */
  build: number;
}

const STATIONS: Record<Division, Station> = {
  men: { division: 'men', set: ['good', 'shallow', 'good', 'short'], lag: 0, build: 1 },
  women: { division: 'women', set: ['good', 'good', 'shallow', 'good'], lag: 0.03, build: 0.86 },
};

/** The time the still frame shows, in milliseconds: both balls still on their targets, and the arms still up. */
export const STILL_MS = AT.arms[2] * LOOP_MS;

/** The centres of the two targets, in a station's own units. */
const MENS = { x: 150, y: 0 };
const WOMENS = { x: 150, y: 64 };

/** How deep a shallow squat goes, as a share of a full one: the hips stay above the knees. */
const SHALLOW = 0.55;

export interface Point {
  x: number;
  y: number;
}

/** Everything that moves at one station, at one moment of the loop. */
interface DemoFrame {
  hips: [Point, Point];
  knees: [Point, Point];
  ankles: [Point, Point];
  shoulderY: number;
  /** How far the arms are raised, from 0 at the chest to 1 overhead. */
  raise: number;
  ball: Point;
  ballSeen: boolean;
  /** From 1 at the verdict down to 0: the flash on the athlete's own target, and on a target that was not enough. */
  targetFlash: number;
  missFlash: number;
  /** The verdict on the banner, or null while none shows. */
  banner: Rep | null;
}

/** One station as drawn, in its own units: the shapes of the athlete and of the overlay on them. */
export interface StationScene {
  /** The torso's outline, as SVG path data. */
  torso: string;
  headY: number;
  /** Where a ponytail hangs, for an athlete who has one. */
  ponytailY: number;
  /** Shoulder, elbow and hand, left then right. */
  arms: [Point[], Point[]];
  /** Hip, knee and ankle, left then right. */
  legs: [Point[], Point[]];
  /** The height of the parallel line: the knees'. */
  parallelY: number;
  ball: Point;
  ballSeen: boolean;
  targetFlash: number;
  missFlash: number;
  banner: { fault: boolean; title: string; detail: string } | null;
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const between = (t: number, from: number, to: number) => clamp((t - from) / (to - from));
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const easeOut = (k: number) => 1 - (1 - k) ** 2;
const easeIn = (k: number) => k * k;
const fade = (t: number, from: number) => (t >= from ? 1 - between(t, from, from + 0.1) : 0);

/** How deep the squat is at `t`, from 0 standing to 1 at the bottom of a full one. */
function depthAt(t: number): number {
  if (t < AT.bottom) return easeInOut(between(t, AT.squat[0], AT.squat[1]));
  return 1 - easeOut(between(t, AT.bottom, AT.stand));
}

/** The frame of `rep` by an athlete of `division`, at `t`, a share of the loop. */
function frameAt(t: number, rep: Rep, division: Division): DemoFrame {
  const s = depthAt(t) * (rep === 'shallow' ? SHALLOW : 1);
  const hipY = mix(262, 330, s);
  const kneeY = mix(316, 320, s);
  const kneeOut = mix(18, 36, s);
  const shoulderY = hipY - mix(72, 62, s);
  const [up, peak, down, rest] = AT.arms;
  const raise = t < peak ? easeOut(between(t, up, peak)) : 1 - easeInOut(between(t, down, rest));

  const own = division === 'men' ? MENS : WOMENS;
  const target = rep === 'short' ? WOMENS : own;
  const hold = { x: target.x, y: shoulderY + 22 };
  let ball = hold;
  if (t >= AT.release && t < AT.hit) {
    ball = { x: target.x, y: mix(hold.y, target.y, easeOut(between(t, AT.release, AT.hit))) };
  } else if (t >= AT.hit && t < AT.catch) {
    ball = { x: target.x, y: mix(target.y, hold.y, easeIn(between(t, AT.hit, AT.catch))) };
  }
  const headTop = shoulderY - 33;
  // A squat that stays above parallel is called when the athlete stands.
  const verdictAt = { good: AT.hit, shallow: AT.stand, short: AT.short }[rep];

  return {
    hips: [
      { x: 137, y: hipY },
      { x: 163, y: hipY },
    ],
    knees: [
      { x: 150 - kneeOut, y: kneeY },
      { x: 150 + kneeOut, y: kneeY },
    ],
    ankles: [
      { x: 129, y: 368 },
      { x: 171, y: 368 },
    ],
    shoulderY,
    raise,
    ball,
    // The app looks for the ball only in a throw that a good squat opened, and stops at the hit.
    ballSeen: rep !== 'shallow' && t < AT.hit && ball.y < headTop,
    targetFlash: rep === 'good' ? fade(t, AT.hit) : 0,
    missFlash: rep === 'short' ? fade(t, AT.short) : 0,
    banner: t >= verdictAt && t < AT.clear - 0.04 ? rep : null,
  };
}

/** Where `station` stands `elapsed` milliseconds after the drawing started: its loop, and the share of that loop. */
function momentOf(station: Station, elapsed: number): { loop: number; t: number } {
  const own = elapsed / LOOP_MS - station.lag;
  const loop = Math.floor(own);
  return { loop, t: own - loop };
}

/** The good reps `station` has counted by `elapsed` milliseconds, from 1 to 100 and round again. */
function countAt(station: Station, elapsed: number): number {
  const { loop, t } = momentOf(station, elapsed);
  const { set } = station;
  if (loop < 0) return 0;
  const goodPerSet = set.filter((rep) => rep === 'good').length;
  let good = Math.floor(loop / set.length) * goodPerSet;
  for (let i = 0; i < loop % set.length; i += 1) if (set[i] === 'good') good += 1;
  if (set[loop % set.length] === 'good' && t >= AT.hit) good += 1;
  return good === 0 ? 0 : ((good - 1) % 100) + 1;
}

/** The banner's two lines, in the words the board's overlay uses. See flashText in flash.ts. */
function bannerText(rep: Rep, count: number): [string, string] {
  if (rep === 'shallow') return [t('overlay.noRep'), t('overlay.depth')('9', false)];
  if (rep === 'short') return [t('overlay.noRep'), t('overlay.hitLower')];
  return [t('overlay.rep')(count), t('overlay.depth')('14', true)];
}

/** The station of `division` as drawn `elapsed` milliseconds after the drawing started. */
export function sceneAt(division: Division, elapsed: number): StationScene {
  const station = STATIONS[division];
  const { loop, t } = momentOf(station, elapsed);
  const rep = station.set[((loop % station.set.length) + station.set.length) % station.set.length];
  const frame = frameAt(t, rep, division);
  const { hips, knees, ankles, shoulderY: sy, raise, ball } = frame;
  const hipY = hips[0].y;
  // Narrower shoulders and hips, about the athlete's centre line.
  const x = (offset: number) => (150 + offset * station.build).toFixed(1);
  const arm = (sign: number): Point[] => [
    { x: 150 + sign * 32 * station.build, y: sy + 8 },
    { x: 150 + sign * mix(42, 28, raise) * station.build, y: mix(sy + 32, sy - 34, raise) },
    { x: 150 + sign * mix(14, 20, raise) * station.build, y: mix(sy + 26, sy - 62, raise) },
  ];
  const banner = frame.banner ? bannerText(frame.banner, countAt(station, elapsed)) : null;
  return {
    torso: `M${x(-35)} ${sy + 4} Q150 ${sy - 10} ${x(35)} ${sy + 4} Q${x(38)} ${sy + 34} ${x(24)} ${hipY - 4} L${x(22)} ${hipY + 10} L${x(-22)} ${hipY + 10} L${x(-24)} ${hipY - 4} Q${x(-38)} ${sy + 34} ${x(-35)} ${sy + 4}Z`,
    headY: sy - 18,
    ponytailY: sy - 6,
    arms: [arm(-1), arm(1)],
    legs: [
      [hips[0], knees[0], ankles[0]],
      [hips[1], knees[1], ankles[1]],
    ],
    parallelY: (knees[0].y + knees[1].y) / 2,
    ball,
    ballSeen: frame.ballSeen,
    targetFlash: frame.targetFlash,
    missFlash: frame.missFlash,
    banner:
      frame.banner && banner ? { fault: frame.banner !== 'good', title: banner[0], detail: banner[1] } : null,
  };
}
