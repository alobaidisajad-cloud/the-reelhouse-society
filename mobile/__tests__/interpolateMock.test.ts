/**
 * interpolateMock.test.ts — a stub that returns its input is not neutral.
 *
 * ── WHAT HAPPENED ────────────────────────────────────────────────────────────
 * The reanimated mock had `interpolate: (v) => v`. It looks harmless: no
 * throw, no crash, "animation just doesn't run in a test". It is not harmless.
 * It hands back the SCROLL OFFSET where the mapped VALUE belongs, so every
 * resting style resolves to whatever the input happens to be.
 *
 * The film page's backdrop is
 *
 *     opacity: interpolate(scrollY, [0, h * 0.6], [1, 0.3], CLAMP)
 *
 * which at rest is 1 — fully opaque. The stub returned 0. The backdrop was
 * INVISIBLE in every render, and so was the floating back button, which uses
 * the same shape. Nothing failed, because the sibling transform is
 * `translateY(0)` at rest and 0 is also what the stub returned — the one value
 * where a wrong answer and the right answer agree.
 *
 * This guard pins the real behaviour: the map, both extrapolation modes, and
 * the exact call that was silently wrong.
 */
const { interpolate, Extrapolation } = require('react-native-reanimated');

describe('the interpolate mock computes rather than echoes', () => {
  it('maps a value across one segment', () => {
    expect(interpolate(0.5, [0, 1], [0, 100])).toBeCloseTo(50);
    expect(interpolate(0, [0, 1], [10, 20])).toBeCloseTo(10);
    expect(interpolate(1, [0, 1], [10, 20])).toBeCloseTo(20);
  });

  it('walks a multi-segment range', () => {
    // Three stops, so the middle segment must be found rather than assumed.
    expect(interpolate(75, [0, 50, 100], [0, 10, 0])).toBeCloseTo(5);
    expect(interpolate(25, [0, 50, 100], [0, 10, 0])).toBeCloseTo(5);
  });

  it('clamps when asked and extends when not', () => {
    expect(interpolate(-40, [0, 100], [0, 100], Extrapolation.CLAMP)).toBe(0);
    expect(interpolate(400, [0, 100], [0, 100], Extrapolation.CLAMP)).toBe(100);
    // `extend` is reanimated's default: the end segment continues past the range.
    expect(interpolate(200, [0, 100], [0, 100])).toBeCloseTo(200);
  });

  it('is opaque at rest — the case that was invisible', () => {
    const backdropHeight = 548.6;
    const atRest = interpolate(0, [0, backdropHeight * 0.6], [1, 0.3], Extrapolation.CLAMP);
    expect(atRest).toBe(1);
    // And it still fades, so the guard cannot pass by returning a constant.
    expect(interpolate(backdropHeight * 0.6, [0, backdropHeight * 0.6], [1, 0.3], Extrapolation.CLAMP))
      .toBeCloseTo(0.3);
  });

  it('leaves a call it cannot map alone rather than inventing one', () => {
    expect(interpolate(7)).toBe(7);
    expect(interpolate(7, [0, 1])).toBe(7);
  });
});
