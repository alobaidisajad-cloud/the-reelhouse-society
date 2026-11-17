/**
 * aYearCountsEveryViewing.test.ts — Year in Cinema tells the films seen in the year, each viewing
 * on its own day (review round 11).
 *
 * A rewatch moves its record to the rewatch's day. Read by records, a film seen in March 2026 and
 * again in January 2027 was gone from 2026's year: its total, its months and its top three. The
 * year is now read as viewings, and a film seen twice in a year is one film there.
 */
import { computeYearStats, type YearLogInput } from '../YearInCinemaService';
import { supabaseFake } from '@/test-utils/supabaseFake';

// The count is the phone's own, from the viewings it was given: the house is the shared fake, never asked.
const mockHouse = supabaseFake({});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const NOW = new Date(2027, 0, 20, 12, 0, 0);
const viewing = (over: Partial<YearLogInput>): YearLogInput => ({
  id: 'log-1', filmId: 1, title: 'Stalker', poster: '/s.jpg', rating: 0, watchedDate: '2026-03-10', createdAt: null, ...over,
});

it('a film seen twice in one year is one film, counted in each month it was seen in', () => {
  const s = computeYearStats([
    viewing({ viewingId: 'v-july', watchedDate: '2026-07-02', rating: 3 }),
    viewing({ viewingId: 'v-march', watchedDate: '2026-03-10', rating: 5 }),
    viewing({ id: 'log-2', filmId: 2, title: 'Mirror', viewingId: 'v-mirror', watchedDate: '2026-03-12', rating: 4 }),
    viewing({ viewingId: 'v-march-again', watchedDate: '2026-03-20', rating: 0 }),
  ], 2026, NOW);
  expect(s.total).toBe(2);
  expect(s.perMonth).toBeCloseTo(2 / 12, 5);
  expect(s.topMonths).toEqual([{ month: 'March', count: 2 }, { month: 'July', count: 1 }]);
  // Marked by its latest marked viewing of the year: 3 in July, not 5 in March.
  expect(s.ratedCount).toBe(2);
  expect(s.avgRating).toBeCloseTo(3.5, 5);
  expect(s.topFilms.map((f) => `${f.title} ${f.rating}`)).toEqual(['Mirror 4', 'Stalker 3']);
});
