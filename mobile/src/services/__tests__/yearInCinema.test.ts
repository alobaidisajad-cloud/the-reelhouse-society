/**
 * yearInCinema.test.ts — locks the "real numbers" guarantees of the Year in
 * Cinema stats. These are the exact places a Wrapped can lie: miscounting,
 * wrong average scale, wrong pace, or crashing on empty/edge data.
 */
import { computeYearStats, YearLogInput } from '../YearInCinemaService';

// jest hoists this above the import at runtime.
jest.mock('@/src/lib/supabase', () => ({ supabase: {} }));

const log = (over: Partial<YearLogInput>): YearLogInput => ({
  id: Math.random(),
  title: 'A Film',
  poster: '/p.jpg',
  rating: 0,
  watchedDate: '2026-06-15',
  createdAt: '2026-06-15',
  ...over,
});

const NOW = new Date('2026-07-15T12:00:00Z'); // July → 7 months elapsed

describe('computeYearStats', () => {
  it('counts only the target year (watched date wins over created)', () => {
    const logs = [
      log({ watchedDate: '2026-01-02' }),
      log({ watchedDate: '2026-11-30' }),
      log({ watchedDate: '2025-12-31' }), // prior year — excluded
      log({ watchedDate: null, createdAt: '2026-03-03' }), // falls back to created
    ];
    expect(computeYearStats(logs, 2026, NOW).total).toBe(3);
  });

  it('averages on the native 0–5 scale (never halved, never 0–10)', () => {
    const logs = [log({ rating: 5 }), log({ rating: 4 }), log({ rating: 0 })];
    const s = computeYearStats(logs, 2026, NOW);
    expect(s.avgRating).toBeCloseTo(4.5, 5); // (5+4)/2, unrated excluded
    expect(s.ratedCount).toBe(2);
    expect(s.avgRating! <= 5).toBe(true);
  });

  it('returns null average (not 0, not NaN) when nothing is rated', () => {
    const s = computeYearStats([log({ rating: 0 }), log({ rating: 0 })], 2026, NOW);
    expect(s.avgRating).toBeNull();
    expect(s.total).toBe(2);
  });

  it('paces by months ELAPSED for the current year, not always 12', () => {
    const logs = Array.from({ length: 14 }, () => log({}));
    const s = computeYearStats(logs, 2026, NOW); // 14 films / 7 months
    expect(s.perMonth).toBeCloseTo(2, 5);
  });

  it('paces a past year by a full 12 months', () => {
    const logs = Array.from({ length: 24 }, () => log({ watchedDate: '2025-06-01' }));
    const s = computeYearStats(logs, 2025, NOW); // 24 / 12
    expect(s.perMonth).toBeCloseTo(2, 5);
  });

  it('ranks top months and top films by rating', () => {
    const logs = [
      log({ watchedDate: '2026-05-01', rating: 3 }),
      log({ watchedDate: '2026-05-02', rating: 5, title: 'Best' }),
      log({ watchedDate: '2026-05-03', rating: 4 }),
      log({ watchedDate: '2026-08-01', rating: 2 }),
    ];
    const s = computeYearStats(logs, 2026, NOW);
    expect(s.topMonths[0]).toEqual({ month: 'May', count: 3 });
    expect(s.topFilms[0].title).toBe('Best');
    expect(s.topFilms[0].rating).toBe(5);
    expect(s.topFilms.length).toBe(3);
  });

  it('is safe on an empty year — no crash, all zeros/empties', () => {
    const s = computeYearStats([], 2026, NOW);
    expect(s.total).toBe(0);
    expect(s.avgRating).toBeNull();
    expect(s.perMonth).toBe(0);
    expect(s.topMonths).toEqual([]);
    expect(s.topFilms).toEqual([]);
  });

  it('tolerates missing titles and null posters without throwing', () => {
    const s = computeYearStats([log({ title: null, poster: null, rating: 4 })], 2026, NOW);
    expect(s.topFilms[0].title).toBe('Untitled');
    expect(s.topFilms[0].poster).toBeNull();
  });
});
