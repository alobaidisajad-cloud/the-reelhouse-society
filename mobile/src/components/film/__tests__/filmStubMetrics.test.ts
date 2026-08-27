/**
 * The docked stub's geometry — DERIVED, and proved to be derived.
 *
 * ── WHY THESE ASSERTIONS DO NOT HARDCODE A NUMBER ───────────────────────────
 * A docked control and the scroll that reserves room for it are two numbers
 * that must agree for ever. A test that asserts `dockHeight(34) === 97` passes
 * just as happily when someone changes the plate to 60 and forgets the scroll:
 * it fails, someone updates the 97, and the two constants are now out of step
 * with a green suite. So every expectation below is RE-DERIVED from the parts,
 * and the relationships are what is pinned.
 */
import {
  STUB_HEIGHT, STUB_PAD_TOP, STUB_BORDER,
  dockHeight, scrollReserve, trayMaxHeight, TRAY_MAX_RATIO,
} from '../filmStubMetrics';

describe('the dock is made of its parts', () => {
  it.each([0, 16, 34, 48])('at a %ipt inset it is exactly its own pieces', (inset) => {
    expect(dockHeight(inset)).toBe(
      STUB_PAD_TOP + STUB_HEIGHT + Math.max(inset, 16) + STUB_BORDER,
    );
  });

  it('holds the plate off the glass on a phone with no home indicator', () => {
    // An inset of 0 would sit the brass flush against the bottom edge, which
    // reads as a rendering fault rather than a design.
    expect(dockHeight(0)).toBe(dockHeight(16));
    expect(dockHeight(0)).toBeGreaterThan(STUB_PAD_TOP + STUB_HEIGHT);
  });

  it('grows with a taller inset, never shrinks', () => {
    expect(dockHeight(48)).toBeGreaterThan(dockHeight(34));
    expect(dockHeight(34)).toBeGreaterThan(dockHeight(0));
  });
});

describe('the scroll reserves the dock', () => {
  it.each([0, 16, 34, 48])('always clears it at a %ipt inset', (inset) => {
    // The relationship is the point: whatever the dock becomes, the page
    // reserves at least that much, so the last line can never hide under it.
    expect(scrollReserve(inset)).toBeGreaterThan(dockHeight(inset));
  });

  it('leaves breathing room rather than ending flush on the hairline', () => {
    expect(scrollReserve(34) - dockHeight(34)).toBeGreaterThanOrEqual(16);
  });
});

describe('the tray is capped against the LIVE screen', () => {
  /**
   * The measurement that forced this: at 390x844 the tray is 559pt and fits
   * with 285 to spare. On an iPhone SE at Dynamic Type 1.35 it is 751pt on a
   * 667pt screen, and the head, the film's title and the primary LOG row are
   * pushed off the top. A cap taken from a hardcoded 844 would not have helped
   * an SE at all — it has to come from the window.
   */
  it('never exceeds the screen it is on', () => {
    for (const h of [667, 736, 812, 844, 926, 1024]) {
      expect(trayMaxHeight(h)).toBeLessThan(h);
    }
  });

  it('leaves the page visible above it, on the smallest screen too', () => {
    const SE = 667;
    expect(SE - trayMaxHeight(SE)).toBeGreaterThanOrEqual(80);
  });

  it('is a ratio of the window, not a constant', () => {
    // If this ever stops varying with the screen, the SE bug is back.
    expect(trayMaxHeight(844)).not.toBe(trayMaxHeight(667));
    expect(trayMaxHeight(844)).toBe(Math.round(844 * TRAY_MAX_RATIO));
  });

  it('clears the measured worst case: 751pt of tray at 1.35 on an SE', () => {
    // The cap must bite there — that is the whole reason it exists.
    expect(trayMaxHeight(667)).toBeLessThan(751);
  });
});
