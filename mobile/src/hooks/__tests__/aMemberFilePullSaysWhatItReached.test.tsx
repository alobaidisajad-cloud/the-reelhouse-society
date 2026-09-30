/**
 * aMemberFilePullSaysWhatItReached.test.tsx — pulling a member's file to
 * refresh it, when the house cannot be reached.
 *
 * The file stays as it was drawn (the member is already known), and the read's
 * failure went into state the pull never looked at: nothing was said. Every
 * other list in the app says "Could not refresh — check your connection."; the
 * file now does too. fetchUserData answers `false` when it could not read.
 */
import { renderHook, act } from '@testing-library/react-native';

import { useProfileController } from '../useProfileController';

const mockToastError = jest.fn();
jest.mock('@/src/utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: (...a: unknown[]) => mockToastError(...a), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: fn };
});

/** What the member's read answers: `false` when it could not read. */
let mockRead: boolean | void = undefined;
jest.mock('@/src/hooks/useProfileData', () => ({
  useProfileData: () => ({
    targetUser: { id: 'u2', username: 'tomasreyes' },
    loading: false, error: null, refreshing: false, setRefreshing: jest.fn(),
    fetchUserData: async () => mockRead,
    loadTabData: jest.fn(async () => {}),
    refreshTabWithFilters: jest.fn(async () => {}),
    setTabDataLoaded: jest.fn(),
    tabDataLoaded: {}, tabFailed: {},
  }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => ({ username: 'tomasreyes' }),
  useNavigation: () => ({ setParams: jest.fn(), addListener: () => () => {} }),
}));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));

beforeEach(() => { mockToastError.mockClear(); });

describe('a pull on a member’s file', () => {
  it('that reached nothing keeps the file, and says so — it said nothing', async () => {
    mockRead = false;
    const { result } = await renderHook(() => useProfileController());
    await act(async () => { await result.current.onRefresh(); });
    expect(mockToastError).toHaveBeenCalledWith('Could not refresh — check your connection.');
  });

  it('that was answered says nothing', async () => {
    mockRead = undefined;
    const { result } = await renderHook(() => useProfileController());
    await act(async () => { await result.current.onRefresh(); });
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
