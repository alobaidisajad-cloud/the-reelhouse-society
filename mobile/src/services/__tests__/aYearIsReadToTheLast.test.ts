/**
 * aYearIsReadToTheLast.test.ts — Year in Cinema reads every log of the year, and only what it draws,
 * against the house as strict as it is (test-utils/supabaseFake: production's columns, its 1,000-row
 * cap, its ranges).
 *
 * The read stopped at 1,000 rows and said nothing, under a screen that
 * promises real numbers: an import that filed two thousand films into one
 * year would have been counted as a thousand. And it read every column of
 * every log, each one's words, autopsy and past viewings among them, for a
 * story that draws a film, a mark and a day.
 */
import { fetchYearLogs, YEAR_COLUMNS, YEAR_PAGE } from '../YearInCinemaService';
import { supabaseFake } from '@/test-utils/supabaseFake';

const ME = '33333333-3333-4333-8333-333333333333';
const OTHER = '77777777-7777-4777-8777-777777777777';

/** Log number `n`'s id: a uuid, as the house's are. */
const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
/** Log `n` of `user_id`, watched on `day`, with words and a past viewing the year never draws. */
const log = (id: number, day: string, user_id = ME) => ({
  id: idOf(id), user_id, film_id: 100 + id, film_title: `Film ${id}`, poster_path: `/p${id}.jpg`, rating: 4,
  watched_date: day, created_at: `${day}T20:00:00Z`, review: 'A long review.', viewing_history: [],
});

let mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

/** The house holding `n` of this member's logs in 2026, one of theirs in 2025, and another member's. */
const holding = (n: number) => {
  mockHouse = supabaseFake({ rows: { logs: [
    ...Array.from({ length: n }, (_, i) => log(i + 1, '2026-03-01')),
    log(n + 1, '2025-12-31'), log(n + 2, '2026-03-01', OTHER),
  ] } });
};
const ranges = () => mockHouse.asked.filter((a) => a.table === 'logs').length;

it('reads past the first page, to the last row', async () => {
  holding(2 * YEAR_PAGE + 3);
  const logs = await fetchYearLogs(ME, 2026);
  expect(logs).toHaveLength(2 * YEAR_PAGE + 3);
  expect(new Set(logs.map((l) => l.id)).size).toBe(2 * YEAR_PAGE + 3);
  expect(ranges()).toBe(3);
});

it('a year of exactly one page asks once more, and stops on the empty answer', async () => {
  holding(YEAR_PAGE);
  expect(await fetchYearLogs(ME, 2026)).toHaveLength(YEAR_PAGE);
  expect(ranges()).toBe(2);
});

it("reads the member's own year alone, by the seven columns it draws, each where the story looks", async () => {
  holding(1);
  expect(await fetchYearLogs(ME, 2026)).toEqual([
    { id: idOf(1), filmId: 101, title: 'Film 1', poster: '/p1.jpg', rating: 4, watchedDate: '2026-03-01', createdAt: '2026-03-01T20:00:00Z' },
  ]);
  expect(YEAR_COLUMNS.split(', ')).toEqual(['id', 'film_id', 'film_title', 'poster_path', 'rating', 'watched_date', 'created_at']);
  expect(mockHouse.asked.find((a) => a.table === 'logs')?.columns).toEqual(YEAR_COLUMNS.split(', '));
});

it('a page that fails throws, so the screen says so rather than counting part of a year', async () => {
  mockHouse = supabaseFake({ rows: { logs: [] }, fail: { logs: { message: 'Failed to fetch', code: '' } } });
  await expect(fetchYearLogs(ME, 2026)).rejects.toBeTruthy();
});
