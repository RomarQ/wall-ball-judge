/**
 * Checks which touches name a point on the picture, and what a touch on the target takes.
 *
 * Run: npm test
 */
import { grabPlate, removeSpot } from '../src/placement';
import { pointOnFrame, tapPlaces } from '../src/target-drag';
import { expect, it } from 'vitest';
// Values are captured as the check is written, the way the old runner compared them at once.
const check = (name: string, actual: unknown, expected: unknown) => {
  const [got, want] = [JSON.stringify(actual), JSON.stringify(expected)];
  it(name, () => expect(got).toBe(want));
};

// A portrait clip in the judge's viewport, as a phone measured it: the video
// element is 370 wide and the picture inside it 150, leaving 110 of band on
// each side. The camera letterboxes the other way, band above and below.
const portrait = { left: 121, top: 197, width: 150, height: 266 };
const camera = { left: 11, top: 226, width: 370, height: 208 };

check('a touch on the picture gives where it landed', pointOnFrame(portrait, 196, 330), {
  x: 0.5,
  y: 0.5,
});
check('a touch on the band beside the picture gives nothing', pointOnFrame(portrait, 289, 330), null);
check('and so does one above the picture', pointOnFrame(camera, 196, 200), null);
check('the picture takes its own edges', pointOnFrame(portrait, 271, 197), { x: 1, y: 0 });

// The finder placed the next lane's plate, and the judge taps the athlete's own.
check(
  'before the set starts, a tap away from the placed plates adds one there',
  tapPlaces({ armed: false, placed: true, tapToPlace: false }),
  true,
);
check(
  'once the set runs, a stray tap adds nothing, until a search comes back empty',
  [
    tapPlaces({ armed: true, placed: true, tapToPlace: false }),
    tapPlaces({ armed: true, placed: true, tapToPlace: true }),
  ],
  [false, true],
);

// A plate in frame units, and a smaller one just below and to its left, its corner inside the reach of the first.
const men = { x: 0.3, y: 0.1, w: 0.07, h: 0.07 };
const women = { x: 0.26, y: 0.16, w: 0.04, h: 0.04 };
// A fingertip on a picture painted 600 px tall.
const reach = 24 / 600;
check(
  'a grab takes a plate by its corner to size it, by its body to move it, and misses bare wall',
  [
    grabPlate([men], { x: 0.37, y: 0.17 }, reach),
    grabPlate([men], { x: 0.31, y: 0.11 }, reach),
    grabPlate([men], { x: 0.6, y: 0.5 }, reach),
  ],
  [{ index: 0, part: 'resize' }, { index: 0, part: 'move' }, null],
);
check(
  'the corner of one plate wins over the edge of the other',
  grabPlate([men, women], { x: 0.3, y: 0.2 }, reach),
  { index: 1, part: 'resize' },
);
check(
  'a grab in the middle of a box smaller than a fingertip moves it',
  grabPlate([{ x: 0.3, y: 0.1, w: 0.03, h: 0.03 }], { x: 0.315, y: 0.115 }, reach),
  { index: 0, part: 'move' },
);
check(
  'a remove button takes a grab only while the target is editable, and the plate moves otherwise',
  [
    grabPlate([men], removeSpot(men, reach), reach, true),
    grabPlate([men], removeSpot(men, reach), reach, false),
  ],
  [
    { index: 0, part: 'remove' },
    { index: 0, part: 'move' },
  ],
);
