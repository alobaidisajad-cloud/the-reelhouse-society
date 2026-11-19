/**
 * A film watched on 1 January is placed in that year on the film's page, for every member.
 *
 * The watched date is a calendar date ("2026-01-01"). Read as a Date it is midnight UTC, which
 * west of UTC is 31 December of the year before: the stub printed "2025" for a viewing this year,
 * in the Americas. Run in six zones by `npm run test:tz`.
 */
import { watchedLabel } from '../watchedLabel';

describe('the stub’s date', () => {
  it('a viewing on New Year’s Day this year reads as its day, not as last year', () => {
    expect(watchedLabel('2026-01-01', 2026)).toBe('JAN 1');
  });

  it('a viewing on New Year’s Day of another year reads as that year', () => {
    expect(watchedLabel('2025-01-01', 2026)).toBe('2025');
  });

  it('a viewing on New Year’s Eve reads as the year it ended', () => {
    expect(watchedLabel('2025-12-31', 2026)).toBe('2025');
    expect(watchedLabel('2026-12-31', 2026)).toBe('DEC 31');
  });

  it('no date, or one that names no day, prints nothing', () => {
    expect(watchedLabel(null, 2026)).toBeNull();
    expect(watchedLabel('', 2026)).toBeNull();
    expect(watchedLabel('not a date', 2026)).toBeNull();
  });
});
