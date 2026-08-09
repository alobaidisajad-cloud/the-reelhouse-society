/**
 * followStore.ts — Dedicated Social Graph Store (P0-3 AUDIT FIX)
 * ──────────────────────────────────────────────────────────────
 * Extracted from auth store to give `following` a proper typed home.
 * Previous architecture: `following` was an untyped runtime property
 * on the User object, mutated externally by socialSlice.ts, creating
 * race conditions on concurrent follow/unfollow operations.
 *
 * Now: `following` lives in its own Zustand store with:
 *   • Proper TypeScript interface
 *   • Atomic set() operations (no external setState)
 *   • Mutex for concurrent operations
 *   • MMKV persistence scoped to user ID
 *   • Centralized cleanup via resetAllStores
 */
import { create } from 'zustand';
import { registerStoreReset } from './resetAllStores';
import { storage } from './mmkv-storage';
import { logger } from '../utils/logger';

export interface SocialState {
    following: string[];
    requested: string[];
    /** O(1) lookup index — mirrors endorsement/watchlist index pattern */
    _followingIndex: Set<string>;
    _requestedIndex: Set<string>;
    /** Incoming follow requests awaiting your approval ("At the Door"). Drives the
     *  Notices banner + the profile door badge. Source of truth is the DB; this is
     *  the cached live count, refreshed on app focus and when the panel resolves one. */
    pendingRequestCount: number;
    setPendingRequestCount: (n: number) => void;
    setFollowing: (usernames: string[]) => void;
    setRequested: (usernames: string[]) => void;
    addFollowing: (username: string) => void;
    addRequested: (username: string) => void;
    removeFollowing: (username: string) => void;
    removeRequested: (username: string) => void;
    isFollowing: (username: string) => boolean;
    isRequested: (username: string) => boolean;
    persistFollowing: (userId: string) => void;
    hydrateFromCache: (userId: string) => void;
}

export const useSocialStore = create<SocialState>()((set, get) => ({
    following: [],
    requested: [],
    _followingIndex: new Set<string>(),
    _requestedIndex: new Set<string>(),
    pendingRequestCount: 0,

    setPendingRequestCount: (n) => set({ pendingRequestCount: Math.max(0, Math.floor(n) || 0) }),

    setFollowing: (usernames) => {
        set({ following: usernames, _followingIndex: new Set(usernames.map(u => (u || '').toLowerCase())) });
    },
    
    setRequested: (usernames) => {
        set({ requested: usernames, _requestedIndex: new Set(usernames.map(u => (u || '').toLowerCase())) });
    },

    addFollowing: (username) => {
        const state = get();
        const lowered = (username || '').toLowerCase();
        if (state._followingIndex.has(lowered)) return;
        // Atomic update via set() — no external setState race
        const nextIndex = new Set(state._followingIndex);
        nextIndex.add(lowered);
        // Automatically remove from requested if added to following
        const nextRequestedIndex = new Set(state._requestedIndex);
        nextRequestedIndex.delete(lowered);
        set({ 
            following: [...state.following, username], 
            _followingIndex: nextIndex,
            requested: state.requested.filter(u => (u || '').toLowerCase() !== lowered),
            _requestedIndex: nextRequestedIndex
        });
    },

    addRequested: (username) => {
        const state = get();
        const lowered = (username || '').toLowerCase();
        if (state._requestedIndex.has(lowered)) return;
        const nextIndex = new Set(state._requestedIndex);
        nextIndex.add(lowered);
        set({ requested: [...state.requested, username], _requestedIndex: nextIndex });
    },

    removeFollowing: (username) => {
        set(state => {
            const lowered = (username || '').toLowerCase();
            const nextIndex = new Set(state._followingIndex);
            nextIndex.delete(lowered);
            return {
                following: state.following.filter(u => (u || '').toLowerCase() !== lowered),
                _followingIndex: nextIndex,
            };
        });
    },
    
    removeRequested: (username) => {
        set(state => {
            const lowered = (username || '').toLowerCase();
            const nextIndex = new Set(state._requestedIndex);
            nextIndex.delete(lowered);
            return {
                requested: state.requested.filter(u => (u || '').toLowerCase() !== lowered),
                _requestedIndex: nextIndex,
            };
        });
    },

    // O(1) Set.has() replaces O(n) Array.includes()
    isFollowing: (username) => {
        return get()._followingIndex.has((username || '').toLowerCase());
    },
    
    isRequested: (username) => {
        return get()._requestedIndex.has((username || '').toLowerCase());
    },

    persistFollowing: (userId) => {
        const { following, requested } = get();
        try {
            storage.set(`reelhouse_following_${userId}`, JSON.stringify(following));
            storage.set(`reelhouse_requested_${userId}`, JSON.stringify(requested));
        } catch (e) {
            logger.warn('[SocialStore] persistFollowing storage access failed:', e);
        }
    },

    hydrateFromCache: (userId) => {
        try {
            const cachedFollowing = storage.getString(`reelhouse_following_${userId}`);
            const cachedRequested = storage.getString(`reelhouse_requested_${userId}`);
            
            const updates: Partial<SocialState> = {};
            
            if (cachedFollowing) {
                const parsed = JSON.parse(cachedFollowing);
                if (Array.isArray(parsed)) {
                    updates.following = parsed;
                    updates._followingIndex = new Set(parsed.map((u: string) => String(u || '').toLowerCase()));
                }
            }
            
            if (cachedRequested) {
                const parsed = JSON.parse(cachedRequested);
                if (Array.isArray(parsed)) {
                    updates.requested = parsed;
                    updates._requestedIndex = new Set(parsed.map((u: string) => String(u || '').toLowerCase()));
                }
            }
            
            if (Object.keys(updates).length > 0) {
                set(updates);
            }
        } catch (e) {
            logger.warn('[SocialStore] hydrateFromCache storage access failed:', e);
        }
    },
}));

// Register cleanup handler for centralized logout
registerStoreReset((previousUserId) => {
    useSocialStore.setState({
        following: [], _followingIndex: new Set(),
        requested: [], _requestedIndex: new Set(),
        pendingRequestCount: 0
    });

    // This store writes two per-member caches to disk, and neither was ever
    // deleted — the member's social graph and their pending follow requests
    // stayed on the device after they signed out. Clearing memory alone left
    // them there indefinitely.
    //
    // Erased HERE rather than in auth.ts's hand-maintained delete list, because
    // that list is exactly what these two were missed from. The store that
    // writes a cache is the only place that reliably knows it exists.
    if (previousUserId) {
        try {
            storage.delete(`reelhouse_following_${previousUserId}`);
            storage.delete(`reelhouse_requested_${previousUserId}`);
        } catch { /* noop */ }
    }
});
