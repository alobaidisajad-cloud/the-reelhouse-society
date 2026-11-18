/**
 * aClearedSearchStaysCleared.test.tsx — review round 12.
 *
 * Each member room waits a moment after the last key before it searches. A ✕ pressed inside that
 * moment emptied the box, and then the wait ran out and narrowed the room to the words just
 * cleared ("No film in the archive matches “noi”"), under an empty box with no ✕ left to press.
 * Now a clear cancels the wait: the box and the room are emptied together, and nothing comes back.
 */
import React, { act } from 'react';
import { fireEvent, render, renderHook } from '@testing-library/react-native';
import { useDebouncedSearch } from '@/src/hooks/useDebouncedSearch';
import ArchiveRoom from '../ProfileArchiveTab';
import LedgerRoom from '../ProfileLedgerTab';
import QueueRoom from '../ProfileWatchlistTab';
import StacksRoom from '../ProfileListsTab';
import ShelfRoom from '../ProfilePhysicalTab';

jest.mock('expo-router', () => ({
  ...require('@/test-utils/expoRouterMock').expoRouterMock(),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn() }));

const film = (i: number) => ({ id: `l${i}`, filmId: 40 + i, title: `Film ${i}`, poster: '/s.jpg', year: 1979, rating: 4, review: 'Words', status: 'watched' });
const SHELF = Array.from({ length: 40 }, (_, i) => film(i)) as never[];

/** Each room with its search shown and empty, its search's setter the test's own. */
const ROOMS = [
  {
    name: 'the archive', box: 'Find a film…',
    node: (set: jest.Mock) => {
      return (
        <ArchiveRoom
          logs={SHELF} isSelf={false} archiveSieve="all" setArchiveSieve={jest.fn()} archiveFiltered={SHELF}
          renderPosterCard={() => null} groupByMonth={() => ({})} totalFilms={40}
          archiveSearch="" setArchiveSearch={set}
        />
      );
    },
  },
  {
    name: 'the ledger', box: 'Search the ledger…',
    node: (set: jest.Mock) => {
      return (
        <LedgerRoom
          isSelf logs={SHELF} ledgerFiltered={SHELF} ledgerSearch="" setLedgerSearch={set}
          ledgerRatingFilter="all" setLedgerRatingFilter={jest.fn()} halfLifeMap={{}} groupByMonth={() => ({})}
        />
      );
    },
  },
  {
    name: 'the queue', box: 'Search the queue…',
    node: (set: jest.Mock) => {
      return (
        <QueueRoom
          isSelf watchlist={SHELF} watchlistFiltered={SHELF} watchlistSearch="" setWatchlistSearch={set}
          watchlistSort="default" setWatchlistSort={jest.fn()} watchlistDecade={null} setWatchlistDecade={jest.fn()}
          decades={[]} totalWatchlist={40} setRouletteOpen={jest.fn()} renderPosterCard={() => null}
        />
      );
    },
  },
  {
    name: 'the stacks', box: 'Find a stack…',
    node: (set: jest.Mock) => {
      return <StacksRoom lists={[]} isSelf={false} totalLists={40} listsSearch="" setListsSearch={set} setListsSort={jest.fn()} />;
    },
  },
  {
    name: 'the shelf', box: 'Find a copy…',
    node: (set: jest.Mock) => {
      return (
        <ShelfRoom
          isSelf={false} vault={[]} physicalFiltered={[]} physicalFormatCounts={[]}
          physicalFilter={null} setPhysicalFilter={jest.fn()} physicalSort="default" setPhysicalSort={jest.fn()}
          totalVault={40} physicalSearch="" setPhysicalSearch={set}
        />
      );
    },
  },
];

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

describe.each(ROOMS)('$name, its search cleared at once', ({ node, box }) => {
  it('a ✕ pressed before the room searched empties both, and the cleared words never come back', async () => {
    const set = jest.fn();
    const r = render(node(set));
    await act(async () => { await Promise.resolve(); });
    await fireEvent.changeText(r.getByPlaceholderText(box), 'noi');
    // Inside the wait: the room has not searched yet.
    await act(async () => { jest.advanceTimersByTime(100); });
    expect(set).not.toHaveBeenCalled();
    await fireEvent.press(r.getByLabelText('Clear the search'));
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(set.mock.calls).toEqual([['']]);
    expect(r.getByPlaceholderText(box).props.value).toBe('');
  });
});

describe('useDebouncedSearch, the one wait every room uses', () => {
  it('the room hears the words once, a moment after the last key', async () => {
    const commit = jest.fn();
    const { result } = await renderHook(() => useDebouncedSearch('', commit));
    await act(async () => { result.current.onChange('n'); result.current.onChange('no'); });
    expect(result.current.value).toBe('no');
    await act(async () => { jest.advanceTimersByTime(299); });
    expect(commit).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(commit.mock.calls).toEqual([['no']]);
  });

  it('a clear inside the wait cancels it', async () => {
    const commit = jest.fn();
    const { result } = await renderHook(() => useDebouncedSearch('', commit));
    await act(async () => { result.current.onChange('noi'); });
    await act(async () => { result.current.clear(); });
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(commit.mock.calls).toEqual([['']]);
    expect(result.current.value).toBe('');
  });

  it('a search changed by the room itself is taken by the box, and a wait still running dropped', async () => {
    const commit = jest.fn();
    const { result, rerender } = await renderHook(({ stored }: { stored: string }) => useDebouncedSearch(stored, commit), { initialProps: { stored: 'ozu' } });
    await act(async () => { result.current.onChange('ozu y'); });
    // The room is wiped for another member while the wait runs.
    await rerender({ stored: '' });
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(result.current.value).toBe('');
    expect(commit).not.toHaveBeenCalled();
  });

  it('the words it gave the room coming back do not move the box', async () => {
    const commit = jest.fn();
    const { result, rerender } = await renderHook(({ stored }: { stored: string }) => useDebouncedSearch(stored, commit), { initialProps: { stored: '' } });
    await act(async () => { result.current.onChange('noir'); });
    await act(async () => { jest.advanceTimersByTime(300); });
    await rerender({ stored: 'noir' });
    await act(async () => { result.current.onChange('noir '); });
    await rerender({ stored: 'noir' });
    expect(result.current.value).toBe('noir ');
  });

  it('a wait never outlives the room', async () => {
    const commit = jest.fn();
    const { result, unmount } = await renderHook(() => useDebouncedSearch('', commit));
    await act(async () => { result.current.onChange('kane'); });
    await unmount();
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(commit).not.toHaveBeenCalled();
  });
});
