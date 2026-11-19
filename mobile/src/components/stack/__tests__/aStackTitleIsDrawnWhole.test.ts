/**
 * A stack's title on its own page is drawn whole, and never smaller for a larger text size (round 14).
 *
 * The step (30pt or 24pt) is chosen at the default text size from Rye's own letter widths, and the
 * page draws the title whole at it, grown with the member's text. Chosen at the member's size, a
 * title that fills four lines at 30pt stepped down to 24 at xLarge, so a reader who asked for
 * larger text saw it at 26.8pt where everyone else sees 30.
 */
import { linesAt } from '@/src/components/lobby/measure';
import { STACK_TITLE_LARGE, stackTitleType } from '../stackTitleType';

/** One column on a 390pt phone: 18 each side. */
const PHONE = 390 - 36;
const LONG = 'THE QUIET HOURS OF THE SILENT SCREEN, FROM MURNAU TO C. DREYER AND THE LOST NITRATE PRINTS OF EUROPE';

it('the longest title the house takes is a hundred characters', () => {
  expect(LONG.length).toBe(100);
});

it('a title that fills four lines at 30pt keeps 30pt: a larger text size never sets it smaller', () => {
  // About 55 characters: four lines at 30pt at the default size, five at xLarge.
  const title = 'MIDNIGHT MOVIES FOR PEOPLE WHO NEVER SLEEP AT ALL REALLY';
  expect(linesAt(title, 'rye', 30, 1, 0, PHONE)).toBeLessThanOrEqual(STACK_TITLE_LARGE.lines);
  expect(linesAt(title, 'rye', 30, 1.35, 0, PHONE)).toBeGreaterThan(STACK_TITLE_LARGE.lines);
  expect(stackTitleType(title, PHONE)).toEqual({ fontSize: 30, lineHeight: 34 });
});

it('a short title is set large, and a long one at 24pt, never smaller', () => {
  expect(stackTitleType('NOIR', PHONE).fontSize).toBe(30);
  expect(stackTitleType(LONG, PHONE)).toEqual({ fontSize: 24, lineHeight: 28 });
  expect(stackTitleType(LONG, 320 - 36)).toEqual({ fontSize: 24, lineHeight: 28 });
});
