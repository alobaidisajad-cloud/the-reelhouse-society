/**
 * blockStore.pbt.test.ts — Property-Based Tests for BlockStore
 * ─────────────────────────────────────────────────────────────
 * Validates universal correctness properties of the BlockStore
 * using fast-check arbitraries.
 */
import fc from 'fast-check';
import { useBlockStore } from '../blockStore';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockStorage: Record<string, string> = {};

jest.mock('../mmkv-storage', () => ({
  storage: {
    getString: jest.fn((key: string) => mockStorage[key] ?? undefined),
    set: jest.fn((key: string, value: string) => { mockStorage[key] = value; }),
    delete: jest.fn((key: string) => { delete mockStorage[key]; }),
  },
  zustandMMKVStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

const mockUser = { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', username: 'testuser', role: 'cinephile' };

jest.mock('../auth', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({ user: mockUser })),
  },
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      }),
    }),
    rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

jest.mock('../../lib/queryClient', () => ({
  queryClient: { invalidateQueries: jest.fn() },
}));

jest.mock('../../lib/sentry', () => ({
  captureError: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), info: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));

jest.mock('../resetAllStores', () => ({
  registerStoreReset: jest.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function resetStore() {
  useBlockStore.setState({
    blocked: [],
    muted: [],
    _blockedIndex: new Set<string>(),
    _mutedIndex: new Set<string>(),
  });
  // Clear mock storage
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
}

// ── Property Tests ───────────────────────────────────────────────────────────

describe('BlockStore Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
  });

  /**
   * Property 1: Block supersedes mute (exclusivity invariant)
   * **Validates: Requirements 2.3, 2.6**
   *
   * For any target, muteUser then blockUser results in
   * isBlocked=true, isMuted=false.
   */
  describe('Property 1: Block supersedes mute', () => {
    it('blocking a muted user results in isBlocked=true and isMuted=false', async () => {
      await fc.assert(
        fc.asyncProperty(fc.uuid(), async (targetId) => {
          // Precondition: target is not self
          fc.pre(targetId !== mockUser.id);

          resetStore();

          // First mute the user
          await useBlockStore.getState().muteUser(targetId);
          // Then block them
          await useBlockStore.getState().blockUser(targetId);

          const state = useBlockStore.getState();
          // Block supersedes mute
          expect(state.isBlocked(targetId)).toBe(true);
          expect(state.isMuted(targetId)).toBe(false);
        }),
        { numRuns: 50 },
      );
    });
  });

  /**
   * Property 2: Block/mute operations correctly update indices
   * **Validates: Requirements 2.1, 2.2, 2.4, 2.6**
   *
   * blockUser → isBlocked=true
   * muteUser → isMuted=true
   * unblockUser → isBlocked=false
   * unmuteUser → isMuted=false
   */
  describe('Property 2: Operations update indices', () => {
    it('blockUser sets isBlocked=true', async () => {
      await fc.assert(
        fc.asyncProperty(fc.uuid(), async (targetId) => {
          fc.pre(targetId !== mockUser.id);
          resetStore();

          await useBlockStore.getState().blockUser(targetId);
          expect(useBlockStore.getState().isBlocked(targetId)).toBe(true);
        }),
        { numRuns: 50 },
      );
    });

    it('muteUser sets isMuted=true', async () => {
      await fc.assert(
        fc.asyncProperty(fc.uuid(), async (targetId) => {
          fc.pre(targetId !== mockUser.id);
          resetStore();

          await useBlockStore.getState().muteUser(targetId);
          expect(useBlockStore.getState().isMuted(targetId)).toBe(true);
        }),
        { numRuns: 50 },
      );
    });

    it('unblockUser sets isBlocked=false', async () => {
      await fc.assert(
        fc.asyncProperty(fc.uuid(), async (targetId) => {
          fc.pre(targetId !== mockUser.id);
          resetStore();

          // Block first, then unblock
          await useBlockStore.getState().blockUser(targetId);
          await useBlockStore.getState().unblockUser(targetId);
          expect(useBlockStore.getState().isBlocked(targetId)).toBe(false);
        }),
        { numRuns: 50 },
      );
    });

    it('unmuteUser sets isMuted=false', async () => {
      await fc.assert(
        fc.asyncProperty(fc.uuid(), async (targetId) => {
          fc.pre(targetId !== mockUser.id);
          resetStore();

          // Mute first, then unmute
          await useBlockStore.getState().muteUser(targetId);
          await useBlockStore.getState().unmuteUser(targetId);
          expect(useBlockStore.getState().isMuted(targetId)).toBe(false);
        }),
        { numRuns: 50 },
      );
    });
  });

  /**
   * Property 9: MMKV block list round-trip
   * **Validates: Requirements 10.1, 10.5**
   *
   * persistToCache then hydrateFromCache preserves all blocked and muted IDs.
   */
  describe('Property 9: MMKV round-trip', () => {
    it('persistToCache then hydrateFromCache preserves all blocked and muted IDs', () => {
      fc.assert(
        fc.property(
          fc.array(fc.uuid(), { minLength: 0, maxLength: 20 }),
          fc.array(fc.uuid(), { minLength: 0, maxLength: 20 }),
          (blockedIds, mutedIds) => {
            // Deduplicate to avoid ambiguity
            const uniqueBlocked = [...new Set(blockedIds)];
            const uniqueMuted = [...new Set(mutedIds)].filter(id => !uniqueBlocked.includes(id));

            resetStore();

            // Set up state directly
            useBlockStore.setState({
              blocked: uniqueBlocked,
              muted: uniqueMuted,
              _blockedIndex: new Set(uniqueBlocked),
              _mutedIndex: new Set(uniqueMuted),
            });

            // Persist
            useBlockStore.getState().persistToCache(mockUser.id);

            // Clear state
            useBlockStore.setState({
              blocked: [],
              muted: [],
              _blockedIndex: new Set<string>(),
              _mutedIndex: new Set<string>(),
            });

            // Hydrate
            useBlockStore.getState().hydrateFromCache(mockUser.id);

            const state = useBlockStore.getState();
            expect(state.blocked).toEqual(uniqueBlocked);
            expect(state.muted).toEqual(uniqueMuted);
            expect(state._blockedIndex).toEqual(new Set(uniqueBlocked));
            expect(state._mutedIndex).toEqual(new Set(uniqueMuted));
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  /**
   * Property 10: Logout clears all block/mute state
   * **Validates: Requirements 2.9**
   *
   * For any non-empty store, clearOnLogout results in empty indices
   * and deleted MMKV key.
   */
  describe('Property 10: Logout clears state', () => {
    it('clearOnLogout empties all indices and deletes MMKV key', () => {
      const { storage } = require('../mmkv-storage');

      fc.assert(
        fc.property(
          fc.array(fc.uuid(), { minLength: 1, maxLength: 20 }),
          fc.array(fc.uuid(), { minLength: 0, maxLength: 20 }),
          (blockedIds, mutedIds) => {
            const uniqueBlocked = [...new Set(blockedIds)];
            const uniqueMuted = [...new Set(mutedIds)];

            resetStore();

            // Set non-empty state
            useBlockStore.setState({
              blocked: uniqueBlocked,
              muted: uniqueMuted,
              _blockedIndex: new Set(uniqueBlocked),
              _mutedIndex: new Set(uniqueMuted),
            });

            // Persist first so MMKV key exists
            useBlockStore.getState().persistToCache(mockUser.id);

            // Clear on logout
            useBlockStore.getState().clearOnLogout();

            const state = useBlockStore.getState();
            expect(state.blocked).toEqual([]);
            expect(state.muted).toEqual([]);
            expect(state._blockedIndex.size).toBe(0);
            expect(state._mutedIndex.size).toBe(0);

            // MMKV key should be deleted
            expect(storage.delete).toHaveBeenCalledWith(`reelhouse_blocks_${mockUser.id}`);
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});
