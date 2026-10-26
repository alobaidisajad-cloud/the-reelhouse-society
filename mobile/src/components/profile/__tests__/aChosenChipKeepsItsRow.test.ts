/**
 * A chosen chip keeps its row.
 *
 * Choosing a decade (or a format) narrows the page to it, so counting the page again would leave
 * one chip and no way back to the others. The row is the page's as it stood when the chip was
 * chosen, until the chip is let go.
 */
import { act, renderHook } from '@testing-library/react-native';
import { useProfileComputed } from '../profileComputed';

const base = {
  isSelf: false, myLogs: [], myWatchlist: [], myVault: [], myLists: [],
  mainLogs: [], archiveLogs: [], ledgerLogs: [], analyticsLogs: [], watchlist: [], vault: [], lists: [],
  counts: { logs: 0, ledger: 0, watchlist: 0, vault: 0, lists: 0 },
  isArchivistPlus: true, isAuteurPlus: true, targetUser: { id: 'u9' }, username: 'vesper', serverStreak: null,
  archiveSieve: 'all', archiveSearch: '', listsSearch: '', physicalSearch: '',
  ledgerSearch: '', ledgerRatingFilter: 'all' as const, watchlistDecade: null,
  watchlistSearch: '', watchlistSort: 'default' as const, physicalFilter: null,
  physicalSort: 'default' as const, listsSort: 'default' as const,
};

const WHOLE = [{ id: 1, title: 'Laura', year: 1944 }, { id: 2, title: 'Heat', year: 1995 }, { id: 3, title: 'Ronin', year: 1998 }];
const NINETIES = WHOLE.filter((f) => f.year >= 1990);

it('keeps every decade while one is chosen, and counts again once it is let go', async () => {
  const { result, rerender } = await renderHook((p: Record<string, unknown>) => useProfileComputed({ ...base, ...p } as never), {
    initialProps: { watchlist: WHOLE, watchlistDecade: null },
  });
  expect(result.current.watchlistDecadeCounts).toEqual([{ decade: 1990, count: 2 }, { decade: 1940, count: 1 }]);

  // Chosen: the house answers with the nineties alone, and the row stays whole.
  await act(async () => { await rerender({ watchlist: WHOLE, watchlistDecade: 1990 }); });
  await act(async () => { await rerender({ watchlist: NINETIES, watchlistDecade: 1990 }); });
  expect(result.current.watchlistDecadeCounts).toEqual([{ decade: 1990, count: 2 }, { decade: 1940, count: 1 }]);

  await act(async () => { await rerender({ watchlist: NINETIES, watchlistDecade: null }); });
  expect(result.current.watchlistDecadeCounts).toEqual([{ decade: 1990, count: 2 }]);
});

it('keeps every format while one is chosen', async () => {
  const shelf = [{ id: 'v1', title: 'Alien', formats: ['VHS'] }, { id: 'v2', title: 'Heat', formats: ['DVD'] }];
  const { result, rerender } = await renderHook((p: Record<string, unknown>) => useProfileComputed({ ...base, ...p } as never), {
    initialProps: { vault: shelf, physicalFilter: null },
  });
  const ids = () => result.current.physicalFormatCounts.map((f: { id: string }) => f.id).sort();
  expect(ids()).toEqual(['DVD', 'VHS']);

  await act(async () => { await rerender({ vault: shelf, physicalFilter: 'VHS' }); });
  await act(async () => { await rerender({ vault: [shelf[0]], physicalFilter: 'VHS' }); });
  expect(ids()).toEqual(['DVD', 'VHS']);
});
