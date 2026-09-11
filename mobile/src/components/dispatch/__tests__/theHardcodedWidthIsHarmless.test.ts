/**
 * theHardcodedWidthIsHarmless.test.ts — a dead parameter, pinned as dead.
 * ─────────────────────────────────────────────────────────────────────────────
 * Four screens pass a HARDCODED width into PaperPost rather than the device's:
 *
 *   app/(tabs)/dispatch.tsx        columnWidth(390)
 *   app/dispatch/archive.tsx       columnWidth(390)
 *   app/dispatch/room/[username]   columnWidth(390)
 *   app/dispatch/[id].tsx          measure(390)   <- a DIFFERENT function
 *
 * That looks like a layout bug on every phone that is not 390 points wide, and
 * on an iPad. It is not, today, and this test is the proof rather than my word:
 * the only thing `measureWidth` reaches in PaperPost is `stillHeight`, and
 * `stillHeight` saturates at its 108 cap for every width any device reports.
 * The number passed in genuinely does not matter.
 *
 * ── SO WHY A TEST FOR SOMETHING THAT IS FINE ────────────────────────────────
 * Because it is one edit away from not being fine. Raise the cap, or change the
 * 0.5625, and those four screens start drawing stills sized for a phone nobody
 * is holding — silently, since nothing else consumes the prop. This fails the
 * moment that stops being true, and says where to look.
 */
import { columnWidth, measure, stillHeight } from '../paper/paperMetrics';

/** Every width a real device reports, small phone to tablet. */
const WIDTHS = [320, 344, 360, 375, 390, 393, 402, 414, 428, 430, 744, 768, 1024, 1366];

describe('the hardcoded 390 cannot change what a member sees', () => {
  it('stillHeight is the SAME at every device width, by both measures', () => {
    const heights = new Set<number>();
    for (const w of WIDTHS) {
      heights.add(stillHeight(measure(w)));
      heights.add(stillHeight(columnWidth(w)));
    }
    // One value across the whole range: the cap is doing all the work, so
    // passing 390 instead of the real width is not observable.
    expect([...heights]).toEqual([108]);
  });

  it('the cap is what saturates it — not a coincidence of these numbers', () => {
    // Below the saturation point the ratio governs and the width WOULD matter.
    // Naming the threshold here is what makes the test above meaningful rather
    // than a lucky table of inputs.
    expect(stillHeight(100)).toBe(56);
    expect(stillHeight(192)).toBe(108);
    expect(stillHeight(1000)).toBe(108);
  });

  it('the narrowest column any supported width produces still saturates', () => {
    // The real margin of safety: the smallest measure across the whole range
    // has to stay above the saturation point, or one device starts differing.
    const narrowest = Math.min(...WIDTHS.map((w) => columnWidth(w)));
    expect(narrowest).toBeGreaterThan(192);
  });
});
