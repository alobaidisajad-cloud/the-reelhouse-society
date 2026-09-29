/**
 * aBallotsClosingTimes.test.ts — one list of closing times, read by the paper's
 * choices, the rail's CLOSES and the filing alike.
 */
import {
  CLOSING_TIMES, DEFAULT_CLOSING, closingDays, isClosingTime, nextClosing,
} from '@/src/components/dispatch/paper/paperMetrics';

describe('a ballot’s closing times', () => {
  it('are three, each with its days', () => {
    expect(CLOSING_TIMES.map((c) => [c.label, closingDays(c.label)])).toEqual([
      ['1 DAY', 1], ['2 DAYS', 2], ['1 WEEK', 7],
    ]);
  });

  it('default to one the list holds', () => {
    expect(isClosingTime(DEFAULT_CLOSING)).toBe(true);
  });

  it('move on in order, and round again from the first', () => {
    expect(nextClosing('1 DAY')).toBe('2 DAYS');
    expect(nextClosing('2 DAYS')).toBe('1 WEEK');
    expect(nextClosing('1 WEEK')).toBe('1 DAY');
  });

  it('recognise only their own labels (a draft from another version is refused)', () => {
    expect(isClosingTime('2 DAYS')).toBe(true);
    expect(isClosingTime('3 DAYS')).toBe(false);
    expect(isClosingTime(undefined)).toBe(false);
    expect(isClosingTime(2)).toBe(false);
  });
});
