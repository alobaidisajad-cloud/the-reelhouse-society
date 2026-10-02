/**
 * theDiaryPagesWithoutGaps.test.ts — the member's own log list, a page at a time.
 *
 * The list was ordered by watched date then CREATED time, while the next page
 * is asked for by watched date then ID: films logged for one day (a common
 * evening, and every import) broke their tie two different ways, so a log at a
 * page edge could be skipped or shown twice. Undated logs were ordered FIRST
 * (Postgres puts nulls first when descending) while the cursor reads them last.
 */
import { fetchLogsOp } from '../logSlice/helpers/logOperations';

type Op = [string, ...unknown[]];
const mockOps: Op[] = [];
jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      for (const k of ['select', 'eq', 'order', 'limit', 'or', 'is', 'lt']) {
        chain[k] = (...a: unknown[]) => { mockOps.push([k, ...a]); return chain; };
      }
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
      return chain;
    },
  },
}));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: 'me' } }) } }));
jest.mock('@/src/stores/domain/helpers/sessionGuard', () => ({ stillSignedIn: () => true, memberUnchanged: () => true }));
jest.mock('@/src/utils/offlineQueue', () => ({ getOfflineQueue: () => [], enqueueMutation: jest.fn() }));

it('orders a page as the next one is asked for: watched date (undated last), then id', async () => {
  const state: Record<string, unknown> = { logs: [], _fetchingLogs: false, logsHasMore: true, _logsCursor: null };
  const set = (p: Record<string, unknown>) => Object.assign(state, p);
  await fetchLogsOp(set as never, (() => state) as never);
  const orders = mockOps.filter(([k]) => k === 'order').map(([, col, o]) => [col, o]);
  expect(orders).toEqual([
    ['watched_date', { ascending: false, nullsFirst: false }],
    ['id', { ascending: false }],
  ]);
});
