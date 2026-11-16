/**
 * aRecordDeletedOfflineLeavesItsOwnPage.test.ts — review round 7 (removeLogOp,
 * src/stores/domain/logSlice/helpers/logOperations.ts), against the house as strict as it is
 * (test-utils/supabaseFake).
 *
 * A record deleted with no connection was queued, and its own page (['log', id]) was read again:
 * offline that read failed, the page kept the whole record, and its EDIT opened on nothing. Now
 * a delete queued offline says on the page's own copy that the record is gone, and does not read
 * it again; the page leaves as it does online. Online it is read again, as before.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { queryClient } from '@/src/lib/queryClient';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { clearOfflineQueue, getOfflineQueue } from '@/src/utils/offlineQueue';
import { mapLogRow } from '@/src/utils/mappers';

let mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const ME = '33333333-3333-4333-8333-333333333333';
const LOG_ID = '44444444-4444-4444-8444-444444444444';
const NETWORK = { message: 'Failed to fetch', code: '' };

/** The record, as the house holds it: watched once, so a delete takes all of it. */
const row = {
  id: LOG_ID, user_id: ME, film_id: 655, film_title: 'Paris, Texas', poster_path: '/p.jpg', year: '1984',
  rating: 4, review: 'The peep-show booth.', status: 'watched', watched_date: '2026-09-01',
  created_at: '2026-09-01T20:00:00Z', view_count: 1, viewing_history: [],
  viewing_id: '55555555-5555-4555-8555-555555555555',
};
/** The record's own page, as app/log/[id].tsx holds it: the record, and its critiques. */
const PAGE = ['log', LOG_ID];
const pageCopy = () => ({ log: { id: LOG_ID, rating: 4, review: 'The peep-show booth.' }, comments: [], commentTotal: 0 });

beforeEach(() => {
  clearOfflineQueue(ME);
  useAuthStore.setState({ user: { id: ME, username: 'me', tier: 'cinephile', role: 'cinephile' } as never, isAuthenticated: true } as never);
  const held = mapLogRow(row as never);
  useFilmStore.setState({ logs: [held], _loggedIndex: { 655: held } } as never);
  queryClient.setQueryData(PAGE, pageCopy());
});
afterEach(() => {
  clearOfflineQueue(ME);
  queryClient.removeQueries({ queryKey: ['log'] });
  useFilmStore.setState({ logs: [], _loggedIndex: {} } as never);
});

it("a record deleted with no connection: its own page reads it gone at once, and is not read again; online it is read again", async () => {
  mockHouse = supabaseFake({ rows: { logs: [row] }, fail: { logs: NETWORK } });
  await useFilmStore.getState().removeLog(LOG_ID);
  expect(getOfflineQueue().map((m) => m.type)).toEqual(['remove_log']);
  // Its copy says it is gone, the critiques it held kept as they were.
  expect(queryClient.getQueryData(PAGE)).toEqual({ ...pageCopy(), log: null });
  // Read again offline, the read would fail and keep the whole record on the page.
  expect(queryClient.getQueryState(PAGE)?.isInvalidated).toBe(false);

  // The same record, deleted with the house in reach: its page is read again, as before.
  clearOfflineQueue(ME);
  const held = mapLogRow(row as never);
  useFilmStore.setState({ logs: [held], _loggedIndex: { 655: held } } as never);
  queryClient.setQueryData(PAGE, pageCopy());
  mockHouse = supabaseFake({ rows: { logs: [row] } });
  await useFilmStore.getState().removeLog(LOG_ID);
  expect(getOfflineQueue()).toEqual([]);
  expect(mockHouse.rows('logs')).toEqual([]);
  expect(queryClient.getQueryState(PAGE)?.isInvalidated).toBe(true);
});
