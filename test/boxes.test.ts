/**
 * Checks the letterbox mapping and the choosing the detector does, with no model.
 *
 * Run: npm test
 */
import { cutByTile, cutSize, decode, fromArea, letterbox, suppress, tiles, windowAround } from '../src/boxes';
import type { Box } from '../src/types';
import { expect, it } from 'vitest';
// Values are captured as the check is written, the way the old runner compared them at once.
const check = (name: string, actual: unknown, expected: unknown) => {
  const [got, want] = [JSON.stringify(actual), JSON.stringify(expected)];
  it(name, () => expect(got).toBe(want));
};

interface Anchor {
  cx: number;
  cy: number;
  w: number;
  h: number;
  scores: number[];
}

/** The model's own layout: a column per anchor, down the [1, 4 + classes, anchors] output. */
function raw(anchors: Anchor[]): { data: Float32Array; dims: number[] } {
  const classes = anchors[0].scores.length;
  const n = anchors.length;
  const data = new Float32Array((4 + classes) * n);
  anchors.forEach((a, i) => {
    [a.cx, a.cy, a.w, a.h, ...a.scores].forEach((v, k) => {
      data[k * n + i] = v;
    });
  });
  return { data, dims: [1, 4 + classes, n] };
}

/** A box given by its corners, the way a reader measures one off a frame. */
const corners = (x0: number, y0: number, x1: number, y1: number, scores: number[]): Anchor => ({
  cx: (x0 + x1) / 2,
  cy: (y0 + y1) / 2,
  w: x1 - x0,
  h: y1 - y0,
  scores,
});

const at = (b: Box) => [b.x, b.y, b.w, b.h];
// A score makes the round trip through a Float32Array, so 0.9 comes back as 0.8999999761581421.
const sure = (b: Box) => Number(b.score.toFixed(2));

{
  const box = letterbox(1280, 720, 640);
  check('a landscape frame is scaled to the width and padded top and bottom', box, {
    scale: 0.5,
    dx: 0,
    dy: 140,
    dw: 640,
    dh: 360,
  });
  const { data, dims } = raw([corners(100, 200, 200, 300, [0.9])]);
  const [b] = decode(data, dims, box, 0.3, 0.45);
  check('a box maps back through the padding and the scale', at(b), [200, 120, 200, 200]);
}

{
  const box = letterbox(720, 1280, 640);
  const { data, dims } = raw([corners(140, 0, 500, 640, [0.9])]);
  const [b] = decode(data, dims, box, 0.3, 0.45);
  check('the full letterbox maps back to the full frame', at(b), [0, 0, 720, 1280]);
}

{
  const box = letterbox(640, 480, 640);
  const { data, dims } = raw([corners(0, 0, 10, 10, [0.2]), corners(20, 20, 30, 30, [0.4])]);
  check('an anchor below the threshold is dropped', decode(data, dims, box, 0.3, 0.45).length, 1);
}

{
  const box = letterbox(640, 640, 640);
  // An anchor scores every class. The higher score is the one it means.
  const { data, dims } = raw([corners(0, 0, 10, 10, [0.2, 0.9]), corners(20, 20, 30, 30, [0.8, 0.1])]);
  const named = decode(data, dims, box, 0.3, 0.45, 'ball', ['ball', 'target']);
  check(
    'an anchor takes the name of its best class, best anchor first',
    named.map((b) => [b.name, sure(b)]),
    [
      ['target', 0.9],
      ['ball', 0.8],
    ],
  );
  const short = decode(data, dims, box, 0.3, 0.45, 'ball', ['ball']);
  check('a class the names do not cover falls back to the default', short[0].name, 'ball');
}

{
  // One ball arrives as a column of boxes over the same pixels, so the best
  // one stands and the rest go. A box beside it is a second ball.
  const box = letterbox(640, 640, 640);
  const { data, dims } = raw([
    corners(0, 0, 10, 10, [0.9]),
    corners(2, 0, 12, 10, [0.8]),
    corners(5, 0, 15, 10, [0.7]),
  ]);
  const kept = decode(data, dims, box, 0.3, 0.45);
  check(
    'a box covering one already taken goes, and one merely near it stays',
    kept.map((b) => [b.x, sure(b)]),
    [
      [0, 0.9],
      [5, 0.7],
    ],
  );
}

{
  const two = [
    { x: 0, y: 0, w: 10, h: 10, score: 0.9, name: 'ball' },
    { x: 0, y: 0, w: 10, h: 10, score: 0.8, name: 'target' },
  ];
  check('two classes over the same pixels are two things', suppress(two, 0.45).length, 2);
}

// The training frames were cut by width, portrait ones included, so a phone's
// portrait recording must be cut the same way, not by its long side.
check('a portrait frame is cut to the training width, not its height', cutSize(1080, 1920), {
  w: 640,
  h: 1138,
});
check('a frame no wider than the cut is drawn as it is, not enlarged', cutSize(480, 854), null);

{
  // Training draws a 720 by 1280 frame 640 tall, so 320 input pixels are 640 frame pixels.
  const near = windowAround(700, 20, 720, 1280, 320);
  check('a window at a corner of the frame stays centred and reaches past the frame', near, {
    x: 380,
    y: -300,
    w: 640,
    h: 640,
  });
}

{
  const [w, h, side, overlap] = [720, 1280, 320, 96];
  const grid = tiles(w, h, side, overlap);
  const inside = (b: { x: number; y: number; w: number; h: number }, t: (typeof grid)[number]) =>
    b.x >= t.x && b.y >= t.y && b.x + b.w <= t.x + t.w && b.y + b.h <= t.y + t.h;
  // A plate up to the overlap across, in input pixels at the training scale, anywhere in the frame.
  const plate = (overlap * Math.max(w, h)) / 640;
  const lost = [];
  for (let y = 0; y + plate <= h; y += 7) {
    for (let x = 0; x + plate <= w; x += 7) {
      if (!grid.some((t) => inside({ x, y, w: plate, h: plate }, t))) lost.push([x, y]);
    }
  }
  check('the tiles hold every plate up to the overlap whole in one of them', lost, []);
  check(
    'and stay inside the frame',
    grid.every((t) => t.x >= 0 && t.y >= 0 && t.x + t.w <= w + 1e-6 && t.y + t.h <= h + 1e-6),
    true,
  );
}

{
  const [w, h] = [720, 1280];
  const corner = { x: 0, y: 0, w: 360, h: 360 };
  const middle = { x: 180, y: 460, w: 360, h: 360 };
  check(
    "a box on the frame's own edge stays, and one a tile cut at an inner edge goes",
    [
      cutByTile({ x: 0, y: 0, w: 40, h: 40 }, corner, w, h),
      cutByTile({ x: 340, y: 100, w: 40, h: 40 }, corner, w, h),
      cutByTile({ x: 300, y: 600, w: 40, h: 40 }, middle, w, h),
      cutByTile({ x: 181, y: 600, w: 40, h: 40 }, middle, w, h),
    ],
    [false, true, false, true],
  );
}

check(
  'a box found in a window of a frame drawn at the cut width comes back in frame pixels',
  at(
    fromArea(
      { x: 32, y: 64, w: 16, h: 16, score: 0.9, name: 'ball' },
      { x: 360, y: 200, w: 360, h: 360 },
      640 / 720,
    ),
  ),
  [396, 272, 18, 18],
);
