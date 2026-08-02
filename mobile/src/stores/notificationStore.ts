import { logger } from '@/src/utils/logger';
import { z } from 'zod';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './auth';
import { useBlockStore } from './blockStore';
import { zustandMMKVStorage } from './mmkv-storage';
import { registerStoreReset } from './resetAllStores';

const MAX_NOTIFICATIONS = 50;

// Module-scoped cleanup ref — not reactive state.
// Storing a function in Zustand caused spurious subscriber notifications
// and MMKV writes on every WS connect/disconnect.
let _realtimeCleanup: (() => void) | null = null;

// Hoisted to module scope — compiled once at import time, not on every WS event.
// Mirrors HydrateRowSchema pattern in socialSlice.ts.
const RealtimeNotifSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  type: z.string().default('system'),
  message: z.string(),
  // Supabase PostgREST returns `null` for nullable columns,
  // not `undefined`. Zod `.optional()` rejects `null`. We use `.nullish()` to
  // accept both, then `.transform(v => v ?? undefined)` to normalize to the
  // `T | undefined` type expected by AppNotification — zero downstream ripple.
  from_username: z.string().nullish().transform(v => v ?? undefined),
  // Required for block filtering: without it the client has no way to tell WHO a
  // notification is from, only what they are called. The column has always existed.
  from_user_id: z.string().nullish().transform(v => v ?? undefined),
  film_id: z.number().nullish().transform(v => v ?? undefined),
  poster_path: z.string().nullish().transform(v => v ?? undefined),
  // DB column is `is_read` — transform to `read` for JS interface compat
  is_read: z.boolean().default(false),
  created_at: z.string().default(() => new Date().toISOString()),
}).transform(({ is_read, ...rest }) => ({ ...rest, read: is_read }));

export interface AppNotification {
    id: string;
    user_id: string;
    type: string;
    message: string;
    from_username?: string;
  from_user_id?: string;
    film_id?: number;
    poster_path?: string;
    read: boolean;
    created_at: string;
}

export interface NotificationState {
    notifications: AppNotification[];
    loading: boolean;
    _fetching: boolean;
    _fetchingMore: boolean;
    fetchNotifications: () => Promise<void>;
    loadMoreNotifications: () => Promise<void>;
    markRead: (id: string) => Promise<void>;
    markAllRead: () => Promise<void>;
    dismiss: (id: string) => Promise<void>;
    markGroupRead: (ids: string[]) => Promise<void>;
    dismissGroup: (ids: string[]) => Promise<void>;
    /** Derived O(1) counter — updated on every mutation */
    _unreadCount: number;
    /** WS-9: Cursor pagination state */
    _hasMore: boolean;
    _cursor: string | null;
    unreadCount: () => number;
    setupRealtime: () => void | (() => void);
}

// ── NOTIFICATION STORE ──
export const useNotificationStore = create<NotificationState>()(
    persist(
        (set, get) => ({
    notifications: [],
    loading: false,
    _fetching: false,
    _fetchingMore: false,
    _unreadCount: 0,

    _hasMore: true,
    _cursor: null,

    fetchNotifications: async () => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        
        const state = get();
        if (state._fetching) return;

        set({ loading: true, _fetching: true });
        try {
            const PAGE_SIZE = 30;
            const { data, error } = await supabase
                .from('notifications')
                .select('id, user_id, type, from_username, from_user_id, message, is_read, created_at, film_id, poster_path')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(PAGE_SIZE);
            
        if (!error && data) {
            // Validate HTTP response against RealtimeNotifSchema.
            // The Realtime WS path already had safeParse (L234) but the initial
            // fetch was unvalidated — if a DB migration changes columns, this
            // would crash on undefined property access instead of gracefully degrading.
            // NOTIF-1: per-row salvage (drop invalid rows, keep the rest) instead of
            // all-or-nothing — a single schema-drifted row no longer discards the page.
            const validated = (data ?? []).flatMap((row) => {
                const r = RealtimeNotifSchema.safeParse(row);
                if (!r.success) {
                    logger.warn('[notificationStore.fetch] Dropped malformed notification row:', r.error.message);
                    return [];
                }
                return [r.data];
            });
            // Compound cursor (created_at|id) prevents duplicate/skipped
            // notifications when two share the same created_at timestamp.
            const lastItem = validated[validated.length - 1];
            const cursor = lastItem ? `${lastItem.created_at}|${lastItem.id}` : null;
            set({
                notifications: validated,
                _unreadCount: validated.filter(n => !n.read).length,
                _hasMore: validated.length >= PAGE_SIZE,
                _cursor: cursor,
            });
        } else if (error) {
            // Sentry breadcrumb on fetch failure.
            // No toast — user sees MMKV-cached data. Matches logSlice pattern.
            logger.warn('[notificationStore.fetch] Supabase error:', error.message);
        }
        } finally {
            set({ loading: false, _fetching: false });
        }
    },

    loadMoreNotifications: async () => {
        const { loading, _hasMore, _cursor, _fetchingMore } = get();
        if (loading || _fetchingMore || !_hasMore || !_cursor) return;
        const user = useAuthStore.getState().user;
        if (!user) return;

        set({ loading: true, _fetchingMore: true });
        try {
            const PAGE_SIZE = 30;
            // Full compound cursor (created_at|id) prevents duplicate/skipped
            // notifications when batch events share the same created_at timestamp.
            // Matches the keyset pagination pattern used in logSlice, watchlistSlice, FeedService.
            const [cursorDate, cursorId] = _cursor.split('|');
            let query = supabase
                .from('notifications')
                .select('id, user_id, type, from_username, from_user_id, message, is_read, created_at, film_id, poster_path')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .order('id', { ascending: false })
                .limit(PAGE_SIZE);

        if (cursorDate && cursorId) {
            query = query.or(`created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},id.lt.${cursorId})`);
        } else if (cursorDate) {
            // Backward compat: bare created_at cursor from in-flight requests
            query = query.lt('created_at', cursorDate);
        }

        const { data, error } = await query;

        if (!error && data) {
            // NOTIF-1: per-row salvage, same as initial fetch.
            const validated = (data ?? []).flatMap((row) => {
                const r = RealtimeNotifSchema.safeParse(row);
                if (!r.success) {
                    logger.warn('[notificationStore.loadMore] Dropped malformed notification row:', r.error.message);
                    return [];
                }
                return [r.data];
            });
            // Compound cursor for load-more
            set(state => {
                // Dedup: match Realtime handler pattern (prevents duplicates from clock skew)
                const existingIds = new Set(state.notifications.map(n => n.id));
                const deduped = validated.filter(n => !existingIds.has(n.id));
                const allNotifs = [...state.notifications, ...deduped].slice(0, 500);
                
                // Cursor from the SERVER's response (last fetched item),
                // not the merged array. Prevents skipped pages when .slice(0,500)
                // truncates newer items or existing state contains older items.
                const lastFetched = validated[validated.length - 1];
                const newCursor = lastFetched ? `${lastFetched.created_at}|${lastFetched.id}` : state._cursor;
                
                // Calculate unread count only for the deduped items
                const unreadInNewBatch = deduped.filter(n => !n.read).length;

                return {
                    notifications: allNotifs,
                    _unreadCount: state._unreadCount + unreadInNewBatch,
                    // Stop paginating if we've hit the 500 item local memory cap
                    _hasMore: validated.length >= PAGE_SIZE && allNotifs.length < 500,
                    _cursor: newCursor,
                };
            });
        } else if (error) {
            // Sentry breadcrumb on loadMore failure.
            logger.warn('[notificationStore.loadMore] Supabase error:', error.message);
        }
        } finally {
            set({ loading: false, _fetchingMore: false });
        }
    },

    markRead: async (id: string) => {
        const previousState = get().notifications;
        const wasUnread = previousState.some(n => n.id === id && !n.read);

        // Optimistic update
        set((state) => ({
            notifications: state.notifications.map((n) =>
                n.id === id ? { ...n, read: true } : n
            ),
            _unreadCount: wasUnread ? state._unreadCount - 1 : state._unreadCount,
        }));
        
        try {
            // Background DB sync
            const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
            if (error) throw error;
        } catch (e) {
            logger.warn(`[markRead] Failed for ${id}:`, e);
            // Rollback
            set({ notifications: previousState, _unreadCount: previousState.filter(n => !n.read).length });
        }
    },

    markAllRead: async () => {
        const user = useAuthStore.getState().user;
        if (!user) return;

        const previousState = get().notifications;

        // Optimistic Update
        set((state) => ({
            notifications: state.notifications.map((n) => ({ ...n, read: true })),
            _unreadCount: 0,
        }));

        try {
            const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
            if (error) throw error;
        } catch (e) {
            logger.warn(`[markAllRead] Failed:`, e);
            // Rollback
            set({ notifications: previousState, _unreadCount: previousState.filter(n => !n.read).length });
        }
    },

    dismiss: async (id: string) => {
        const previousState = get().notifications;
        const wasDismissedUnread = previousState.some(n => n.id === id && !n.read);

        // Optimistic Update
        set((state) => ({
            notifications: state.notifications.filter((n) => n.id !== id),
            _unreadCount: wasDismissedUnread ? state._unreadCount - 1 : state._unreadCount,
        }));

        try {
            const user = useAuthStore.getState().user;
            if (!user) throw new Error('Authentication required');
            // Defense-in-depth ownership filter on notification delete.
            // Matches the pattern used by markAllRead. RLS is primary guard, this prevents
            // any edge case where a notification ID from another user is passed.
            const { error } = await supabase.from('notifications').delete().eq('id', id).eq('user_id', user.id);
            if (error) throw error;
        } catch (e) {
            logger.warn(`[dismiss] Failed for ${id}:`, e);
            // Rollback
            set({ notifications: previousState, _unreadCount: previousState.filter(n => !n.read).length });
        }
    },

    markGroupRead: async (ids: string[]) => {
        if (ids.length === 0) return;

        const previousState = get().notifications;
        const unreadInGroup = previousState.filter(
            n => ids.includes(n.id) && !n.read
        ).length;

        // Optimistic update
        set(state => ({
            notifications: state.notifications.map(n =>
                ids.includes(n.id) ? { ...n, read: true } : n
            ),
            _unreadCount: state._unreadCount - unreadInGroup,
        }));

        try {
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .in('id', ids);
            if (error) throw error;
        } catch (e) {
            logger.warn(`[markGroupRead] Failed for ${ids.length} items:`, e);
            // Rollback
            set({
                notifications: previousState,
                _unreadCount: previousState.filter(n => !n.read).length,
            });
        }
    },

    dismissGroup: async (ids: string[]) => {
        if (ids.length === 0) return;

        const previousState = get().notifications;
        const unreadDismissed = previousState.filter(
            n => ids.includes(n.id) && !n.read
        ).length;

        // Optimistic update
        set(state => ({
            notifications: state.notifications.filter(n => !ids.includes(n.id)),
            _unreadCount: state._unreadCount - unreadDismissed,
        }));

        try {
            const user = useAuthStore.getState().user;
            if (!user) throw new Error('Authentication required');
            // Defense-in-depth ownership filter on batch notification delete.
            const { error } = await supabase
                .from('notifications')
                .delete()
                .in('id', ids)
                .eq('user_id', user.id);
            if (error) throw error;
        } catch (e) {
            logger.warn(`[dismissGroup] Failed for ${ids.length} items:`, e);
            // Rollback
            set({
                notifications: previousState,
                _unreadCount: previousState.filter(n => !n.read).length,
            });
        }
    },

    unreadCount: () => get()._unreadCount,

    setupRealtime: () => {
        const user = useAuthStore.getState().user;
        if (!user) return;

        // Strict Singleton Lock to prevent React StrictMode double-subscriptions
        if (_realtimeCleanup) return _realtimeCleanup;

        // No dedup needed, _realtimeCleanup handles singleton logic above

        const channel = supabase
            .channel('global_notifications')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
                (payload) => {
                    // Zod safeParse replaces manual type assertion — structurally invalid
                    // Realtime payloads are logged to Sentry and discarded instead of injected into the UI.
                    const parsed = RealtimeNotifSchema.safeParse(payload.new);
                    if (!parsed.success) {
                      logger.warn('[NotificationStore.realtime] Malformed payload discarded:', parsed.error.message);
                      return;
                    }
                    const newNotif: AppNotification = parsed.data;

                    // Blocked and muted actors are dropped here and ONLY here.
                    //
                    // fetchNotifications and loadMoreNotifications are already filtered
                    // by the notifications_hide_blocked RLS policy, and both compute
                    // their pagination cursor from the rows they keep — so filtering
                    // them client-side would risk skipping pages, the exact defect that
                    // made the dossier's LOAD EARLIER button unreachable. The socket is
                    // the one path where row-level security may not apply, so it is the
                    // one path that needs this.
                    //
                    // from_user_id is undefined for system notices, which must arrive.
                    if (newNotif.from_user_id && useBlockStore.getState().isHidden(newNotif.from_user_id)) {
                        return;
                    }

                    set((state) => {
                        // Prevent duplicate injects
                        if (state.notifications.some(n => n.id === newNotif.id)) return state;
                        const next = [newNotif, ...state.notifications].slice(0, MAX_NOTIFICATIONS);
                        // O(1) increment — new Realtime notifications always arrive as read=false.
                        // If the slice evicts an unread notification (rare), the count may drift by 1;
                        // fetchNotifications() will reconcile on next cold load.
                        const evicted = state.notifications.length >= MAX_NOTIFICATIONS
                            ? state.notifications[state.notifications.length - 1]
                            : null;
                        const evictedUnread = evicted && !evicted.read ? 1 : 0;
                        return { notifications: next, _unreadCount: state._unreadCount + 1 - evictedUnread };
                    });
                }
            )
            .subscribe();

        const cleanup = () => {
            supabase.removeChannel(channel);
            _realtimeCleanup = null;
        };

        // Module-scoped cleanup so resetAllStores can call it
        _realtimeCleanup = cleanup;

        return cleanup;
    }
        }),
        {
            name: 'reelhouse-notifications',
            storage: createJSONStorage(() => zustandMMKVStorage),
            // Only persist data fields, not functions or internal state
            // Persist pagination state to avoid redundant cold-start refetch
            partialize: (state) => ({
                notifications: state.notifications,
                _unreadCount: state._unreadCount,
                _hasMore: state._hasMore,
                _cursor: state._cursor,
            }),
            // Deferred hydration until the encryption key is resolved (LIB-5).
            skipHydration: true,
        }
    )
);

export const rehydrateNotificationStore = () => useNotificationStore.persist.rehydrate();

// Register cleanup handler for centralized logout
// Also tear down realtime channel on logout
registerStoreReset(() => {
    if (_realtimeCleanup) { _realtimeCleanup(); _realtimeCleanup = null; }
    useNotificationStore.setState({ notifications: [], _unreadCount: 0, _hasMore: true, _cursor: null });
    // Purge persisted MMKV key to prevent cross-user notification leak.
    // Without this, Zustand's persist middleware rehydrates stale notifications from the
    // previous user's MMKV data before fetchNotifications() overwrites them.
    try { zustandMMKVStorage.removeItem('reelhouse-notifications'); } catch { /* noop */ }
});

/** FLAW-08: Public teardown for auth.ts early WS cleanup during logout. */
export function teardownNotificationRealtime() {
    if (_realtimeCleanup) { _realtimeCleanup(); _realtimeCleanup = null; }
}
