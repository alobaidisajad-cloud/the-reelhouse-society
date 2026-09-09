/**
 * theRankBadgeIsReadable.test.ts — each rank's word, on the ground it is on.
 * ─────────────────────────────────────────────────────────────────────────────
 * `textContrast.test.ts` skips any style that paints its own background and
 * says so out loud: "verify those by hand when you touch them." This is that
 * verification, kept as a number rather than as a memory of having checked.
 *
 * ── THE HOLE THIS VERSION CLOSES ────────────────────────────────────────────
 * The first version measured each rank's INK against its ground and passed. It
 * did not measure the OPACITY the component applied on top: the Archivist's
 * word carried `opacity: 0.82`, which composites to 4.35:1 — under the 4.5
 * eight-point type needs. The guard tested the colour and the component drew
 * something dimmer, so it reported a pass on a real failure.
 *
 * The lesson generalises past this file: **a colour is not what renders.** What
 * renders is the colour composited through every opacity between it and the
 * page. So this reads the COMPONENT for any opacity on a word and folds it in —
 * and fails if it cannot find the styles it means to be checking.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { colors } from '@/src/theme/theme';
import { STAMP_CRIMSON, STAMP_INK_AUTEUR, STAMP_INK_ARCHIVIST } from '@/src/theme/stamp';

const BADGE = readFileSync(join(__dirname, '..', 'RankBadge.tsx'), 'utf8');

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

/** `rgba(...)` or a hex at an alpha, composited over an opaque ground. */
function over(colour: string, alpha: number, under: string): string {
  let rgb: number[];
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s]+([\d.]+))?\s*\)/.exec(colour);
  if (m) {
    rgb = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (m[4] !== undefined) alpha *= Number(m[4]);
  } else {
    const h = colour.replace('#', '');
    rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const base = under.replace('#', '');
  const out = [0, 2, 4].map((i, n) => {
    const u = parseInt(base.slice(i, i + 2), 16);
    return Math.round(rgb[n] * alpha + u * (1 - alpha));
  });
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The opacity the COMPONENT puts on a rank's word, read out of its stylesheet.
 * Absent means 1 — but an unreadable stylesheet must not silently mean 1 too,
 * which is what `wordOpacityOr` exists to prevent.
 */
function wordOpacity(styleName: string): number | null {
  const block = new RegExp(`${styleName}:\\s*\\{([^}]*)\\}`).exec(BADGE);
  if (!block) return null;
  const op = /opacity:\s*([\d.]+)/.exec(block[1]);
  return op ? Number(op[1]) : 1;
}

const PAGE = colors.ink;

const CASES = [
  {
    rank: 'Auteur',
    ink: STAMP_INK_AUTEUR,
    style: 'wordAuteur',
    // A wash over the page, so the ground is lighter than the page itself.
    ground: over(STAMP_CRIMSON[0], 1, PAGE),
  },
  {
    rank: 'Archivist',
    ink: STAMP_INK_ARCHIVIST,
    style: 'wordArchivist',
    // NO wash. Ink on paper — which is the hierarchy, and also what lifted this
    // rank's word off the 4.35:1 the opacity was costing it.
    ground: PAGE,
  },
];

describe('each rank’s word is readable on the ground it actually sits on', () => {
  it('can read the component’s own styles', () => {
    // Vacuous-guard insurance. Every case below folds in an opacity read from
    // that file; if the read broke, they would all quietly measure 1.
    expect(BADGE.length).toBeGreaterThan(1000);
    for (const c of CASES) expect(wordOpacity(c.style)).not.toBeNull();
  });

  it.each(CASES)('$rank — clears AA with the component’s own opacity folded in', (c) => {
    const alpha = wordOpacity(c.style) as number;
    const rendered = over(c.ink, alpha, c.ground);
    const ratio = contrast(rendered, c.ground);
    expect(`${c.rank}: ink ${c.ink} at ${alpha} on ${c.ground} → ${ratio.toFixed(2)}:1`).toContain(':1');
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('records the defect precisely: it took the wash AND the opacity together', () => {
    /**
     * The Archivist's word used to be sepia at 0.82 ON A BRASS WASH, and that
     * pair measured 4.35:1. Neither half does it alone:
     *
     *   0.82 on the wash        4.35   ← what shipped, and failed
     *   0.82 on the plain page  4.53   ← the dimming alone is survivable
     *   1.00 on the plain page  6.24   ← what it is now
     *
     * Worth pinning as three numbers rather than one, because I first wrote
     * this assertion from a memory of "4.35" without re-deriving which GROUND
     * it was against — and it failed, correctly, on a mark that was fine. A
     * contrast figure means nothing without the surface it was measured on.
     */
    const OLD_WASH = 'rgba(184, 137, 26, 0.06)';
    const oldGround = over(OLD_WASH, 1, PAGE);

    expect(contrast(over(STAMP_INK_ARCHIVIST, 0.82, oldGround), oldGround)).toBeLessThan(4.5);
    expect(contrast(over(STAMP_INK_ARCHIVIST, 0.82, PAGE), PAGE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(over(STAMP_INK_ARCHIVIST, 1, PAGE), PAGE)).toBeGreaterThan(6);
  });

  it('the Auteur’s wash stays lighter than a censure’s', () => {
    // `crimsonFaint` at 0.10 is what a WITHHELD filing wears. A rank at or above
    // it would let the house's highest honour read, at a glance, as its censure
    // — both being a tilted, crimson-edged box of about one line.
    const alphaOf = (rgba: string) => Number(/([\d.]+)\s*\)$/.exec(rgba.trim())![1]);
    expect(alphaOf(STAMP_CRIMSON[0])).toBeLessThan(alphaOf(colors.crimsonFaint));
  });

  it('and only the Auteur is framed', () => {
    // The hierarchy is carried by a difference of KIND. If the Archivist ever
    // gains a frame or the Auteur loses one, the ranks are two colours again.
    expect(BADGE).toMatch(/frame:\s*\{[^}]*borderWidth/);
    expect(BADGE).toMatch(/plate:\s*\{[^}]*borderWidth/);
    const archivist = /ruleArchivist:\s*\{([^}]*)\}/.exec(BADGE);
    expect(archivist).not.toBeNull();
    expect(archivist![1]).toMatch(/borderWidth/);
    // …and no wash behind it.
    expect(BADGE).not.toMatch(/STAMP_BRASS/);
  });

  it('the measurement can fail', () => {
    // Proving the instrument. Grey on brass is the pairing brass.ts names as
    // the one that "fails contrast while looking fine in a mockup".
    expect(contrast(colors.fog, over('rgba(184,137,26,0.9)', 1, PAGE))).toBeLessThan(4.5);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBe(1);
    expect(over('#FFFFFF', 1, '#000000')).toBe('#ffffff');
    expect(over('#FFFFFF', 0, '#000000')).toBe('#000000');
    // And the opacity reader must actually read one.
    expect(wordOpacity('nothingCalledThis')).toBeNull();
  });
});
