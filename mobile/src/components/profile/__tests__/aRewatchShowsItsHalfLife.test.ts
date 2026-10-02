/**
 * aRewatchShowsItsHalfLife.test.ts — a film rewatched in the Ledger shows how
 * its rating moved, and how many times it was seen.
 *
 * The half-life paired two logs of one film. A member has ONE log per film
 * (logs_user_id_film_id_key) and a rewatch is kept on it, each earlier viewing
 * with its own rating in viewing_history — so no pair ever existed and no row
 * ever showed its mark (production: 36 rewatched logs, none marked). It is
 * read from the log itself now, for every member's Ledger.
 */
import { renderHook } from '@testing-library/react-native';
import { useProfileComputed } from '../profileComputed';

const base = {
  isSelf: false, myLogs: [], myWatchlist: [], myVault: [], myLists: [],
  mainLogs: [], archiveLogs: [], ledgerLogs: [], analyticsLogs: [], watchlist: [], vault: [], lists: [],
  counts: { logs: 0, ledger: 0, watchlist: 0, vault: 0, lists: 0 },
  isArchivistPlus: false, isAuteurPlus: false, targetUser: { id: 'u9' }, username: 'vesper', serverStreak: null,
  archiveSieve: 'all', archiveSearch: '', listsSearch: '', physicalSearch: '',
  ledgerSearch: '', ledgerRatingFilter: 'all' as const, watchlistDecade: null,
  watchlistSearch: '', watchlistSort: 'default' as const, physicalFilter: null,
  physicalSort: 'default' as const, listsSort: 'default' as const,
};
const halfLife = async (ledgerLogs: unknown[]) =>
  (await renderHook(() => useProfileComputed({ ...base, ledgerLogs } as never))).result.current.halfLifeMap;

const log = (filmId: number, rating: number, viewingHistory: unknown[] = []) =>
  ({ id: `l${filmId}`, filmId, title: `Film ${filmId}`, rating, review: 'Words.', watchedDate: '2026-09-01', viewingHistory });

describe('the half-life, read from the log', () => {
  it('a rewatch rated higher rises, seen twice — for a member of any rank, seen by anyone', async () => {
    const map = await halfLife([log(1, 4.5, [{ date: '2025-01-01', rating: 3 }])]);
    expect(map[1]).toEqual({ count: 2, trajectory: 'ASCENDING', delta: 1.5 });
  });

  it('rated lower, it decays; the same, it holds', async () => {
    const map = await halfLife([
      log(2, 2, [{ date: '2025-01-01', rating: 5 }, { date: '2025-06-01', rating: 4 }]),
      log(3, 4, [{ date: '2025-01-01', rating: 4 }]),
    ]);
    expect(map[2]).toEqual({ count: 3, trajectory: 'DECAYING', delta: -3 });
    expect(map[3]).toEqual({ count: 2, trajectory: 'ETERNAL', delta: 0 });
  });

  it('the earliest viewing is the first, whatever order the history was kept in', async () => {
    const map = await halfLife([log(4, 3, [{ date: '2025-06-01', rating: 4 }, { date: '2024-01-01', rating: 1 }])]);
    expect(map[4]).toEqual({ count: 3, trajectory: 'ASCENDING', delta: 2 });
  });

  it('a film seen once has no mark', async () => {
    expect(await halfLife([log(5, 4)])).toEqual({});
  });
});
