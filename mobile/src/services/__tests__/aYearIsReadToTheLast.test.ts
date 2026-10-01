/**
 * aYearIsReadToTheLast.test.ts — Year in Cinema reads every log of the year.
 *
 * The read stopped at 1,000 rows and said nothing, under a screen that
 * promises real numbers: an import that filed two thousand films into one
 * year would have been counted as a thousand.
 */
import { fetchYearLogs, YEAR_PAGE } from '../YearInCinemaService';
import { supabase } from '@/src/lib/supabase';

jest.mock('@/src/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/src/utils/mappers', () => ({
  LOG_SELECT_COLUMNS: '*',
  mapLogRow: (r: { id: number; watched_date: string }) => ({ id: r.id, watchedDate: r.watched_date }),
}));

/** A chain answering the range it is asked for, out of `total` rows. */
function rows(total: number) {
  const asked: [number, number][] = [];
  (supabase.from as jest.Mock).mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    for (const k of ['select', 'eq', 'gte', 'lte', 'order']) chain[k] = () => chain;
    chain.range = (from: number, to: number) => {
      asked.push([from, to]);
      const n = Math.max(0, Math.min(to, total - 1) - from + 1);
      return Promise.resolve({ data: Array.from({ length: n }, (_, i) => ({ id: from + i, watched_date: '2026-03-01' })), error: null });
    };
    return chain;
  });
  return asked;
}

it('reads past the first page, to the last row', async () => {
  const asked = rows(2 * YEAR_PAGE + 3);
  const logs = await fetchYearLogs('u1', 2026);
  expect(logs).toHaveLength(2 * YEAR_PAGE + 3);
  expect(asked).toEqual([[0, YEAR_PAGE - 1], [YEAR_PAGE, 2 * YEAR_PAGE - 1], [2 * YEAR_PAGE, 3 * YEAR_PAGE - 1]]);
});

it('a year of exactly one page asks once more, and stops on the empty answer', async () => {
  const asked = rows(YEAR_PAGE);
  expect(await fetchYearLogs('u1', 2026)).toHaveLength(YEAR_PAGE);
  expect(asked).toHaveLength(2);
});

it('a page that fails throws, so the screen says so rather than counting part of a year', async () => {
  (supabase.from as jest.Mock).mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    for (const k of ['select', 'eq', 'gte', 'lte', 'order']) chain[k] = () => chain;
    chain.range = () => Promise.resolve({ data: null, error: { message: 'Network request failed' } });
    return chain;
  });
  await expect(fetchYearLogs('u1', 2026)).rejects.toBeTruthy();
});
