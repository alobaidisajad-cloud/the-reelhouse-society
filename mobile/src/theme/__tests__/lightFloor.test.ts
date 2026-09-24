/**
 * THE LIGHT NEVER OUTSHINES THE INK.
 * ──────────────────────────────────────────────────────────────────────────
 * Each room's lamp is warm light laid over the house, under the content,
 * brightest at the centre of its pool. That lifts the ground a word sits on —
 * and every word-ink in the theme is proven against `surfaceRaised`, the
 * lightest of the five grounds. So no lamp, at full strength, may lift the
 * page above raised at its brightest point.
 *
 * The Lobby's lamp was drawn at 0.13 in the approved mockups and failed this:
 * its crown came out at L* 13.9 against raised's 12.7, and crimsonInk fell to
 * 4.47:1 there. The cap is not a taste call. It is where the light stops.
 */
import { colors } from '../theme';
import { BLOOM, LAMPS, POOL, bloomMatrix } from '../light';

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (c: number[]) => {
  const s = c.map((v) => {
    const u = v / 255;
    return u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
};
const ratio = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const HOUSE = rgb(colors.ink);
const RAISED = rgb(colors.surfaceRaised);
const WORD_INKS = [colors.fogQuiet, colors.fog, colors.sepia, colors.crimsonInk, colors.validationInk, colors.rustInk, colors.bone];

/** The page at the centre of a lamp's pool: the house with the light laid on it. */
const crown = (lampRgb: readonly number[], strength: number) =>
  HOUSE.map((v, i) => lampRgb[i] * strength + v * (1 - strength));

describe('the light never outshines the ink', () => {
  it.each(Object.entries(LAMPS))('%s: the brightest point of the pool is no lighter than raised', (_, lamp) => {
    expect(lum(crown(lamp.rgb, lamp.strength))).toBeLessThanOrEqual(lum(RAISED));
  });

  it.each(Object.entries(LAMPS))('%s: every word-ink still clears 4.5:1 there', (_, lamp) => {
    const g = crown(lamp.rgb, lamp.strength);
    for (const ink of WORD_INKS) expect(ratio(rgb(ink), g)).toBeGreaterThanOrEqual(4.5);
  });

  it('dims a lamp that hangs from a photograph’s hem, never brightens it', () => {
    expect(POOL.underHero).toBeLessThanOrEqual(1);
  });
});

describe('the bloom is the approved filter, and stays nearly colourless', () => {
  const m = bloomMatrix();
  const apply = (c: number[]) => [0, 1, 2].map((r) => m[r * 5] * c[0] + m[r * 5 + 1] * c[1] + m[r * 5 + 2] * c[2]);

  it('keeps a grey grey-ish and white near white (a colour filter, not a tint)', () => {
    const w = apply([255, 255, 255]);
    for (const ch of w) expect(ch).toBeGreaterThan(235);
  });

  it('takes most of the colour out of a saturated poster — the olive-page trap', () => {
    // A strong yellow poster washed a whole page olive at real saturation.
    const [r, g, b] = apply([230, 200, 20]);
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    expect(spread).toBeLessThan((230 - 20) * 0.5);
  });

  it('matches CSS saturate() then sepia() on a known colour', () => {
    // Composed independently: saturate(0.28) first, then sepia(0.25), per the
    // Filter Effects spec matrices — the order the mockups used.
    const sat = (c: number[], s: number) => [
      (0.213 + 0.787 * s) * c[0] + (0.715 - 0.715 * s) * c[1] + (0.072 - 0.072 * s) * c[2],
      (0.213 - 0.213 * s) * c[0] + (0.715 + 0.285 * s) * c[1] + (0.072 - 0.072 * s) * c[2],
      (0.213 - 0.213 * s) * c[0] + (0.715 - 0.715 * s) * c[1] + (0.072 + 0.928 * s) * c[2],
    ];
    const sep = (c: number[], a: number) => {
      const k = 1 - a;
      return [
        (0.393 + 0.607 * k) * c[0] + (0.769 - 0.769 * k) * c[1] + (0.189 - 0.189 * k) * c[2],
        (0.349 - 0.349 * k) * c[0] + (0.686 + 0.314 * k) * c[1] + (0.168 - 0.168 * k) * c[2],
        (0.272 - 0.272 * k) * c[0] + (0.534 - 0.534 * k) * c[1] + (0.131 + 0.869 * k) * c[2],
      ];
    };
    const c = [200, 60, 30];
    const want = sep(sat(c, BLOOM.saturate), BLOOM.sepia);
    const got = apply(c);
    for (let i = 0; i < 3; i++) expect(got[i]).toBeCloseTo(want[i], 6);
  });

  it('is a tenth of the light, feathered to nothing', () => {
    expect(BLOOM.opacity).toBeLessThanOrEqual(0.12);
    expect(BLOOM.mask[BLOOM.mask.length - 1][1]).toBe(0);
  });
});
