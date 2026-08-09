/**
 * blockStore.ts — User Block/Mute Store (Society Report System)
 * ──────────────────────────────────────────────────────────────
 * Client-side store managing blocked and muted user lists with O(1) lookups,
 * MMKV persistence for instant cold-start filtering, and Supabase sync.
 *
 * Pattern: Mirrors followStore.ts architecture — dedicated Zustand store
 * with in-memory Set indices, optimistic updates, MMKV persistence, and
 * centralized cleanup via resetAllStores.
 *
 * Key invariants:
 *   • Block supersedes mute (blocking a muted user removes the mute)
 *   • Self-block is prevented (assertion + early return)
 *   • Optimistic update → persist MMKV → Supabase upsert/delete → rollback on failure
 *   • React Query cache invalidation on block/mute changes
 *   • Haptic feedback and reelToast confirmations on all mutations
 */
import TactileEngine from '@/src/utils/TactileEngine';
import { create } from 'zustand';
import { queryClient } from '../lib/queryClient';
import { captureError } from '../lib/sentry';
import { supabase } from '../lib/supabase';
import type { PersistedBlockData } from '../types/moderation';
import { logger } from '../utils/logger';
import reelToast from '../utils/reelToast';
import { useAuthStore } from './auth';
import { storage, setSensitive } from './mmkv-storage';
import { registerStoreReset } from './resetAllStores';
import { stillSignedIn } from './domain/helpers/sessionGuard';

// ── MMKV Key ────────────────────────────────────────────────────────────────
const MMKV_KEY = (userId: string) => `reelhouse_blocks_${userId}`;

// ── Store Interface ─────────────────────────────────────────────────────────

export interface BlockState {
  blocked: string[];
  muted: string[];
  _blockedIndex: Set<string>;
  _mutedIndex: Set<string>;

  // Queries (O(1) Set.has() lookups)
  isBlocked: (userId: string) => boolean;
  isMuted: (userId: string) => boolean;
  isHidden: (userId: string) => boolean;

  // Mutations
  blockUser: (targetId: string) => Promise<void>;
  unblockUser: (targetId: string) => Promise<void>;
  muteUser: (targetId: string) => Promise<void>;
  unmuteUser: (targetId: string) => Promise<void>;

  // Lifecycle / persistence
  hydrateFromCache: (userId: string) => void;
  persistToCache: (userId: string) => void;
  syncFromServer: (userId: string) => Promise<void>;
  clearOnLogout: () => void;
}

// ── Store Implementation ────────────────────────────────────────────────────

export const useBlockStore = create<BlockState>()((set, get) => ({
  blocked: [],
  muted: [],
  _blockedIndex: new Set<string>(),
  _mutedIndex: new Set<string>(),

  // ── Queries ───────────────────────────────────────────────────────────────

  isBlocked: (userId: string) => get()._blockedIndex.has(userId),

  isMuted: (userId: string) => get()._mutedIndex.has(userId),

  isHidden: (userId: string) => {
    const state = get();
    return state._blockedIndex.has(userId) || state._mutedIndex.has(userId);
  },

  // ── Mutations ─────────────────────────────────────────────────────────────

  blockUser: async (targetId: string) => {
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) return;

    // Self-block prevention
    if (targetId === currentUser.id) {
      logger.warn('[BlockStore] Self-block attempted — ignoring');
      return;
    }

    const state = get();
    if (state._blockedIndex.has(targetId)) return; // Already blocked

    // Snapshot for rollback
    const prevBlocked = state.blocked;
    const prevMuted = state.muted;
    const prevBlockedIndex = state._blockedIndex;
    const prevMutedIndex = state._mutedIndex;

    // Optimistic update — block supersedes mute
    const nextBlockedIndex = new Set(state._blockedIndex);
    nextBlockedIndex.add(targetId);
    const nextMutedIndex = new Set(state._mutedIndex);
    nextMutedIndex.delete(targetId);
    const nextBlocked = [...state.blocked, targetId];
    const nextMuted = state.muted.filter((id) => id !== targetId);

    set({
      blocked: nextBlocked,
      muted: nextMuted,
      _blockedIndex: nextBlockedIndex,
      _mutedIndex: nextMutedIndex,
    });

    // Persist to MMKV
    get().persistToCache(currentUser.id);

    // Supabase upsert
    try {
      const { error } = await supabase.from('user_blocks').upsert(
        {
          blocker_id: currentUser.id,
          blocked_id: targetId,
          type: 'block',
        },
        { onConflict: 'blocker_id,blocked_id' },
      );

      if (error) throw error;

      // Invalidate React Query caches so filtered views refresh
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['universalSearch'] });

      // Success feedback
      TactileEngine.warn();
      reelToast.info(`User blocked. Their content is now hidden.`);
    } catch (err) {
      // Rollback — only while they are still signed in. The optimistic change
      // this undoes went with the store when logout cleared it, so restoring it
      // would hand the next member the previous one's block list. The
      // persistToCache below makes that worse than the other stores: it writes
      // that list straight back to disk under the departed member's key.
      // Reporting still happens either way.
      if (stillSignedIn(currentUser.id)) {
        set({
          blocked: prevBlocked,
          muted: prevMuted,
          _blockedIndex: prevBlockedIndex,
          _mutedIndex: prevMutedIndex,
        });
        get().persistToCache(currentUser.id);
      }

      logger.error('[BlockStore] blockUser failed:', err);
      captureError(err, { action: 'blockUser', targetId });
      reelToast.error('Failed to block user. Try again.');
    }
  },

  unblockUser: async (targetId: string) => {
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) return;

    const state = get();
    if (!state._blockedIndex.has(targetId)) return; // Not blocked

    // Snapshot for rollback
    const prevBlocked = state.blocked;
    const prevBlockedIndex = state._blockedIndex;

    // Optimistic update
    const nextBlockedIndex = new Set(state._blockedIndex);
    nextBlockedIndex.delete(targetId);
    const nextBlocked = state.blocked.filter((id) => id !== targetId);

    set({
      blocked: nextBlocked,
      _blockedIndex: nextBlockedIndex,
    });

    // Persist to MMKV
    get().persistToCache(currentUser.id);

    // Supabase delete
    try {
      const { error } = await supabase
        .from('user_blocks')
        .delete()
        .eq('blocker_id', currentUser.id)
        .eq('blocked_id', targetId);

      if (error) throw error;

      // Invalidate React Query caches
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['universalSearch'] });

      TactileEngine.success();
      reelToast.info('User unblocked.');
    } catch (err) {
      // Rollback — guarded; see blockUser.
      if (stillSignedIn(currentUser.id)) {
        set({
          blocked: prevBlocked,
          _blockedIndex: prevBlockedIndex,
        });
        get().persistToCache(currentUser.id);
      }

      logger.error('[BlockStore] unblockUser failed:', err);
      captureError(err, { action: 'unblockUser', targetId });
      reelToast.error('Failed to unblock user. Try again.');
    }
  },

  muteUser: async (targetId: string) => {
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) return;

    // Self-mute prevention
    if (targetId === currentUser.id) {
      logger.warn('[BlockStore] Self-mute attempted — ignoring');
      return;
    }

    const state = get();
    if (state._mutedIndex.has(targetId)) return; // Already muted
    if (state._blockedIndex.has(targetId)) return; // Block supersedes mute — no-op

    // Snapshot for rollback
    const prevMuted = state.muted;
    const prevMutedIndex = state._mutedIndex;

    // Optimistic update
    const nextMutedIndex = new Set(state._mutedIndex);
    nextMutedIndex.add(targetId);
    const nextMuted = [...state.muted, targetId];

    set({
      muted: nextMuted,
      _mutedIndex: nextMutedIndex,
    });

    // Persist to MMKV
    get().persistToCache(currentUser.id);

    // Supabase insert
    try {
      const { error } = await supabase.from('user_blocks').upsert(
        {
          blocker_id: currentUser.id,
          blocked_id: targetId,
          type: 'mute',
        },
        { onConflict: 'blocker_id,blocked_id' },
      );

      if (error) throw error;

      // Invalidate React Query caches
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['universalSearch'] });

      TactileEngine.success();
      // Was "hidden from your feeds". Muting hides the same things a block does —
      // feeds, search, comments on logs, stacks and dossiers, notifications, salon
      // messages and member faces — because isHidden() treats mute and block alike
      // everywhere, and the server's is_hidden_by() does too. The copy now says what
      // actually happens rather than promising less.
      reelToast.info('User muted. Their content is now hidden from you.');
    } catch (err) {
      // Rollback — guarded; see blockUser.
      if (stillSignedIn(currentUser.id)) {
        set({
          muted: prevMuted,
          _mutedIndex: prevMutedIndex,
        });
        get().persistToCache(currentUser.id);
      }

      logger.error('[BlockStore] muteUser failed:', err);
      captureError(err, { action: 'muteUser', targetId });
      reelToast.error('Failed to mute user. Try again.');
    }
  },

  unmuteUser: async (targetId: string) => {
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) return;

    const state = get();
    if (!state._mutedIndex.has(targetId)) return; // Not muted

    // Snapshot for rollback
    const prevMuted = state.muted;
    const prevMutedIndex = state._mutedIndex;

    // Optimistic update
    const nextMutedIndex = new Set(state._mutedIndex);
    nextMutedIndex.delete(targetId);
    const nextMuted = state.muted.filter((id) => id !== targetId);

    set({
      muted: nextMuted,
      _mutedIndex: nextMutedIndex,
    });

    // Persist to MMKV
    get().persistToCache(currentUser.id);

    // Supabase delete
    try {
      const { error } = await supabase
        .from('user_blocks')
        .delete()
        .eq('blocker_id', currentUser.id)
        .eq('blocked_id', targetId);

      if (error) throw error;

      // Invalidate React Query caches
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['universalSearch'] });

      TactileEngine.success();
      reelToast.info('User unmuted.');
    } catch (err) {
      // Rollback — guarded; see blockUser.
      if (stillSignedIn(currentUser.id)) {
        set({
          muted: prevMuted,
          _mutedIndex: prevMutedIndex,
        });
        get().persistToCache(currentUser.id);
      }

      logger.error('[BlockStore] unmuteUser failed:', err);
      captureError(err, { action: 'unmuteUser', targetId });
      reelToast.error('Failed to unmute user. Try again.');
    }
  },

  // ── Lifecycle / Persistence ───────────────────────────────────────────────

  hydrateFromCache: (userId: string) => {
    try {
      const raw = storage.getString(MMKV_KEY(userId));
      if (!raw) return; // No cache — start empty (no error)

      const parsed: PersistedBlockData = JSON.parse(raw);

      if (!Array.isArray(parsed.blocked) || !Array.isArray(parsed.muted)) {
        // Corrupted data — clear and proceed empty
        storage.delete(MMKV_KEY(userId));
        captureError(new Error('[BlockStore] Corrupted cache — cleared'), { userId });
        return;
      }

      set({
        blocked: parsed.blocked,
        muted: parsed.muted,
        _blockedIndex: new Set(parsed.blocked),
        _mutedIndex: new Set(parsed.muted),
      });
    } catch (e) {
      // Corrupted JSON — clear key, log to Sentry, proceed empty
      storage.delete(MMKV_KEY(userId));
      captureError(e, { action: 'hydrateFromCache', userId });
      logger.warn('[BlockStore] hydrateFromCache failed — cleared corrupted cache:', e);
    }
  },

  persistToCache: (userId: string) => {
    try {
      const { blocked, muted } = get();
      const data: PersistedBlockData = {
        blocked,
        muted,
        lastSynced: Date.now(),
      };
      setSensitive(MMKV_KEY(userId), JSON.stringify(data));
    } catch (e) {
      logger.warn('[BlockStore] persistToCache failed:', e);
    }
  },

  syncFromServer: async (userId: string) => {
    // Captured before the await. This op reads the signed-in member 30-odd lines
    // BELOW its first write, so that variable cannot guard it — and `userId` is
    // who the sync is FOR, which is not necessarily the session.
    const startedAs = useAuthStore.getState().user?.id ?? null;
    try {
      const { data, error } = await supabase.rpc('get_user_blocks', {
        p_user_id: userId,
      });

      // Left mid-sync: writing would put the previous member's block list into a
      // cleared store, and persistToCache below would write it to disk.
      if (!stillSignedIn(startedAs)) return;

      if (error) throw error;

      if (!Array.isArray(data)) return;

      const blocked: string[] = [];
      const muted: string[] = [];

      for (const record of data) {
        if (record.type === 'block') {
          blocked.push(record.blocked_id);
        } else if (record.type === 'mute') {
          muted.push(record.blocked_id);
        }
      }

      set({
        blocked,
        muted,
        _blockedIndex: new Set(blocked),
        _mutedIndex: new Set(muted),
      });

      // Persist fresh data to MMKV
      get().persistToCache(userId);
    } catch (e) {
      // Silent failure on network error — retain cache
      logger.warn('[BlockStore] syncFromServer failed — retaining cache:', e);
    }
  },

  clearOnLogout: () => {
    const currentUser = useAuthStore.getState().user;
    if (currentUser) {
      try {
        storage.delete(MMKV_KEY(currentUser.id));
      } catch (e) {
        logger.warn('[BlockStore] clearOnLogout MMKV delete failed:', e);
      }
    }

    set({
      blocked: [],
      muted: [],
      _blockedIndex: new Set<string>(),
      _mutedIndex: new Set<string>(),
    });
  },
}));

// ── Register cleanup handler for centralized logout ──────────────────────────
registerStoreReset(() => {
  useBlockStore.getState().clearOnLogout();
});
