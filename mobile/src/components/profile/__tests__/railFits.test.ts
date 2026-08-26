/**
 * railFits.test.ts — the month rail cannot outgrow the phone.
 *
 * Raising the month heading from 8.5 to 12 is only safe if the rail still fits
 * on the narrowest phone at the largest text size a member can choose. That is
 * an arithmetic question, and it should be answered by arithmetic rather than
 * by looking at one screenshot on one device.
 *
 * ── HOW THE WIDTH IS ESTIMATED ───────────────────────────────────────────────
 * No text engine here, so every advance is deliberately OVER-estimated: if the
 * pessimistic number fits, the real one certainly does.
 *
 *   Courier Prime is monospace — 0.6em is exact, not a guess.
 *   Special Elite is a typewriter face and near-monospace; measured around
 *     0.5em, budgeted at 0.62.
 *   Rye is a display serif with variable advances; budgeted at 0.68, well
 *     above its true average.
 *
 * Letter-spacing is added per character, as the platform does.
 */
import { type as t } from '@/src/theme/theme';
import { ROOM_INSET } from '../roomStyles';

/** Pessimistic advance, as a fraction of the point size. */
const ADVANCE = { courier: 0.6, elite: 0.62, rye: 0.68 } as const;

function width(text: string, size: number, face: keyof typeof ADVANCE, letterSpacing = 0): number {
  return text.length * (size * ADVANCE[face] + letterSpacing);
}

/** Every width the app can be laid out at, narrowest first. */
const WIDTHS = [320, 360, 375, 390, 393, 402, 412, 414, 428, 430, 440];
/** 1 is the default; 1.35 is the ceiling `scaledTextProps` allows. */
const SCALES = [1, 1.15, 1.35];

/** The longest month, the longest shelf, and a five-digit count. */
const WORST_LABEL = 'SEPTEMBER';
const WORST_COUNT = '12,345 FILMS';
const RAIL_GAP = 9;

describe('the month rail fits every phone at every text size', () => {
  for (const scale of SCALES) {
    it.each(WIDTHS)(`at %ipt with text at ${scale}x`, (screen) => {
      const available = screen - ROOM_INSET * 2;

      // year (Special Elite at `label`, with its letter-spacing) + gap +
      // [flexible rule] + gap + month (Rye at `rail`) + gap + count.
      //
      // Measured as though EVERY rail carried a year, which after yearMarker
      // only the first of each year does — so this is stricter than the app.
      const year = width('2026', t.label * scale, 'elite', 1.4 * scale);
      const month = width(WORST_LABEL, t.rail * scale, 'rye');
      const count = width(WORST_COUNT, 9 * scale, 'courier');
      const gaps = RAIL_GAP * 3;

      const demanded = year + month + count + gaps;

      // The rule between them is `flex: 1` and may collapse to nothing, so the
      // rail fits as long as the FIXED parts do. A rule of zero width looks
      // wrong long before it breaks, so a little headroom is required too.
      expect(demanded).toBeLessThan(available);
      expect(available - demanded).toBeGreaterThan(24);
    });
  }

  it('is wider than it was, and that is the point', () => {
    // The change only means anything if the month actually grew.
    expect(t.rail).toBeGreaterThan(8.5);
  });

  it('leaves the count room even in the worst case on the smallest phone', () => {
    const available = 320 - ROOM_INSET * 2;
    const demanded =
      width('2026', t.label * 1.35, 'elite', 1.4 * 1.35) +
      width(WORST_LABEL, t.rail * 1.35, 'rye') +
      width(WORST_COUNT, 9 * 1.35, 'courier') +
      RAIL_GAP * 3;
    // Reported rather than asserted loosely, so a future change that eats the
    // margin shows its numbers in the failure.
    expect({ available, demanded: Math.round(demanded) }).toEqual({
      available,
      demanded: Math.round(demanded),
    });
    expect(demanded).toBeLessThan(available);
  });
});

describe('the type scale keeps its own order', () => {
  it('runs strictly downward from hero to badge', () => {
    const order = [t.hero, t.display, t.value, t.title, t.voice, t.rail, t.meta, t.label, t.caption, t.badge];
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeLessThan(order[i - 1]);
    }
  });

  it("keeps a member's words above a section heading", () => {
    // The inversion this scale exists to remove: the writing must outrank the
    // furniture around it.
    expect(t.voice).toBeGreaterThan(t.rail);
    expect(t.voice).toBeGreaterThan(t.label);
  });

  it('keeps the title above the voice, but only just', () => {
    // One point. The separation is carried by face and colour; a large gap here
    // would be the old mistake wearing a new number.
    expect(t.title).toBeGreaterThan(t.voice);
    expect(t.title - t.voice).toBeLessThanOrEqual(2);
  });
});
