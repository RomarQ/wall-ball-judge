/**
 * The overlay's layout, which both apps paint: a mirrored picture's marks, when a plate shows its controls, how the
 * plates are named, and how the search's stations are numbered.
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
    required: 'upper',
    plates: [],
    editable: false,
    ball: null,
    candidates: [],
    stations: [],
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
    controlSize: 24,
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
    marks: layoutOverlay(frame({ mirror, landmarks, target: target({ ball }) })),
    plates: layoutOverlay(frame({ mirror, target: target({ plates: [plate] }) })),
  });
  const plain = of(false);
  const mirrored = of(true);
  const reflect = (b: { x: number; w: number }) => W - (b.x + b.w);
  expect(mirrored.marks.ball!.box.x).toBeCloseTo(reflect(plain.marks.ball!.box));
  expect(mirrored.plates.plates[0].box.x).toBeCloseTo(reflect(plain.plates.plates[0].box));
  expect(mirrored.marks.joints[0].x).toBeCloseTo(W - plain.marks.joints[0].x);
});

it("shows a plate's remove button and resize handle only while the target is editable, beside the plate as shown", () => {
  // The grab rule finds the button beside the plate as the picture shows it, so a mirrored picture must draw it there,
  // and a set under way must offer no button for a stray tap to remove its target with.
  const plate = { x: 0.2, y: 0.1, w: 0.1, h: 0.08 };
  const shown = (mirror: boolean, editable: boolean) =>
    layoutOverlay(frame({ mirror, target: target({ plates: [plate], editable }) })).plates[0];
  const mirrored = shown(true, true);
  expect(mirrored.remove!.x).toBeGreaterThan(mirrored.box.x + mirrored.box.w);
  expect(mirrored.handle).toEqual({ x: mirrored.box.x + mirrored.box.w, y: mirrored.box.y + mirrored.box.h });
  const running = shown(true, false);
  expect([running.remove, running.handle]).toEqual([null, null]);
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
    [t('overlay.upperTarget'), false],
    [t('overlay.lowerTarget'), true],
  ]);
  expect(disc.map((p) => [p.name, p.active])).toEqual([[t('overlay.target'), true]]);
});

it('numbers each station of the search once, in one box round its plates, as the notice counts them', () => {
  // A preview numbering each plate would offer four targets where the notice says two.
  const plate = (x: number, y: number) => ({ x, y, w: 40, h: 40, score: 0.9, name: 'target' });
  const candidates = [plate(100, 100), plate(600, 160), plate(600, 100), plate(100, 40)];
  const { candidates: marks } = layoutOverlay(
    frame({
      target: target({
        candidates,
        stations: [
          [3, 0],
          [2, 1],
        ],
      }),
    }),
  );
  expect(marks).toEqual([
    { box: { x: 100, y: 40, w: 40, h: 100 }, label: '1' },
    { box: { x: 600, y: 100, w: 40, h: 100 }, label: '2' },
  ]);
});
