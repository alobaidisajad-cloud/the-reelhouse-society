/**
 * aMemberFileFollowsTheirRename.test.tsx — review round 11
 * ─────────────────────────────────────────────────────────────────────────────
 * A member link carries the member's id. Opened after that member renamed, the file is found by
 * the id (ProfileDataService), and the route takes the handle the member holds now, in place: their
 * FOLLOW, their follow state and every link from the file then read the member they are, not the
 * old handle (free, or another member's now). A row that answered for someone else never moves the
 * route, and your own file reads by its handle, always the live one.
 */
import { renderHook } from '@testing-library/react-native';
import { useProfileController } from '../useProfileController';

const RENAMED = '11111111-1111-4111-8111-111111111111';
const SOMEONE_ELSE = '22222222-2222-4222-8222-222222222222';

let mockTarget: { id: string; username: string; followers_count: number; is_social_private: boolean } | null = null;
const mockUseProfileData = jest.fn();
jest.mock('@/src/hooks/useProfileData', () => ({
  useProfileData: (args: unknown) => {
    mockUseProfileData(args);
    return {
      targetUser: mockTarget, loading: false, error: null, refreshing: false, setRefreshing: jest.fn(),
      fetchUserData: jest.fn(async () => undefined), loadTabData: jest.fn(async () => {}),
      refreshTabWithFilters: jest.fn(async () => {}), setTabDataLoaded: jest.fn(), setTargetUser: jest.fn(),
      tabDataLoaded: {}, tabFailed: {}, tabAnswered: { archive: true, ledger: true, watchlist: true, lists: true, physical: true },
    };
  },
}));
jest.mock('@/src/stores/domain/socialSlice', () => ({
  followUser: jest.fn(async () => true),
  unfollowUser: jest.fn(async () => true),
  hydrateFollowing: jest.fn(async () => {}),
}));
jest.mock('@/src/stores/auth', () => {
  const state = { user: { id: '99999999-9999-4999-8999-999999999999', username: 'tomas' }, isAuthenticated: true };
  return { useAuthStore: Object.assign((sel: (s: typeof state) => unknown) => sel(state), { getState: () => state }) };
});
let mockParams: Record<string, string> = {};
const mockSetParams = jest.fn();
jest.mock('expo-router', () => ({
  ...require('@/test-utils/expoRouterMock').expoRouterMock(),
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ setParams: mockSetParams, addListener: () => () => {} }),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock('expo-router/react-navigation', () => ({ ...require('@/test-utils/navigationMock').navigationMock(), useIsFocused: () => true }));
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));

const member = (id: string, username: string) => ({ id, username, followers_count: 3, is_social_private: false });

beforeEach(() => {
  jest.clearAllMocks();
});

it('a link to a member who renamed since moves the route to the handle they hold now', async () => {
  mockParams = { username: 'bob', id: RENAMED };
  mockTarget = member(RENAMED, 'bobby');
  await renderHook(() => useProfileController());
  expect(mockUseProfileData).toHaveBeenCalledWith(expect.objectContaining({ username: 'bob', knownId: RENAMED }));
  expect(mockSetParams).toHaveBeenCalledWith({ username: 'bobby' });
});

it('a member under the handle the link named leaves the route as it is, whatever its spelling', async () => {
  mockParams = { username: 'Bob', id: RENAMED };
  mockTarget = member(RENAMED, 'bob');
  await renderHook(() => useProfileController());
  expect(mockSetParams).not.toHaveBeenCalled();
});

it('a row that answered for another member never moves the route', async () => {
  mockParams = { username: 'bob', id: RENAMED };
  mockTarget = member(SOMEONE_ELSE, 'carla');
  await renderHook(() => useProfileController());
  expect(mockSetParams).not.toHaveBeenCalled();
});

it('a shared address with no id leaves the route as it is', async () => {
  mockParams = { username: 'bob' };
  mockTarget = member(RENAMED, 'bobby');
  await renderHook(() => useProfileController());
  expect(mockSetParams).not.toHaveBeenCalled();
});
