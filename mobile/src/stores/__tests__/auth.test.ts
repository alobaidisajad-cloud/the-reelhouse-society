/**
 * auth.test.ts — Auth Store Tests
 * ────────────────────────────────
 * Tests the core authentication lifecycle:
 * session restore, login, logout, user updates.
 */

// Mock supabase before imports
import { useAuthStore } from '../auth';
// ProfileWriteService is jest.mock'd below — no direct import needed

const mockSignIn = jest.fn();
const mockSignUp = jest.fn();
const mockSignOut = jest.fn();
const mockGetSession = jest.fn();
const mockGetUser = jest.fn();
const mockFrom = jest.fn();

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignIn(...args),
      signUp: (...args: unknown[]) => mockSignUp(...args),
      signOut: () => mockSignOut(),
      getSession: () => mockGetSession(),
      getUser: () => mockGetUser(),
    },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

jest.mock('../mmkv-storage', () => ({
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
  zustandMMKVStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
  getSecureStorage: jest.fn().mockResolvedValue({ set: jest.fn(), delete: jest.fn(), getString: jest.fn() }),
}));

jest.mock('../resetAllStores', () => ({
  __esModule: true,
  registerStoreReset: jest.fn(),
  resetAllStores: jest.fn(),
}));



jest.mock('../../lib/revenueCat', () => ({
  logoutRevenueCat: jest.fn(),
}));

jest.mock('../../lib/sentry', () => ({
  setSentryUser: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureError: jest.fn(),
}));

jest.mock('../../utils/withRetry', () => ({
  __esModule: true,
  withRetry: jest.fn(<T,>(fn: () => Promise<T>) => fn()),
  isRetryable: jest.fn(() => true),
}));

jest.mock('../../lib/queryClient', () => ({
  queryClient: { clear: jest.fn(), cancelQueries: jest.fn() },
}));

jest.mock('../../lib/pushNotifications', () => ({
  removePushToken: jest.fn(),
}));

jest.mock('../../utils/reelToast', () => {
  const fn = jest.fn();
  fn.error = jest.fn();
  fn.success = jest.fn();
  return { __esModule: true, default: fn };
});

jest.mock('../../utils/logger', () => ({
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('../../utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(),
  flushOfflineQueue: jest.fn(),
  setQueueUserId: jest.fn(),
}));

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  deleteItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

jest.mock('../domain/socialSlice', () => ({
  followUser: jest.fn(),
  unfollowUser: jest.fn(),
  hydrateFollowing: jest.fn(),
  clearSocialCaches: jest.fn(),
}));

jest.mock('../notificationStore', () => ({
  __esModule: true,
  useNotificationStore: {
    getState: () => ({})
  },
  teardownNotificationRealtime: jest.fn(),
}));

// Updated mock path from legacy 'profileService' to 'ProfileWriteService'
jest.mock('../../services/ProfileWriteService', () => ({
  ProfileService: {
    updateProfile: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('AuthStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      loading: false,
    });
  });

  describe('initial state', () => {
    it('starts with no user and not authenticated', () => {
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.loading).toBe(false);
    });
  });

  describe('login', () => {
    it('sets user on successful login', async () => {
      const mockUser = { id: 'u1', email: 'test@reel.app' };
      const mockProfile = {
        id: 'u1', username: 'cinephile1', bio: 'Film lover',
        avatar_url: null, role: 'cinephile', display_name: 'Cinephile',
      };

      mockSignIn.mockResolvedValue({ data: { user: mockUser }, error: null });
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockProfile, error: null }),
          }),
        }),
      });

      await useAuthStore.getState().login('test@reel.app', 'password123');

      // Wait for background enrichment (fire-and-forget withRetry promise)
      await new Promise(resolve => setTimeout(resolve, 0));

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toBeTruthy();
      expect(state.user?.username).toBe('cinephile1');
    });

    it('throws on invalid credentials', async () => {
      mockSignIn.mockResolvedValue({
        data: { user: null },
        error: new Error('Invalid login credentials'),
      });

      await expect(useAuthStore.getState().login('bad@reel.app', 'wrong'))
        .rejects.toThrow();
    });
  });

  describe('logout', () => {
    it('clears user state on logout', async () => {
      useAuthStore.setState({
        user: { id: 'u1', username: 'test', role: 'cinephile' } as unknown as import('../../types').User,
        isAuthenticated: true,
      });

      mockSignOut.mockResolvedValue({ error: null });

      await useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });});
