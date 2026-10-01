/**
 * aFollowThatThrowsIsSaid.test.tsx — a follow that failed in a way the store
 * did not catch.
 *
 * The store says why on every failure it catches. One it did not catch was
 * rolled back in silence: the count fell back and nothing said the follow
 * had not happened.
 */
import { renderHook, act } from '@testing-library/react-native';
import { useProfileController } from '../useProfileController';
import reelToast from '@/src/utils/reelToast';

let mockTarget = { id: 'u2', username: 'ana', followers_count: 4, is_social_private: false };
const mockSetTargetUser = jest.fn((fn: (p: typeof mockTarget) => typeof mockTarget) => { mockTarget = fn(mockTarget); });
jest.mock('@/src/hooks/useProfileData', () => ({
  useProfileData: () => ({
    targetUser: mockTarget, loading: false, error: null, refreshing: false, setRefreshing: jest.fn(),
    fetchUserData: jest.fn(async () => undefined), loadTabData: jest.fn(async () => {}),
    refreshTabWithFilters: jest.fn(async () => {}), setTabDataLoaded: jest.fn(), setTargetUser: mockSetTargetUser,
    tabDataLoaded: {}, tabFailed: {},
  }),
}));
jest.mock('@/src/stores/domain/socialSlice', () => ({
  followUser: jest.fn(async () => { throw new Error('The request was refused'); }),
  unfollowUser: jest.fn(async () => true),
}));
jest.mock('@/src/stores/auth', () => {
  const state = { user: { id: 'me', username: 'tomas' }, isAuthenticated: true };
  return { useAuthStore: Object.assign((sel: (s: typeof state) => unknown) => sel(state), { getState: () => state }) };
});
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ username: 'ana' }),
  useNavigation: () => ({ setParams: jest.fn(), addListener: () => () => {} }),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));

it('is said, and the count goes back to what it was', async () => {
  const { result } = await renderHook(() => useProfileController());
  await act(async () => { await result.current.toggleFollow(); });
  expect(reelToast.error).toHaveBeenCalledWith('Could not follow @ana. Please try again.');
  expect(mockTarget.followers_count).toBe(4);
  expect(result.current.followLoading).toBe(false);
});
