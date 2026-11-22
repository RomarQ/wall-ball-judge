import { describe, expect, it } from 'vitest';
import { desktopShrink } from '../src/desktop-site';

describe('a desktop site on a phone', () => {
  it('finds the 980 px layout that Brave gives a phone set to the desktop site', () => {
    const shrink = desktopShrink({
      width: 980,
      screen: { width: 412, height: 919 },
      landscape: false,
      touch: true,
    });
    expect(shrink).toBeCloseTo(2.38, 2);
  });

  it('leaves alone an iPhone turned on its side, whose screen stays in portrait', () => {
    expect(
      desktopShrink({ width: 844, screen: { width: 390, height: 844 }, landscape: true, touch: true }),
    ).toBeNull();
  });

  it('leaves alone a computer, however far its page is zoomed out', () => {
    expect(
      desktopShrink({ width: 2560, screen: { width: 1280, height: 800 }, landscape: true, touch: false }),
    ).toBeNull();
  });
});
