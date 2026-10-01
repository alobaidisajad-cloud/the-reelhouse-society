/**
 * theRestCouldNotBeReached.test.tsx — "more", read and failed.
 *
 * A room's next page that could not be read was logged and dropped: the
 * spinner at the foot went out and the room simply ended, as if the member had
 * no more films. The hook now remembers the failure per collection, and every
 * room's foot says so with the way to ask again.
 */
import React, { act } from 'react';
import { render, renderHook, waitFor, fireEvent } from '@testing-library/react-native';
import { useProfileData } from '@/src/hooks/useProfileData';
import ProfileWatchlistTab from '../ProfileWatchlistTab';
import ProfilePhysicalTab from '../ProfilePhysicalTab';
import ProfileListsTab from '../ProfileListsTab';
import ProfileArchiveTab from '../ProfileArchiveTab';
import ProfileLedgerTab from '../ProfileLedgerTab';

const mockService: Record<string, jest.Mock> = {
  fetchProfile: jest.fn(),
  fetchCounts: jest.fn(async () => ({ logs: 3, ledger: 0, watchlist: 90, vault: 0, lists: 0, followers: 1, following: 1 })),
  fetchAnalyticsSummary: jest.fn(async () => null),
  fetchOtherUserLogs: jest.fn(async () => ({ items: [], nextCursor: null })),
  fetchOtherUserWatchlist: jest.fn(),
};
jest.mock('@/src/services/ProfileDataService', () => ({
  ProfileDataService: new Proxy({}, { get: (_t, k: string) => mockService[k] ?? jest.fn(async () => null) }),
}));
jest.mock('@/src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn() }));

const MEMBER = { id: 'u9', username: 'vesper', tier: 'cinephile', role: 'cinephile', is_founding: false, is_social_private: false };
const page = (from: number) => Array.from({ length: 3 }, (_, i) => ({ id: from + i, title: `Film ${from + i}`, poster_path: null }));

describe('the hook', () => {
  beforeEach(() => { mockService.fetchProfile.mockResolvedValue(MEMBER); });

  it('remembers a "more" that failed, and forgets it once the rest arrives', async () => {
    const { result } = await renderHook(() => useProfileData({ username: 'vesper', isSelf: false, isFollowing: false, activeTab: 'watchlist' }));
    await waitFor(() => expect(result.current.targetUser?.id).toBe('u9'));
    mockService.fetchOtherUserWatchlist
      .mockResolvedValueOnce({ items: page(1), nextCursor: 'c1' })
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValueOnce({ items: page(4), nextCursor: null });
    await act(async () => { await result.current.loadTabData('watchlist'); });

    await act(async () => { await result.current.loadMoreWatchlist(); });
    expect(result.current.moreFailed.watchlist).toBe(true);
    expect(result.current.watchlist).toHaveLength(3);   // what was on screen stays

    await act(async () => { await result.current.loadMoreWatchlist(); });
    expect(result.current.moreFailed.watchlist).toBe(false);
    expect(result.current.watchlist).toHaveLength(6);
  });
});

const settle = async (node: React.ReactElement) => {
  const r = render(node);
  await act(async () => { await Promise.resolve(); });
  return r;
};
const films = page(1) as never[];
const logs = page(1).map((f) => ({ ...f, filmId: f.id, id: `l${f.id}`, rating: 4, review: 'Words', status: 'watched' })) as never[];

const ROOMS = [
  ['the queue', (more: jest.Mock) => (
    <ProfileWatchlistTab
      watchlist={films} watchlistFiltered={films} isSelf={false} watchlistSearch="" setWatchlistSearch={jest.fn()}
      watchlistSort="default" setWatchlistSort={jest.fn()} watchlistDecade={null} setWatchlistDecade={jest.fn()}
      decades={[]} totalWatchlist={90} setRouletteOpen={jest.fn()} renderPosterCard={() => null}
      onLoadMore={more} moreFailed
    />
  )],
  ['the shelf', (more: jest.Mock) => (
    <ProfilePhysicalTab
      isSelf={false} vault={films} physicalFiltered={films.map((f: { id: number }) => ({ ...f, formats: ['vhs'] })) as never[]}
      physicalFormatCounts={[]} physicalFilter={null} setPhysicalFilter={jest.fn()} physicalSort="default" setPhysicalSort={jest.fn()}
      totalVault={90} onLoadMore={more} hasMore moreFailed
    />
  )],
  ['the stacks', (more: jest.Mock) => (
    <ProfileListsTab lists={films.map((f: { id: number }) => ({ ...f, id: String(f.id), filmCount: 1, films: [] })) as never[]} totalLists={90} onLoadMore={more} hasMore moreFailed />
  )],
  ['the archive', (more: jest.Mock) => (
    <ProfileArchiveTab
      logs={logs} isSelf={false} archiveSieve="all" setArchiveSieve={jest.fn()} archiveFiltered={logs}
      renderPosterCard={() => null} groupByMonth={(items) => ({ 'MARCH 2026': items })} totalFilms={90}
      onLoadMore={more} moreFailed
    />
  )],
  ['the ledger', (more: jest.Mock) => (
    <ProfileLedgerTab
      logs={logs} ledgerFiltered={logs} ledgerSearch="" setLedgerSearch={jest.fn()} ledgerRatingFilter="all"
      setLedgerRatingFilter={jest.fn()} halfLifeMap={{}} groupByMonth={(items) => ({ 'MARCH 2026': items })}
      onLoadMore={more} moreFailed
    />
  )],
] as const;

describe.each(ROOMS)('%s', (_name, room) => {
  it('says the rest could not be reached, and asks again when told to', async () => {
    const more = jest.fn();
    const r = await settle(room(more));
    expect(r.getByText('The rest could not be reached.')).toBeTruthy();
    await act(async () => { fireEvent.press(r.getByLabelText('Ask for the rest again')); });
    expect(more).toHaveBeenCalledTimes(1);
  });
});
