/**
 * computeDailyStreak.test.ts
 * ──────────────────────────
 * The streak was date arithmetic living inside a useMemo, so no test could reach it.
 * Batch 13 pulled it out — and pulling it out immediately exposed that it was half
 * right: `d.substring(0, 10)` is correct for `watchedDate` (a `date` column, no time)
 * and wrong for the `createdAt` fallback, whose first ten characters are its UTC day.
 *
 * Run under `npm run test:tz` — a streak that is only correct in UTC is not correct.
 */
import { computeDailyStreak } from '../profileComputed';

const TZ = process.env.TZ ?? '(system default)';

/** A calendar date N days from `from`, as the MEMBER's own calendar reads it. */
function dayString(from: Date, offset: number): string {
  const d = new Date(from);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// A fixed afternoon instant. Afternoon matters: at 16:00 in Los Angeles the UTC day is
// ALREADY TOMORROW, which is precisely the condition the old code got wrong.
const NOW = new Date(2026, 6, 25, 16, 30, 0);

const watched = (d: string) => ({ watchedDate: d, createdAt: null });

describe(`computeDailyStreak [TZ=${TZ}]`, () => {
  it('counts consecutive days ending today', () => {
    const logs = [0, -1, -2].map((o) => watched(dayString(NOW, o)));
    expect(computeDailyStreak(logs, NOW)).toBe(3);
  });

  it('a single log today is a streak of one', () => {
    expect(computeDailyStreak([watched(dayString(NOW, 0))], NOW)).toBe(1);
  });

  it('stops at the first missing day', () => {
    // today, yesterday, then a gap, then more — the older run must not be counted.
    const logs = [0, -1, -3, -4].map((o) => watched(dayString(NOW, o)));
    expect(computeDailyStreak(logs, NOW)).toBe(2);
  });

  it('today may still be missing without ending the streak', () => {
    // Someone who has not logged yet TODAY has not broken yesterday's run.
    const logs = [-1, -2].map((o) => watched(dayString(NOW, o)));
    expect(computeDailyStreak(logs, NOW)).toBe(2);
  });

  it('is zero when nothing recent was logged', () => {
    expect(computeDailyStreak([watched(dayString(NOW, -5))], NOW)).toBe(0);
    expect(computeDailyStreak([], NOW)).toBe(0);
  });

  it('counts a day once however many films were logged on it', () => {
    const today = dayString(NOW, 0);
    expect(computeDailyStreak([watched(today), watched(today), watched(today)], NOW)).toBe(1);
  });

  // ── The defect the extraction exposed ──────────────────────────────────────
  it('a log with only a timestamp is filed under the LOCAL day, not the UTC one', () => {
    // 2026-07-25 23:00 local. West of UTC that instant is still the 25th locally while
    // its ISO text begins "2026-07-26" — the old substring(0,10) read tomorrow and the
    // streak silently broke.
    const localEvening = new Date(2026, 6, 25, 23, 0, 0);
    const logs = [{ watchedDate: null, createdAt: localEvening.toISOString() }];
    expect(computeDailyStreak(logs, NOW)).toBe(1);
  });

  it('survives malformed rows without throwing or hanging', () => {
    const logs = [
      { watchedDate: null, createdAt: null },
      { watchedDate: 'not-a-date', createdAt: null },
      watched(dayString(NOW, 0)),
    ];
    expect(computeDailyStreak(logs, NOW)).toBe(1);
  });

  it('terminates on a long unbroken run', () => {
    // The loop used to be unbounded; this would hang rather than fail if it regressed.
    const logs = Array.from({ length: 400 }, (_, i) => watched(dayString(NOW, -i)));
    expect(computeDailyStreak(logs, NOW)).toBe(400);
  });
});
