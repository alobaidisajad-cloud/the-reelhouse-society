/**
 * DOES THE RECORD FIT ON THE PLATE?
 *
 * The stub's record state is the busiest row in the app — a glyph, a tear, a
 * label, five reels, a date and a chevron, inside 375pt minus its insets — and
 * the reels do NOT scale with the type while the words do. So it runs out of
 * plate before anything warns you: the date clips, or the chevron is pushed
 * off the edge and the control loses its affordance.
 *
 * ── TWO THINGS THIS FILE FOUND ──────────────────────────────────────────────
 * 1. `SEEN ×2 · ★★★★☆ · JUL 21, 2026` overflows a 375pt screen at ORDINARY
 *    type. The stub now takes the short date — `JUL 21` — with the year only
 *    when the film was watched in a different one.
 * 2. At large type it overflows however short the date is, so above the app's
 *    comfortable range the date steps aside entirely.
 *
 * ── AND ONE THING THE FIRST VERSION OF THIS FILE GOT WRONG ──────────────────
 * It charged every state for a reel rail. Three of the five never draw one —
 * a film you have only shelved has no rating to show — so it condemned rows
 * that were never in trouble. The states are modelled properly below.
 *
 * Widths are estimated from the type's metrics, not measured; there is no text
 * engine here. The calibration test keeps the estimate honest.
 */
import { STUB_HEIGHT } from '../filmStubMetrics';

/** The narrowest phone the app supports. */
const SCREEN = 375;
const INNER = SCREEN - (20 * 2) - (17 + 14);
const FIXED = 15 /* glyph */ + 1 /* tear */ + 16 /* chevron */ + 10 * 5 /* gaps */;
const BUDGET = INNER - FIXED;

/** Special Elite is near-monospace; this is its advance at 1pt, plus tracking. */
const CHAR = 0.62;
const advance = (text: string, size: number, tracking: number, scale: number) =>
  text.length * (size * scale * CHAR + tracking);

/** ReelRating draws five reels at `size` with a small gap between them. */
const REEL_RAIL = 13 * 5 + 3 * 4;

function spare(opts: { label: string; reels: boolean; date: string | null; scale: number }) {
  const used = advance(opts.label, 11, 2, opts.scale)
    + (opts.reels ? REEL_RAIL : 0)
    + (opts.date ? advance(opts.date, 10, 1.2, opts.scale) : 0);
  return BUDGET - used;
}

/**
 * Every state the stub can be in, as it actually renders.
 *
 * The two date forms are the caller's: `JUL 21` for a film watched this year,
 * and the bare year for any other. Both are short, which is the whole reason
 * the busiest row survives. `×99` is the capped worst case for the count.
 */
const THIS_YEAR = 'JUL 21';
const OTHER_YEAR = '2025';
const STATES = [
  { name: 'seen',                  label: 'SEEN',             reels: true,  date: THIS_YEAR },
  { name: 'rewatched',             label: 'SEEN ×2',          reels: true,  date: THIS_YEAR },
  { name: 'rewatched, years ago',  label: 'SEEN ×99',         reels: true,  date: OTHER_YEAR },
  { name: 'abandoned',             label: 'ABANDONED',        reels: false, date: THIS_YEAR },
  { name: 'open / unseen',         label: 'NOT YET SEEN',     reels: false, date: null },
  { name: 'open / shelved',        label: 'ON THE WATCHLIST', reels: false, date: null },
];

describe('the estimator is worth trusting', () => {
  it('is tight on the worst case rather than showing acres of room', () => {
    // If this showed half the plate spare, every assertion below would be
    // measuring nothing.
    const s = spare({ label: 'SEEN ×99', reels: true, date: OTHER_YEAR, scale: 1.35 });
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(BUDGET * 0.5);
  });

  it('still condemns the row that started all this', () => {
    // `SEEN ×2 · reels · JUL 21, 2026` at ordinary type on a 375pt screen.
    expect(spare({ label: 'SEEN ×2', reels: true, date: 'JUL 21, 2026', scale: 1 })).toBeLessThan(0);
  });
});

describe('every state fits, at every size the app allows', () => {
  it.each(STATES)('$name at ordinary type', (st) => {
    expect(spare({ ...st, scale: 1 })).toBeGreaterThan(0);
  });

  it.each(STATES)('$name at 1.35', (st) => {
    expect(spare({ ...st, scale: 1.35 })).toBeGreaterThan(0);
  });
});

describe('why the date form had to change rather than the date being dropped', () => {
  it('the old long form does not fit even at ordinary type', () => {
    expect(spare({ label: 'SEEN ×2', reels: true, date: 'JUL 21, 2026', scale: 1 })).toBeLessThan(0);
  });

  it('and it is the CALLER that keeps it short', () => {
    // The stub renders whatever it is handed. If the layout ever goes back to
    // a full date this guard is the only thing between that and a clipped row.
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'FilmDetailLayout.tsx'), 'utf8');
    expect(src).toMatch(/formatDateMonthDay/);
    expect(src).toMatch(/String\(watched\.getFullYear\(\)\)/);
  });

  it('and the rewatch count has a worst case', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'FilmStub.tsx'), 'utf8');
    expect(src).toMatch(/Math\.min\(existingLog\?\.viewCount \?\? 2, 99\)/);
  });
});

it('the plate is a legal target whatever it holds', () => {
  expect(STUB_HEIGHT).toBeGreaterThanOrEqual(44);
});
