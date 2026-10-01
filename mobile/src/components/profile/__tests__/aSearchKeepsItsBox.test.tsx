/**
 * aSearchKeepsItsBox.test.tsx — every room with a search, searched.
 *
 * Three rooms sized themselves by the rows in hand, and under a search those
 * rows are the search's answer. In the queue, the shelf and the stacks a search
 * that found nothing told a visitor the member had never saved, catalogued or
 * compiled anything, and offered the member their own "start here"; the
 * queue's and the shelf's took away the box it was typed in. The shelf's
 * format message also read "catalogued asVHS".
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import ProfileWatchlistTab from '../ProfileWatchlistTab';
import ProfilePhysicalTab from '../ProfilePhysicalTab';
import ProfileListsTab from '../ProfileListsTab';
import ProfileArchiveTab from '../ProfileArchiveTab';
import ProfileLedgerTab from '../ProfileLedgerTab';

jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn() }));

const settle = async (node: React.ReactElement) => {
  const r = render(node);
  await act(async () => { await Promise.resolve(); });
  return r;
};

const logs = Array.from({ length: 40 }, (_, i) => ({ id: `l${i}`, filmId: i + 1, title: `Film ${i}`, rating: 4, review: 'Words', status: 'watched' })) as never[];

/** Each room as a visitor finds it: forty things held, a search for "zzqq" live, and nothing found. */
const ROOMS = [
  {
    name: 'the queue', box: 'Search the queue…', empty: 'The Queue is Empty',
    node: () => (
      <ProfileWatchlistTab
        watchlist={[]} watchlistFiltered={[]} isSelf={false}
        watchlistSearch="zzqq" setWatchlistSearch={jest.fn()} watchlistSort="default" setWatchlistSort={jest.fn()}
        watchlistDecade={null} setWatchlistDecade={jest.fn()} decades={[]} totalWatchlist={40}
        setRouletteOpen={jest.fn()} renderPosterCard={() => null}
      />
    ),
  },
  {
    name: 'the shelf', box: 'Find a copy…', empty: 'The Shelves are Bare',
    node: () => (
      <ProfilePhysicalTab
        isSelf={false} vault={[]} physicalFiltered={[]} physicalFormatCounts={[]}
        physicalFilter={null} setPhysicalFilter={jest.fn()} physicalSort="default" setPhysicalSort={jest.fn()}
        totalVault={40} physicalSearch="zzqq" setPhysicalSearch={jest.fn()}
      />
    ),
  },
  {
    name: 'the stacks', box: 'Find a stack…', empty: 'The Stacks are Empty',
    node: () => (
      <ProfileListsTab lists={[]} isSelf={false} totalLists={40} listsSearch="zzqq" setListsSearch={jest.fn()} setListsSort={jest.fn()} />
    ),
  },
  {
    name: 'the archive', box: 'Find a film…', empty: 'The Archive is Empty',
    node: () => (
      <ProfileArchiveTab
        logs={logs} isSelf={false} archiveSieve="all" setArchiveSieve={jest.fn()} archiveFiltered={[]}
        renderPosterCard={() => null} groupByMonth={() => ({})} totalFilms={40}
        archiveSearch="zzqq" setArchiveSearch={jest.fn()}
      />
    ),
  },
  {
    name: 'the ledger', box: 'Search the ledger…', empty: 'The Ledger is Empty',
    node: () => (
      <ProfileLedgerTab
        logs={logs} ledgerFiltered={[]} ledgerSearch="zzqq" setLedgerSearch={jest.fn()}
        ledgerRatingFilter="all" setLedgerRatingFilter={jest.fn()} halfLifeMap={{}} groupByMonth={() => ({})}
      />
    ),
  },
];

describe.each(ROOMS)('$name, searched to nothing', ({ node, box, empty }) => {
  it('says the search found nothing, with the way back, and keeps the box', async () => {
    const r = await settle(node());
    expect(r.getByText('Nothing under that name')).toBeTruthy();
    expect(r.getByText('CLEAR THE SEARCH')).toBeTruthy();
    expect(r.getByPlaceholderText(box)).toBeTruthy();
    expect(r.queryByText(empty)).toBeNull();
  });
});

describe('the queue', () => {
  const film = (id: number, title: string) => ({ id, title, poster_path: null, year: 1944 });
  const found = [film(1, 'Laura'), film(2, 'Laura Mars'), film(3, 'Laura’s Day')] as never[];
  const queue = (over: Record<string, unknown>) => (
    <ProfileWatchlistTab
      watchlist={[]} watchlistFiltered={[]} isSelf={false}
      watchlistSearch="" setWatchlistSearch={jest.fn()} watchlistSort="default" setWatchlistSort={jest.fn()}
      watchlistDecade={null} setWatchlistDecade={jest.fn()} decades={[]} totalWatchlist={40}
      setRouletteOpen={jest.fn()} renderPosterCard={() => null}
      {...over}
    />
  );

  it('a search that found three films keeps the box it was typed in', async () => {
    const r = await settle(queue({ watchlist: found, watchlistFiltered: found, watchlistSearch: 'laura' }));
    expect(r.getByPlaceholderText('Search the queue…')).toBeTruthy();
  });

  it('a decade that emptied the room is the one named', async () => {
    const r = await settle(queue({ watchlistDecade: 1940 }));
    expect(r.getByText('Nothing from that era')).toBeTruthy();
    expect(r.getByText('SHOW EVERY ERA')).toBeTruthy();
  });

  it('a queue that is truly empty, with nothing filtered, still says so', async () => {
    const r = await settle(queue({ totalWatchlist: 0 }));
    expect(r.getByText('The Queue is Empty')).toBeTruthy();
    expect(r.queryByPlaceholderText('Search the queue…')).toBeNull();
  });
});

describe('the shelf', () => {
  it('a format that emptied it is named, with a space before the name', async () => {
    const r = await settle(
      <ProfilePhysicalTab
        isSelf={false} vault={[]} physicalFiltered={[]} physicalFormatCounts={[]}
        physicalFilter="vhs" setPhysicalFilter={jest.fn()} physicalSort="default" setPhysicalSort={jest.fn()}
        totalVault={40}
      />,
    );
    expect(r.getByText('That shelf is bare')).toBeTruthy();
    expect(r.getByText(/catalogued as VHS\.$/)).toBeTruthy();
  });
});
