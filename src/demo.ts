/**
 * Plays the drawing on the home view, whose moments src/demo-scene.ts gives.
 *
 * It runs only while the home view shows and the drawing is on screen. With
 * reduced motion it holds a frame where both athletes have hit their target.
 */
import { sceneAt, STILL_MS, type Division, type Point, type StationScene } from './demo-scene';

const points = (...ps: Point[]) => ps.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

type Parts = (name: string) => SVGElement | null;

/** A station's elements by their `data-part`, looked up once. A part that a station lacks reads as null. */
function partsOf(lane: Element): Parts {
  const parts = new Map<string, SVGElement>();
  for (const el of lane.querySelectorAll<SVGElement>('[data-part]')) parts.set(el.dataset.part ?? '', el);
  return (name) => parts.get(name) ?? null;
}

/** Sets a station's elements to `scene`. */
function paint(part: Parts, scene: StationScene): void {
  const at = (name: string) => {
    const el = part(name);
    if (!el) throw new Error(`the drawing has no part ${name}`);
    return el;
  };
  at('torso').setAttribute('d', scene.torso);
  at('head').setAttribute('cy', scene.headY.toFixed(1));
  part('ponytail')?.setAttribute('cy', scene.ponytailY.toFixed(1));
  const [armLeft, armRight] = scene.arms;
  at('arm-left').setAttribute('points', points(...armLeft));
  at('arm-right').setAttribute('points', points(...armRight));
  const [legLeft, legRight] = scene.legs;
  for (const name of ['legs-body', 'legs-line']) {
    at(`${name}-left`).setAttribute('points', points(...legLeft));
    at(`${name}-right`).setAttribute('points', points(...legRight));
  }
  const [hl, kl] = legLeft;
  const [hr, kr] = legRight;
  at('hip-line').setAttribute('points', points(hl, hr));
  for (const [name, p] of [
    ['hip-left', hl],
    ['hip-right', hr],
    ['knee-left', kl],
    ['knee-right', kr],
  ] as const) {
    at(name).setAttribute('cx', p.x.toFixed(1));
    at(name).setAttribute('cy', p.y.toFixed(1));
  }
  at('parallel').setAttribute('transform', `translate(0 ${scene.parallelY.toFixed(1)})`);

  const { ball } = scene;
  at('ball').setAttribute('transform', `translate(${ball.x.toFixed(1)} ${ball.y.toFixed(1)})`);
  const box = at('ball-box');
  box.setAttribute('transform', `translate(${ball.x.toFixed(1)} ${ball.y.toFixed(1)})`);
  box.style.visibility = scene.ballSeen ? 'visible' : 'hidden';

  at('target-flash').setAttribute('fill-opacity', (0.35 * scene.targetFlash).toFixed(2));
  const miss = part('miss-flash');
  if (miss) miss.style.opacity = scene.missFlash.toFixed(2);
  const banner = at('banner');
  banner.style.visibility = scene.banner ? 'visible' : 'hidden';
  if (scene.banner) {
    banner.classList.toggle('fault', scene.banner.fault);
    at('banner-title').textContent = scene.banner.title;
    at('banner-detail').textContent = scene.banner.detail;
  }
}

const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Plays the drawing in `svg`, whose stations are the elements with a `data-lane` of 'men' or 'women'.
 *
 * @returns a switch that plays the drawing while `true` and pauses it while `false`.
 */
export function playDemo(svg: SVGSVGElement): (on: boolean) => void {
  let wanted = false;
  let onScreen = true;
  let raf = 0;
  let origin = 0;
  // The loop goes on from the still frame, so the first frames continue the picture already shown.
  let pausedAt = STILL_MS;
  const lanes = [...svg.querySelectorAll('[data-lane]')].map((lane) => ({
    division: lane.getAttribute('data-lane') as Division,
    parts: partsOf(lane),
  }));

  const draw = (elapsed: number) => {
    for (const { division, parts } of lanes) paint(parts, sceneAt(division, elapsed));
  };
  const tick = (now: number) => {
    draw(now - origin);
    raf = requestAnimationFrame(tick);
  };
  const update = () => {
    const run = wanted && onScreen && !document.hidden && !still();
    if (run && !raf) {
      origin = performance.now() - pausedAt;
      raf = requestAnimationFrame(tick);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
      pausedAt = performance.now() - origin;
    }
  };

  draw(STILL_MS);
  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    update();
  }).observe(svg);
  document.addEventListener('visibilitychange', update);
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
    if (still()) draw(STILL_MS);
    update();
  });
  return (on) => {
    wanted = on;
    update();
  };
}
