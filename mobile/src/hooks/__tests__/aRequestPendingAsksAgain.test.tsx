/**
 * aRequestPendingAsksAgain.test.tsx — review round 3
 *
 * A follow request is the other member's to answer, and a decline sends no notice. The file of a
 * member this one has asked stood REQUESTED and sealed, a pull too, until a relaunch: the follow
 * list was never read again. Opened on a request pending, and pulled, it is read again.
 */
import { renderHook, act } from '@testing-library/react-native';

import { useSocialStore } from '@/src/stores/followStore';
import { useProfileController } from '../useProfileController';

const mockHydrate = jest.fn(async () => {});
jest.mock('@/src/stores/domain/socialSlice', () => ({
  hydrateFollowing: () => mockHydrate(),
  followUser: jest.fn(async () => true),
  unfollowUser: jest.fn(async () => true),
}));
jest.mock('@/src/utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: fn };
});
const mockFetchUserData = jest.fn(async () => undefined);
jest.mock('@/src/hooks/useProfileData', () => ({
  useProfileData: () => ({
    targetUser: { id: 'u2', username: 'tomasreyes', is_social_private: true },
    loading: false, error: null, refreshing: false, setRefreshing: jest.fn(),
    fetchUserData: () => mockFetchUserData(),
    loadTabData: jest.fn(async () => {}),
    refreshTabWithFilters: jest.fn(async () => {}),
    setTabDataLoaded: jest.fn(),
    tabDataLoaded: {}, tabFailed: {}, tabAnswered: { archive: true, ledger: true, watchlist: true, lists: true, physical: true },
  }),
}));
jest.mock('expo-router', () => ({
  ...require('@/test-utils/expoRouterMock').expoRouterMock(),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => ({ username: 'tomasreyes' }),
  useNavigation: () => ({ setParams: jest.fn(), addListener: () => () => {} }),
}));
jest.mock('expo-router/react-navigation', () => ({ ...require('@/test-utils/navigationMock').navigationMock(), useIsFocused: () => true }));

const holds = (following: string[], requested: string[]) => useSocialStore.setState({
  following, _followingIndex: new Set(following), requested, _requestedIndex: new Set(requested), followingKnown: 'held',
});

beforeEach(() => { mockHydrate.mockClear(); mockFetchUserData.mockClear(); });

describe('the file of a member asked to follow', () => {
  it('opened on a request pending, asks the follow list again', async () => {
    holds([], ['tomasreyes']);
    await renderHook(() => useProfileController());
    expect(mockHydrate).toHaveBeenCalledTimes(1);
  });

  it('pulled on a request pending, asks the follow list before the file is read', async () => {
    holds([], ['tomasreyes']);
    const order: string[] = [];
    mockHydrate.mockImplementation(async () => { order.push('follows'); });
    mockFetchUserData.mockImplementation(async () => { order.push('file'); return undefined; });
    const { result } = await renderHook(() => useProfileController());
    order.length = 0;
    await act(async () => { await result.current.onRefresh(); });
    expect(order).toEqual(['follows', 'file']);
  });

  it('opened with nothing pending, asks nothing more', async () => {
    holds(['tomasreyes'], []);
    const { result } = await renderHook(() => useProfileController());
    await act(async () => { await result.current.onRefresh(); });
    expect(mockHydrate).not.toHaveBeenCalled();
  });
});
