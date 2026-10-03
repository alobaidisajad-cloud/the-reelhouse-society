/**
 * auth.test.ts — Auth Store Tests
 * ────────────────────────────────
 * Tests the core authentication lifecycle:
 * session restore, login, logout, user updates.
 */

// Mock supabase before imports
import { useAuthStore } from '../auth';
import { BAD_CREDENTIALS } from '@/src/utils/authSignals';
import { mapAuthError } from '@/src/hooks/useAuthFlow';
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
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));
// The member's rank history (my_entitlement_source): none unless a test says otherwise.
const mockRpc = jest.fn(async (..._args: unknown[]) => ({ data: null as unknown, error: null as unknown }));

jest.mock('../mmkv-storage', () => ({
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
  // The profile cache is member content (it carries their email), so it writes
  // through setSensitive now. These suites stand in for the encrypted case.
  setSensitive: jest.fn(),
  isStorageEncrypted: () => true,
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

    it('a member whose rank lapsed is known as one, and only by asking for their own', async () => {
      // The ropes greet a lapsed member as one coming back. The source that last
      // ranked them is no column anyone may read, so the house is asked for theirs.
      mockSignIn.mockResolvedValue({ data: { user: { id: 'u1', email: 'test@reel.app' } }, error: null });
      mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'u1', username: 'a', role: 'cinephile' }, error: null }) }) }) });
      mockRpc.mockResolvedValueOnce({ data: 'revenuecat', error: null } as never);
      await useAuthStore.getState().login('test@reel.app', 'password123');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockRpc).toHaveBeenCalledWith('my_entitlement_source');
      expect(useAuthStore.getState().user?.entitlement_source).toBe('revenuecat');
    });

    it('a rank history that could not be read leaves what was known, and throws nowhere', async () => {
      mockSignIn.mockResolvedValue({ data: { user: { id: 'u1', email: 'test@reel.app' } }, error: null });
      mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'u1', username: 'a', role: 'cinephile' }, error: null }) }) }) });
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } } as never);
      await useAuthStore.getState().login('test@reel.app', 'password123');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(useAuthStore.getState().user?.entitlement_source).toBeUndefined();
      mockRpc.mockRejectedValueOnce(new TypeError('Network request failed') as never);
      await useAuthStore.getState().login('test@reel.app', 'password123');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
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
      mockInvoke.mockResolvedValue({ data: null, error: { name: 'FunctionsHttpError', context: { status: 401 } } });
      await expect(useAuthStore.getState().login('ghost_account', 'whatever'))
        .rejects.toThrow(BAD_CREDENTIALS);
    });

    /** What a refused or failed username sign-in tells the member, through the form's own reading. */
    const saidFor = async (error: unknown, who = 'noir_fan') => {
      mockInvoke.mockResolvedValue({ data: null, error });
      const err = await useAuthStore.getState().login(who, 'pw').catch((e: Error) => e);
      return mapAuthError((err as Error).message);
    };

    it('a refused handle reads, and counts toward the lock, as a refused address does', async () => {
      const byHandle = await saidFor({ name: 'FunctionsHttpError', context: { status: 401 } });
      expect(byHandle).toEqual(mapAuthError(BAD_CREDENTIALS));
      expect(byHandle.isInvalidCredentials).toBe(true);
    });

    it('with no connection, says the line is down: never that the password is wrong', async () => {
      const said = await saidFor({ name: 'FunctionsFetchError', context: {} });
      expect(said.isInvalidCredentials).toBe(false);
      expect(said.message).toMatch(/connection/);
    });

    it("the door's own 'too many attempts' is passed on as that", async () => {
      const said = await saidFor({ name: 'FunctionsHttpError', context: { status: 429 } });
      expect(said.isInvalidCredentials).toBe(false);
      expect(said.message).toMatch(/Too many attempts/);
    });

    it('a handle typed as the house prints it, with its @, signs in by handle', async () => {
      mockInvoke.mockResolvedValue({ data: null, error: { name: 'FunctionsHttpError', context: { status: 401 } } });
      await useAuthStore.getState().login('@noir_fan', 'pw').catch(() => undefined);
      expect(mockInvoke).toHaveBeenCalledWith('sign-in-with-username', { body: { username: 'noir_fan', password: 'pw' } });
      expect(mockSignIn).not.toHaveBeenCalled();
    });

    it('only an address shaped like one goes to the address door', async () => {
      mockInvoke.mockResolvedValue({ data: null, error: { name: 'FunctionsHttpError', context: { status: 401 } } });
      await useAuthStore.getState().login('old@handle', 'pw').catch(() => undefined);
      expect(mockInvoke).toHaveBeenCalledWith('sign-in-with-username', { body: { username: 'old@handle', password: 'pw' } });
      expect(mockSignIn).not.toHaveBeenCalled();
    });
  });

  /**
   * #50 — signup silently giving you a different handle.
   *
   * handleNotice.test.ts proves the comparison is right. That is NOT the same thing as
   * proving signup records anything: batch 14 measured a case where deleting three real
   * call sites left the entire suite green. These drive the REAL signup() and assert on
   * what reached storage, so deleting the wiring fails CI.
   *
   * Both signup paths are covered, because only one of them can see a handle at all.
   */
  describe('signup — the requested handle is recorded (#50)', () => {
    const { storage } = jest.requireMock('../mmkv-storage');
    const PENDING_KEY = 'reelhouse_pending_handle';

    /** The `.from('profiles')` chain used by signup: update().eq() then select().eq().single() */
    function mockProfiles(returnedUsername: string) {
      mockFrom.mockImplementation(() => {
        const chain: Record<string, unknown> = {};
        chain.update = () => chain;
        chain.eq = () => chain;
        chain.select = () => chain;
        chain.single = async () => ({ data: { id: 'u1', username: returnedUsername }, error: null });
        // `await`ing the chain directly is how the update() call resolves
        chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve);
        return chain;
      });
    }

    const pendingWrites = () =>
      storage.set.mock.calls.filter((c: unknown[]) => c[0] === PENDING_KEY);

    it('PATH A (session, confirmation disabled) records what was asked for', async () => {
      mockSignUp.mockResolvedValue({
        data: { user: { id: 'u1', email: 'a@reel.app' }, session: { access_token: 't' } },
        error: null,
      });
      mockProfiles('morpho_4f8a21');

      await useAuthStore.getState().signup('a@reel.app', 'Pw!23456', 'morpho');

      const writes = pendingWrites();
      expect(writes).toHaveLength(1);
      const stored = JSON.parse(writes[0][1] as string);
      expect(stored).toMatchObject({ id: 'u1', requested: 'morpho' });
    });

    it('PATH B (no session, confirmation required) records it too — the profile already exists, suffixed', async () => {
      mockSignUp.mockResolvedValue({
        data: { user: { id: 'u1', email: 'a@reel.app' }, session: null },
        error: null,
      });

      const result = await useAuthStore.getState().signup('a@reel.app', 'Pw!23456', 'morpho');

      expect(result.needsConfirmation).toBe(true);
      const writes = pendingWrites();
      expect(writes).toHaveLength(1);
      expect(JSON.parse(writes[0][1] as string)).toMatchObject({ id: 'u1', requested: 'morpho' });
    });

    it('records even when the handle came back unchanged — the reader decides, not signup', async () => {
      // signup must not try to be clever here: on PATH B it cannot see the handle at
      // all, so "only record on a mismatch" is not a decision it is able to make.
      mockSignUp.mockResolvedValue({
        data: { user: { id: 'u1', email: 'a@reel.app' }, session: { access_token: 't' } },
        error: null,
      });
      mockProfiles('morpho');

      await useAuthStore.getState().signup('a@reel.app', 'Pw!23456', 'morpho');
      expect(pendingWrites()).toHaveLength(1);
    });

    it('a failed signup records nothing', async () => {
      mockSignUp.mockResolvedValue({ data: null, error: new Error('email taken') });
      await expect(useAuthStore.getState().signup('a@reel.app', 'Pw!23456', 'morpho')).rejects.toThrow();
      expect(pendingWrites()).toHaveLength(0);
    });
  });

  /**
   * Signup with a session is a door into one, like sign-in and the email link,
   * and now goes through the same one (adoptSession). Its own profile read had
   * no retry and no report: when it failed, a brand-new member was stored with
   * no handle at all.
   */
  describe('signup — in by the same door as sign-in', () => {
    function mockProfileReads(answers: { data: unknown; error: unknown }[]) {
      let n = 0;
      mockFrom.mockImplementation(() => {
        const chain: Record<string, unknown> = {};
        chain.update = () => chain;
        chain.eq = () => chain;
        chain.select = () => chain;
        chain.single = async () => answers[Math.min(n++, answers.length - 1)];
        chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve);
        return chain;
      });
      return () => n;
    }

    beforeEach(() => {
      mockSignUp.mockResolvedValue({
        data: { user: { id: 'u1', email: 'a@reel.app' }, session: { access_token: 't' } },
        error: null,
      });
    });

    it('a profile read that failed is read again, and the member gets their handle', async () => {
      const reads = mockProfileReads([
        { data: null, error: { message: 'TypeError: Network request failed' } },
        { data: { id: 'u1', username: 'morpho' }, error: null },
      ]);
      await useAuthStore.getState().signup('a@reel.app', 'Pw!23456', 'morpho');
      await new Promise((r) => setTimeout(r, 0));
      expect(reads()).toBe(2);
      expect((useAuthStore.getState().user as { username?: string }).username).toBe('morpho');
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('a profile it holds is used at once, and not read twice', async () => {
      const reads = mockProfileReads([{ data: { id: 'u1', username: 'morpho_4f8a21' }, error: null }]);
      await useAuthStore.getState().signup('a@reel.app', 'Pw!23456', 'morpho');
      expect((useAuthStore.getState().user as { username?: string }).username).toBe('morpho_4f8a21');
      await new Promise((r) => setTimeout(r, 0));
      expect(reads()).toBe(1);
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
