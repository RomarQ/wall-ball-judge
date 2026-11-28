/**
 * Checks which files a new service worker puts in its model cache for each file of the cache that it replaces.
 *
 * Run: npm test
 */
import { carriedOver, type Build } from '../src/carry-over';
import { expect, it } from 'vitest';

const hub = (revision: string, file: string) =>
  `https://huggingface.co/owner/detection/resolve/${revision}/${file}`;
const own = (file: string) => `https://app.test/models/${file}`;

// A build that loads its detectors from the Hub at v12, and offers v10 beside it.
const remote: Build = {
  origin: 'https://app.test',
  loads: [
    hub('v12', 'detector-320.tflite'),
    hub('v12', 'detector-640.tflite'),
    hub('v10', 'detector-320.tflite'),
  ],
  shipped: {
    'detector-320.tflite': hub('v12', 'detector-320.tflite'),
    'detector-640.tflite': hub('v12', 'detector-640.tflite'),
  },
};
// A build that serves every shipped model itself, as the site does.
const local: Build = {
  origin: 'https://app.test',
  loads: [own('pose_landmarker_full.task'), own('detector-320.tflite'), own('detector-640.tflite')],
  shipped: {
    'detector-320.tflite': own('detector-320.tflite'),
    'detector-640.tflite': own('detector-640.tflite'),
  },
};

it('fetches a detector of a dropped revision from where the build loads its own', () => {
  expect(carriedOver(hub('v11', 'detector-320.tflite'), remote)).toEqual([
    { address: hub('v12', 'detector-320.tflite'), copy: false },
  ]);
  expect(carriedOver(hub('v11', 'detector-320.tflite'), local)).toEqual([
    { address: own('detector-320.tflite'), copy: false },
  ]);
});

it('keeps the bytes of a revision that the settings offer, and fetches the shipped detector beside it', () => {
  expect(carriedOver(hub('v10', 'detector-320.tflite'), remote)).toEqual([
    { address: hub('v10', 'detector-320.tflite'), copy: true },
    { address: hub('v12', 'detector-320.tflite'), copy: false },
  ]);
});

it("fetches again a file of the app's own origin, whose bytes change with the build", () => {
  expect(carriedOver(own('detector-640.tflite'), local)).toEqual([
    { address: own('detector-640.tflite'), copy: false },
  ]);
});
