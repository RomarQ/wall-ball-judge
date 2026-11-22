/**
 * The overlay's layout, which both apps paint: a mirrored picture's marks, where a line's label goes, and how the
 * plates are named.
 *
 * Run: npm test
 */
import { expect, it } from 'vitest';
import { t } from '../src/i18n';
import { layoutOverlay, type OverlayFrame, type TargetFrame } from '../src/overlay-layout';
import type { Landmark } from '../src/types';

const W = 1280;
const H = 720;

function target(change: Partial<TargetFrame> = {}): TargetFrame {
  return {
    lines: { upper: 0.2, lower: 0.3 },
    required: 'upper',
    x: 0.25,
    plates: [],
    ball: null,
    candidates: [],
    ...change,
  };
}

function frame(change: Partial<OverlayFrame> = {}): OverlayFrame {
  return {
    width: W,
    height: H,
    mirror: false,
    landmarks: null,
    depth: null,
    target: target(),
    flash: null,
    notice: null,
    warning: null,
    labelHeight: 30,
    ...change,
  };
}

it('reflects every mark of a mirrored picture across its width, boxes by their far edge', () => {
  // A painter that never flips its canvas needs the layout to flip the marks, or they sit apart from the mirrored video.
  const hip: Landmark = { x: 0.3, y: 0.6, z: 0, visibility: 1 };
  const landmarks = Array.from({ length: 33 }, () => hip);
  const ball = {
    x: 100,
    y: 50,
    w: 40,
    h: 30,
    score: 0.9,
    name: 'ball',
    centre: { x: 0, y: 0 },
    struck: null,
    until: 0,
  };
  const plate = { x: 0.2, y: 0.1, w: 0.1, h: 0.08 };
  const of = (mirror: boolean) => ({
    lines: layoutOverlay(frame({ mirror, landmarks, target: target({ ball }) })),
    plates: layoutOverlay(frame({ mirror, target: target({ plates: [plate] }) })),
  });
  const plain = of(false);
  const mirrored = of(true);
  const reflect = (b: { x: number; w: number }) => W - (b.x + b.w);
  expect(mirrored.lines.ball!.box.x).toBeCloseTo(reflect(plain.lines.ball!.box));
  expect(mirrored.plates.plates[0].box.x).toBeCloseTo(reflect(plain.plates.plates[0].box));
  expect(mirrored.lines.lines[0].spot).toBeCloseTo(W - plain.lines.lines[0].spot!);
  expect(mirrored.lines.joints[0].x).toBeCloseTo(W - plain.lines.joints[0].x);
});

it("puts the upper line's label above it only when the lines are closer than a label", () => {
  const above = (lower: number) =>
    layoutOverlay(frame({ target: target({ lines: { upper: 0.2, lower } }) })).lines.map(
      (line) => line.above,
    );
  // 30 px of label: 0.03 of the height apart leaves 21.6 px, 0.1 leaves 72.
  expect([above(0.23), above(0.3)]).toEqual([
    [true, false],
    [false, false],
  ]);
});

it('names two plates by division, the higher the men’s, and a single disc only the target', () => {
  const plates = [
    { x: 0.2, y: 0.1, w: 0.1, h: 0.08 },
    { x: 0.2, y: 0.2, w: 0.1, h: 0.08 },
  ];
  const pair = layoutOverlay(frame({ target: target({ plates, required: 'lower' }) })).plates;
  const disc = layoutOverlay(
    frame({ target: target({ plates: [plates[0]], single: true, required: 'lower' }) }),
  ).plates;
  expect(pair.map((p) => [p.name, p.active])).toEqual([
    [t('overlay.mensTarget'), false],
    [t('overlay.womensTarget'), true],
  ]);
  expect(disc.map((p) => [p.name, p.active])).toEqual([[t('overlay.target'), true]]);
});
