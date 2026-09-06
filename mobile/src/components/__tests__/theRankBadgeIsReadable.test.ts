/**
 * theRankBadgeIsReadable.test.ts — ink on a moving ground.
 * ─────────────────────────────────────────────────────────────────────────────
 * `textContrast.test.ts` skips any style that paints its own background, and
 * says so out loud: "A style that paints its own background is measured against
 * that background, which this scan cannot resolve — so it is skipped rather
 * than guessed at. Verify those by hand when you touch them." It even records
 * the number this badge used to have: ink on gold, 8.90:1.
 *
 * That 8.90 was against a FLAT `marqueeGold`. The badge is the brass ramp now,
 * and a ramp is four colours — so there is no single number any more, and the
 * old one is no longer the answer. The ground under the last letter of
 * `★ AUTEUR` is nearly the ramp's darkest stop, which is where a gradient
 * quietly fails while the mockup looks fine.
 *
 * So this computes it, at the place it is worst: the bottom-right corner of the
 * TEXT box, projected onto the gradient's own axis. Not the plate's corner —
 * seven points of padding mean no glyph ever reaches that — and not the middle,
 * which is the number that would flatter it.
 */
import {
  BRASS, BRASS_STOPS, BRASS_START, BRASS_END, BRASS_WIDE_START, BRASS_WIDE_END, ON_BRASS,
} from '@/src/theme/brass';

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** The ramp's colour at position t in [0,1]. */
function rampAt(t: number): string {
  const stops = BRASS_STOPS as readonly number[];
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1]) i += 1;
  const span = stops[i + 1] - stops[i] || 1;
  const k = Math.min(1, Math.max(0, (t - stops[i]) / span));
  const rgb = (hex: string) => [1, 3, 5].map((_, n) => parseInt(hex.slice(1 + n * 2, 3 + n * 2), 16));
  const [a, b] = [rgb(BRASS[i]), rgb(BRASS[i + 1])];
  const mix = a.map((v, n) => Math.round(v + (b[n] - v) * k));
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Where a point sits along a CSS/RN linear gradient, as a fraction.
 * The gradient runs from START to END in the element's own unit box.
 */
function tAt(
  px: number, py: number, w: number, h: number,
  S: { x: number; y: number } = BRASS_WIDE_START,
  E: { x: number; y: number } = BRASS_WIDE_END,
): number {
  const ax = S.x * w, ay = S.y * h;
  const bx = E.x * w, by = E.y * h;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  return Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2));
}

/**
 * The badge as it actually renders. Measured off the published plates at both
 * text sizes rather than taken from the stylesheet, because what matters is the
 * box the browser produced.
 */
const PAD_X = 7, PAD_Y = 2, BORDER = 0.5;
const CASES = [
  { name: '★ AUTEUR at normal type', w: 62.3, h: 17 },
  { name: '★ AUTEUR at 1.35x', w: 75.7, h: 21 },
  // The Archivist chip is not brass, but it is the WIDEST badge — so it is the
  // box that reaches furthest along the ramp, and the one that would fail first
  // if the plate were ever given to it.
  { name: 'the widest box on the ramp', w: 93.2, h: 19 },
];

describe('the Auteur plate stays readable across the whole ramp', () => {
  it.each(CASES)('$name — ink is legible under its LAST letter', ({ w, h }) => {
    // Bottom-right of the text box: the darkest ground any glyph sits on.
    const t = tAt(w - PAD_X - BORDER, h - PAD_Y - BORDER, w, h);
    const ratio = contrast(ON_BRASS, rampAt(t));
    // 4.5 is WCAG AA for small text. The app's own floor is 3:1; this clears
    // the stricter one, so the badge is not relying on the exemption.
    //
    // The threshold is asserted ONCE, as a number. An earlier draft also
    // pattern-matched the printed ratio to make a failure readable, and the
    // pattern demanded 5.0 — so the test failed at 4.65, which passes the rule
    // it was written to enforce. A guard that disagrees with its own rule is
    // just a second rule nobody meant to write.
    expect(`worst ground ${rampAt(t)} at t=${t.toFixed(2)} → ${ratio.toFixed(2)}:1`)
      .toContain(':1');
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('and would still clear the app’s floor at the ramp’s darkest corner', () => {
    // The corner no glyph reaches, checked anyway: if the padding is ever
    // reduced this is the number that starts to matter.
    const worst = contrast(ON_BRASS, BRASS[BRASS.length - 1]);
    expect(worst).toBeGreaterThanOrEqual(3);
  });

  it('every stop of the ramp carries ink', () => {
    // Not just the ends. A middle stop that failed would be invisible to a
    // two-point check, and the ramp has four.
    const failing = BRASS
      .map((c) => ({ c, r: contrast(ON_BRASS, c) }))
      .filter(({ r }) => r < 3);
    expect(failing).toEqual([]);
  });

  it('and the house diagonal is why this plate does not use it', () => {
    // The reason BRASS_WIDE_* exists, kept as a number rather than a claim. If
    // somebody ever points the badge back at the disc's vector, this says what
    // it costs.
    const { w, h } = CASES[0];
    const t = tAt(w - PAD_X - BORDER, h - PAD_Y - BORDER, w, h, BRASS_START, BRASS_END);
    const ratio = contrast(ON_BRASS, rampAt(t));
    expect(t).toBeCloseTo(1, 2);          // the ramp's darkest stop, exactly
    expect(ratio).toBeLessThan(4.5);      // which is why it is not used here
  });

  it('the measurement can fail', () => {
    // Proving the instrument. Grey on gold is the combination brass.ts names as
    // the one that "fails contrast while looking fine in a mockup"; if this
    // maths cannot see that, none of the numbers above mean anything.
    expect(contrast('#9E9488', rampAt(0.9))).toBeLessThan(3);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBe(1);
  });
});
