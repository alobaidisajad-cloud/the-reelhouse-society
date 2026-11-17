/**
 * aFollowFiledAsARequestCountsNoOne.test.tsx — review round 11
 * ─────────────────────────────────────────────────────────────────────────────
 * FOLLOW on a member who switched to private while their file was open raised their FOLLOWERS by
 * one, from the privacy the file had read, though the house filed only a request. The count now
 * follows what was filed: a request counts no one, and the file knows the member is private. A
 * follow of an open member still counts one.
 */
import { renderHook, act } from '@testing-library/react-native';
import { useProfileController } from '../useProfileController';
import { useSocialStore } from '@/src/stores/socialStore';
import { followUser } from '@/src/stores/domain/socialSlice';

let mockTarget = { id: 'u2', username: 'ana', followers_count: 4, is_social_private: false };
const mockSetTargetUser = jest.fn((fn: (p: typeof mockTarget) => typeof mockTarget) => { mockTarget = fn(mockTarget); });
jest.mock('@/src/hooks/useProfileData', () => ({
  useProfileData: () => ({
    targetUser: mockTarget, loading: false, error: null, refreshing: false, setRefreshing: jest.fn(),
    fetchUserData: jest.fn(async () => undefined), loadTabData: jest.fn(async () => {}),
    refreshTabWithFilters: jest.fn(async () => {}), setTabDataLoaded: jest.fn(), setTargetUser: mockSetTargetUser,
    tabDataLoaded: {}, tabFailed: {}, tabAnswered: { archive: true, ledger: true, watchlist: true, lists: true, physical: true },
  }),
}));
// The store as socialSlice leaves it once the house answered: what was filed is what it reads.
jest.mock('@/src/stores/domain/socialSlice', () => ({
  followUser: jest.fn(),
  unfollowUser: jest.fn(async () => true),
  hydrateFollowing: jest.fn(async () => {}),
}));
jest.mock('@/src/stores/auth', () => {
  const state = { user: { id: 'me', username: 'tomas' }, isAuthenticated: true };
  return { useAuthStore: Object.assign((sel: (s: typeof state) => unknown) => sel(state), { getState: () => state }) };
});
jest.mock('expo-router', () => ({
  ...require('@/test-utils/expoRouterMock').expoRouterMock(),
  useLocalSearchParams: () => ({ username: 'ana' }),
  useNavigation: () => ({ setParams: jest.fn(), addListener: () => () => {} }),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock('expo-router/react-navigation', () => ({ ...require('@/test-utils/navigationMock').navigationMock(), useIsFocused: () => true }));
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));

/** The house files the follow as this, and the store reads it so. */
const theHouseFiles = (as: 'following' | 'requested') => {
  (followUser as jest.Mock).mockImplementation(async (handle: string) => {
    if (as === 'requested') useSocialStore.getState().addRequested(handle);
    else useSocialStore.getState().addFollowing(handle);
    return true;
  });
};

beforeEach(() => {
  mockTarget = { id: 'u2', username: 'ana', followers_count: 4, is_social_private: false };
  useSocialStore.getState().setFollowing([]);
  useSocialStore.getState().setRequested([]);
  useSocialStore.setState({ followingKnown: 'held' });
});

it('a follow the house filed as a request counts no one, and the file knows the member is private now', async () => {
  theHouseFiles('requested');
  const { result } = await renderHook(() => useProfileController());
  await act(async () => { await result.current.toggleFollow(); });
  expect(followUser).toHaveBeenCalledWith('ana', { id: 'u2', isPrivate: false });
  expect(mockTarget.followers_count).toBe(4);
  expect(mockTarget.is_social_private).toBe(true);
  expect(result.current.isRequested).toBe(true);
});

it('a follow of an open member counts one, as before', async () => {
  theHouseFiles('following');
  const { result } = await renderHook(() => useProfileController());
  await act(async () => { await result.current.toggleFollow(); });
  expect(mockTarget.followers_count).toBe(5);
  expect(mockTarget.is_social_private).toBe(false);
});
