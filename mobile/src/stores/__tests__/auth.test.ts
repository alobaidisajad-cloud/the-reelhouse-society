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
const mockSetSession = jest.fn();
const mockInvoke = jest.fn();
const mockFrom = jest.fn();

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignIn(...args),
      signUp: (...args: unknown[]) => mockSignUp(...args),
      signOut: () => mockSignOut(),
      getSession: () => mockGetSession(),
      getUser: () => mockGetUser(),
      setSession: (...args: unknown[]) => mockSetSession(...args),
    },
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
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
  // login()/signup() re-link the store identity to the account that just signed in —
  // initRevenueCat only runs at app start, so without this a second account on the
  // same device would purchase against an anonymous RevenueCat id.
  identifyUser: jest.fn(),
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
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});

jest.mock('../../utils/logger', () => ({
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('../../utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(),
  flushOfflineQueue: jest.fn(),
  clearOfflineQueue: jest.fn(),
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

  describe('hydrateFromCache (cold-start fast path)', () => {
    const { storage } = jest.requireMock('../mmkv-storage');

    it('hydrates the cached user synchronously and clears loading', () => {
      useAuthStore.setState({ loading: true });
      storage.getString.mockImplementation((key: string) => {
        if (key === 'recovery_pending') return undefined;
        if (key === 'last_user_id') return 'u1';
        if (key === 'ironvault_user_cache_u1') return JSON.stringify({ id: 'u1', username: 'sajad' });
        return undefined;
      });
      useAuthStore.getState().hydrateFromCache();
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect((state.user as any)?.id).toBe('u1');
      expect(state.loading).toBe(false);
    });

    it('NEVER hydrates while a recovery reset is pending, and leaves the flag armed', () => {
      useAuthStore.setState({ loading: true });
      storage.getString.mockImplementation((key: string) => {
        if (key === 'recovery_pending') return 'true';
        if (key === 'last_user_id') return 'u1';
        if (key === 'ironvault_user_cache_u1') return JSON.stringify({ id: 'u1' });
        return undefined;
      });
      useAuthStore.getState().hydrateFromCache();
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.loading).toBe(false);
      // The background restoreSession owns flag cleanup — hydrate must not touch it.
      expect(storage.delete).not.toHaveBeenCalledWith('recovery_pending');
    });

    it('clears loading without auth when there is no cache', () => {
      useAuthStore.setState({ loading: true });
      storage.getString.mockReturnValue(undefined);
      useAuthStore.getState().hydrateFromCache();
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.loading).toBe(false);
    });

    it('survives a corrupted cache blob', () => {
      useAuthStore.setState({ loading: true });
      storage.getString.mockImplementation((key: string) => {
        if (key === 'last_user_id') return 'u1';
        if (key === 'ironvault_user_cache_u1') return '{not json';
        return undefined;
      });
      useAuthStore.getState().hydrateFromCache();
      const state = useAuthStore.getState();
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

    it('username login authenticates server-side without touching signInWithPassword (EMAIL-ENUM-1)', async () => {
      const mockUser = { id: 'u9', email: 'hidden@reel.app' };
      mockInvoke.mockResolvedValue({ data: { access_token: 'at', refresh_token: 'rt' }, error: null });
      mockSetSession.mockResolvedValue({ data: { user: mockUser, session: {} }, error: null });
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: { id: 'u9', username: 'noir_fan', role: 'cinephile' }, error: null }),
          }),
        }),
      });

      await useAuthStore.getState().login('noir_fan', 'password123');
      await new Promise(resolve => setTimeout(resolve, 0));

      // Routed through the edge function + setSession, NOT the client email sign-in.
      expect(mockInvoke).toHaveBeenCalledWith('sign-in-with-username', { body: { username: 'noir_fan', password: 'password123' } });
      expect(mockSetSession).toHaveBeenCalledWith({ access_token: 'at', refresh_token: 'rt' });
      expect(mockSignIn).not.toHaveBeenCalled();
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('username login throws a generic error when the edge function fails (no enumeration)', async () => {
      mockInvoke.mockResolvedValue({ data: null, error: new Error('Unauthorized') });
      await expect(useAuthStore.getState().login('ghost_account', 'whatever'))
        .rejects.toThrow('Invalid username or password.');
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
