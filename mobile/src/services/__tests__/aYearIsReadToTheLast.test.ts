/**
 * aYearIsReadToTheLast.test.ts — Year in Cinema reads every viewing of the year, and only what it
 * draws, against the house as strict as it is (test-utils/supabaseFake: production's functions and
 * their arguments).
 *
 * The read stopped at 1,000 rows and said nothing, under a screen that
 * promises real numbers: an import that filed two thousand films into one
 * year would have been counted as a thousand. And it read the year by each
 * record's day, so a film seen in March and again the next January was gone
 * from March's year (review round 11): the year is the house's year of
 * viewings now (year_viewings), each on the day it was made, a page at a
 * time from the last row of the one before.
 */
import { fetchYearLogs, YEAR_PAGE } from '../YearInCinemaService';
import { supabaseFake } from '@/test-utils/supabaseFake';

const ME = '33333333-3333-4333-8333-333333333333';

/** Number `n` as a uuid, as the house's ids are. */
const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

type Row = { log_id: string; viewing_id: string; film_id: number; film_title: string; poster_path: string; rating: number; day: string };
/** Viewing `n` of the member's record `log`, on `day`. */
const viewing = (n: number, day: string, log = n, rating = 4): Row => ({
  log_id: idOf(log), viewing_id: idOf(100000 + n), film_id: 100 + log, film_title: `Film ${log}`, poster_path: `/p${log}.jpg`, rating, day,
});

/** The house's year_viewings over what it holds: the year's viewings newest first, after a row, a page at most. */
const house = (held: Row[]) => {
  const calls: Record<string, unknown>[] = [];
  const fake = supabaseFake({
    rpc: {
      year_viewings: (args: Record<string, unknown>) => {
        calls.push(args);
        const year = String(args.p_year);
        const before = args.p_before_day ? `${String(args.p_before_day)}/${String(args.p_before_viewing)}` : null;
        return held
          .filter((r) => r.day.startsWith(`${year}-`))
          .sort((a, b) => (`${b.day}/${b.viewing_id}` < `${a.day}/${a.viewing_id}` ? -1 : 1))
          .filter((r) => before === null || `${r.day}/${r.viewing_id}` < before)
          .slice(0, YEAR_PAGE);
      },
    },
  });
  return { fake, calls };
};

let mockHouse = house([]).fake;
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

it('reads past the first page, to the last row, each page from the last row of the one before', async () => {
  const many = Array.from({ length: 2 * YEAR_PAGE + 3 }, (_, i) => viewing(i + 1, `2026-03-${String((i % 28) + 1).padStart(2, '0')}`));
  const h = house([...many, viewing(9999, '2025-12-31')]);
  mockHouse = h.fake;
  const logs = await fetchYearLogs(ME, 2026);
  expect(logs).toHaveLength(2 * YEAR_PAGE + 3);
  expect(new Set(logs.map((l) => l.viewingId)).size).toBe(2 * YEAR_PAGE + 3);
  expect(h.calls).toHaveLength(3);
  const [first, second] = h.calls;
  expect(first).toEqual({ p_user_id: ME, p_year: 2026, p_before_day: null, p_before_viewing: null });
  const lastOfFirst = logs[YEAR_PAGE - 1];
  expect(lastOfFirst).toBeDefined();
  expect(second).toEqual({ p_user_id: ME, p_year: 2026, p_before_day: lastOfFirst!.watchedDate, p_before_viewing: lastOfFirst!.viewingId });
});

it('a year of exactly one page asks once more, and stops on the empty answer', async () => {
  const h = house(Array.from({ length: YEAR_PAGE }, (_, i) => viewing(i + 1, '2026-03-01')));
  mockHouse = h.fake;
  expect(await fetchYearLogs(ME, 2026)).toHaveLength(YEAR_PAGE);
  expect(h.calls).toHaveLength(2);
});

it("a film seen in March and again the next January is in March's year, on its own day, with the mark it had then", async () => {
  // Record 7 was moved to its rewatch in January 2027; its March viewing is kept in its history.
  const h = house([viewing(1, '2026-03-10', 7, 5), viewing(2, '2027-01-05', 7, 2)]);
  mockHouse = h.fake;
  expect(await fetchYearLogs(ME, 2026)).toEqual([
    { id: idOf(7), viewingId: idOf(100001), filmId: 107, title: 'Film 7', poster: '/p7.jpg', rating: 5, watchedDate: '2026-03-10', createdAt: null },
  ]);
});

it('a page that fails throws, so the screen says so rather than counting part of a year', async () => {
  mockHouse = supabaseFake({ rpc: { year_viewings: { error: { message: 'Failed to fetch', code: '' } } } });
  await expect(fetchYearLogs(ME, 2026)).rejects.toBeTruthy();
});
