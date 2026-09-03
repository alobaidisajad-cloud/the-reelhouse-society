/**
 * dayLabel.test.ts — the dates the paper prints, without Intl.
 * ─────────────────────────────────────────────────────────────────────────────
 * Fourteen statements, none of which had ever run. They exist precisely because
 * `toLocaleDateString` is unavailable on Hermes, so the one thing worth proving
 * is that these do the job it would have done — and that they fail quietly on
 * input that cannot be a date, rather than printing `Invalid Date` across the
 * top of the feed.
 *
 * The day is the DEVICE's day, not UTC: a filing made at 11pm belongs to the
 * evening the member made it in. That is asserted with a local-midnight
 * construction rather than a fixed ISO string, so the test says the same thing
 * in every timezone it is run in — this repo already has a `test:tz` run that
 * exists because a date test that only passes in one zone is a trap.
 */
import { dayKey, dayLabel, hourLabel } from '../dayLabel';

/** A local date, built the way the device would experience it. */
const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString();

describe('dayKey', () => {
  it('is the local calendar day, zero-padded', () => {
    expect(dayKey(at(2026, 8, 28))).toBe('2026-08-28');
    expect(dayKey(at(2026, 1, 5))).toBe('2026-01-05');
  });

  it('groups two filings made on the same local day', () => {
    expect(dayKey(at(2026, 8, 28, 0, 1))).toBe(dayKey(at(2026, 8, 28, 23, 59)));
  });

  it('separates a filing made just after local midnight', () => {
    expect(dayKey(at(2026, 8, 28, 23, 59))).not.toBe(dayKey(at(2026, 8, 29, 0, 1)));
  });

  it('is empty for something that is not a date', () => {
    expect(dayKey('not a date')).toBe('');
    expect(dayKey('')).toBe('');
  });
});

describe('dayLabel', () => {
  it('prints the full weekday and month in caps', () => {
    // 2026-08-28 is a Friday.
    expect(dayLabel(at(2026, 8, 28))).toBe('FRIDAY, AUGUST 28');
  });

  it('covers every weekday and every month', () => {
    // Not a spot check: an off-by-one in either table would show up on exactly
    // one value, and a single example would find it only by luck.
    const days = new Set<string>();
    for (let i = 0; i < 7; i++) days.add(dayLabel(at(2026, 8, 23 + i)).split(',')[0]);
    expect(days).toEqual(new Set([
      'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY',
    ]));

    const months = new Set<string>();
    for (let m = 1; m <= 12; m++) months.add(dayLabel(at(2026, m, 15)).split(', ')[1].split(' ')[0]);
    expect(months.size).toBe(12);
    expect(months).toContain('JANUARY');
    expect(months).toContain('DECEMBER');
  });

  it('never prints Invalid Date across the top of the feed', () => {
    expect(dayLabel('not a date')).toBe('');
    expect(dayLabel('')).toBe('');
  });
});

describe('hourLabel', () => {
  it('is a padded 24-hour clock in the member’s own time', () => {
    expect(hourLabel(at(2026, 8, 28, 21, 40))).toBe('21:40');
    expect(hourLabel(at(2026, 8, 28, 9, 5))).toBe('09:05');
    expect(hourLabel(at(2026, 8, 28, 0, 0))).toBe('00:00');
  });

  it('prints a dash, not a broken clock, for a bad value', () => {
    // The margin is a ledger column: a dash is what a ledger puts in an empty
    // cell, and `NaN:NaN` is what this returns without the guard.
    expect(hourLabel('not a date')).toBe('—');
  });
});
