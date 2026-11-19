/**
 * The size a stack's title is set at on its own page, as a catalogue sets one: 30pt while it fits
 * four lines, else 24pt. The step is chosen at the default text size, word by word from Rye's own
 * letter widths (lobby/measure.ts), and the title then grows with the member's text size like any
 * other: chosen at their size, a title of four lines stepped down to 24 at xLarge and was drawn
 * smaller than a reader at the default size sees it (round 14).
 *
 * The title is never cut: it is drawn whole at the size chosen, however many lines it takes at a
 * larger text size. A step chosen from a count of characters, with its lines capped, ended a title
 * of 55 to 100 characters in "…" there, and no other place showed it whole (round 14).
 */
import { linesAt } from '@/src/components/lobby/measure';

export const STACK_TITLE_LARGE = { fontSize: 30, lineHeight: 34, lines: 4 } as const;
export const STACK_TITLE_SMALL = { fontSize: 24, lineHeight: 28 } as const;

/** The title as drawn (in capitals), and the column it is set in. */
export function stackTitleType(drawn: string, width: number): { fontSize: number; lineHeight: number } {
  const lines = linesAt(drawn, 'rye', STACK_TITLE_LARGE.fontSize, 1, 0, width);
  return lines <= STACK_TITLE_LARGE.lines
    ? { fontSize: STACK_TITLE_LARGE.fontSize, lineHeight: STACK_TITLE_LARGE.lineHeight }
    : STACK_TITLE_SMALL;
}
