/**
 * aNewMemberStartsUnfiltered.test.tsx — every filter is wiped when the member
 * on the page changes.
 *
 * The controller wiped six of its twelve: a search, a decade, a shelf's sort or
 * search, or a stack's sort or search set on one member's file narrowed the
 * next member's room, under a promise of "zero state contamination".
 */
import { renderHook, act } from '@testing-library/react-native';
import { useProfileController } from '../useProfileController';

let mockTarget: { id: string; username: string } = { id: 'u1', username: 'tomas' };
jest.mock('@/src/hooks/useProfileData', () => ({
  useProfileData: () => ({
    targetUser: mockTarget, loading: false, error: null, refreshing: false, setRefreshing: jest.fn(),
    fetchUserData: jest.fn(async () => undefined), loadTabData: jest.fn(async () => {}),
    refreshTabWithFilters: jest.fn(async () => {}), setTabDataLoaded: jest.fn(), setTargetUser: jest.fn(),
    tabDataLoaded: {}, tabFailed: {},
  }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ username: 'tomas', tab: 'archive' }),
  useNavigation: () => ({ setParams: jest.fn(), addListener: () => () => {} }),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));

describe('a new member on the page', () => {
  it('starts with every filter cleared, not six of twelve', async () => {
    const { result, rerender } = await renderHook(() => useProfileController());
    await act(async () => {
      result.current.setArchiveSieve('abandoned');
      result.current.setArchiveSearch('noir');
      result.current.setLedgerSearch('noir');
      result.current.setLedgerRatingFilter(5 as never);
      result.current.setWatchlistSearch('noir');
      result.current.setWatchlistSort('az');
      result.current.setWatchlistDecade(1970 as never);
      result.current.setPhysicalFilter('VHS');
      result.current.setPhysicalSort('za' as never);
      result.current.setPhysicalSearch('criterion');
      result.current.setListsSort('az' as never);
      result.current.setListsSearch('noir');
    });
    mockTarget = { id: 'u2', username: 'ana' };
    await act(async () => { rerender({}); });
    const c = result.current;
    expect({
      archiveSieve: c.archiveSieve, archiveSearch: c.archiveSearch, ledgerSearch: c.ledgerSearch,
      ledgerRatingFilter: c.ledgerRatingFilter, watchlistSearch: c.watchlistSearch, watchlistSort: c.watchlistSort,
      watchlistDecade: c.watchlistDecade, physicalFilter: c.physicalFilter, physicalSort: c.physicalSort,
      physicalSearch: c.physicalSearch, listsSort: c.listsSort, listsSearch: c.listsSearch,
    }).toEqual({
      archiveSieve: 'all', archiveSearch: '', ledgerSearch: '', ledgerRatingFilter: 'all',
      watchlistSearch: '', watchlistSort: 'default', watchlistDecade: null, physicalFilter: null,
      physicalSort: 'default', physicalSearch: '', listsSort: 'default', listsSearch: '',
    });
  });
});
