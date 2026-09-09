/**
 * theRankBadgeIsReadable.test.ts — ink on a stamp's ground.
 * ─────────────────────────────────────────────────────────────────────────────
 * `textContrast.test.ts` skips any style that paints its own background, and
 * says so out loud: "A style that paints its own background is measured against
 * that background, which this scan cannot resolve — so it is skipped rather
 * than guessed at. Verify those by hand when you touch them."
 *
 * This is that verification, kept as a number rather than a memory of having
 * checked. It also holds the reason the profile's original stamp had to change:
 * that style painted its word in `colors.crimson`, which on this ground is
 * 3.16:1 — over the app's own 3:1 floor, and under the 4.5 that eight-point
 * type needs. The Ledger had already split the token for exactly this case
 * ("crimson for MARKS, crimsonInk for WORDS"), and the mark now uses the ink.
 *
 * The ground is a WASH over near-black, not a solid, so the worst case is the
 * HEAD of the gradient — the lightest point, where the rank's own pigment is
 * strongest and the contrast with dark ink is least.
 */
import { colors } from '@/src/theme/theme';
import {
  STAMP_CRIMSON, STAMP_BRASS, STAMP_INK_AUTEUR, STAMP_INK_ARCHIVIST,
} from '@/src/theme/stamp';

/** WCAG relative luminance of an opaque #rrggbb. */
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

/** `rgba(r, g, b, a)` → the opaque colour it composites to over `under`. */
function flatten(rgba: string, under: string): string {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s]+([\d.]+))?\s*\)/.exec(rgba);
  if (!m) throw new Error(`not an rgba(): ${rgba}`);
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const a = m[4] === undefined ? 1 : Number(m[4]);
  const base = under.replace('#', '');
  const out = [0, 2, 4].map((i, n) => {
    const u = parseInt(base.slice(i, i + 2), 16);
    return Math.round([r, g, b][n] * a + u * (1 - a));
  });
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** What the page is actually made of behind the mark. */
const PAGE = colors.ink;

const CASES = [
  { rank: 'Auteur', wash: STAMP_CRIMSON, ink: STAMP_INK_AUTEUR },
  { rank: 'Archivist', wash: STAMP_BRASS, ink: STAMP_INK_ARCHIVIST },
];

describe('the rank mark is readable on its own ground', () => {
  it.each(CASES)('$rank — its word clears AA at the wash’s lightest point', ({ wash, ink }) => {
    // The head of the gradient: the strongest pigment, the least contrast.
    const ground = flatten(wash[0], PAGE);
    const ratio = contrast(ink, ground);
    expect(`ground ${ground} → ${ratio.toFixed(2)}:1`).toContain(':1');
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it.each(CASES)('$rank — and at every other stop of the wash', ({ wash, ink }) => {
    const failing = wash
      .map((stop) => ({ stop, r: contrast(ink, flatten(stop, PAGE)) }))
      .filter(({ r }) => r < 4.5);
    expect(failing).toEqual([]);
  });

  it('records why the profile’s original word could not be kept', () => {
    // `colors.crimson` as the WORD, which is what tierStamp used to paint.
    const ground = flatten(STAMP_CRIMSON[0], PAGE);
    const asPigment = contrast(colors.crimson, ground);
    const asInk = contrast(colors.crimsonInk, ground);
    expect(asPigment).toBeLessThan(4.5);      // why it changed
    expect(asInk).toBeGreaterThanOrEqual(4.5); // what it changed to
    expect(asInk).toBeGreaterThan(asPigment);
  });

  /** The alpha of an `rgba(...)`, which is what "how heavy is this wash" means. */
  const alphaOf = (rgba: string) => Number(/([\d.]+)\s*\)$/.exec(rgba.trim())![1]);

  it('a censure is a heavier crimson field than any rank', () => {
    // `crimsonFaint` at 0.10 is the wash a WITHHELD filing wears. A rank at or
    // above it would let the house's highest honour read, at a glance, as its
    // censure — both being a tilted, crimson-edged box of about one line.
    //
    // This caught the first draft, which set the crimson head at 0.16 while its
    // own comment claimed the value stayed "well under the ten". The comment
    // was written from the intention, not from the number.
    expect(alphaOf(STAMP_CRIMSON[0])).toBeLessThan(alphaOf(colors.crimsonFaint));
    expect(alphaOf(STAMP_BRASS[0])).toBeLessThan(alphaOf(colors.crimsonFaint));
  });

  it('and an Auteur is a heavier impression than an Archivist', () => {
    // The hierarchy, carried by the medium rather than by a second shape. If
    // these ever cross, the lesser rank becomes the louder mark.
    expect(alphaOf(STAMP_CRIMSON[0])).toBeGreaterThan(alphaOf(STAMP_BRASS[0]));
    // Both wash down to the same ground — that is the point of it being the
    // page's own ink — so only the heads are compared.
    expect(STAMP_CRIMSON[STAMP_CRIMSON.length - 1]).toBe(STAMP_BRASS[STAMP_BRASS.length - 1]);
  });

  it('the measurement can fail', () => {
    // Proving the instrument. Grey on brass is the pairing brass.ts names as
    // the one that "fails contrast while looking fine in a mockup"; if this
    // maths cannot see it, none of the numbers above mean anything.
    expect(contrast(colors.fog, flatten('rgba(184,137,26,0.9)', PAGE))).toBeLessThan(4.5);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBe(1);
    expect(flatten('rgba(255, 255, 255, 1)', '#000000')).toBe('#ffffff');
    expect(flatten('rgba(255, 255, 255, 0)', '#000000')).toBe('#000000');
  });
});
