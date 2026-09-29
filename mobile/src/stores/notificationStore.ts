import { logger } from '@/src/utils/logger';
import { z } from 'zod';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './auth';
import { useBlockStore } from './blockStore';
import { zustandMMKVStorage, zustandMMKVStorageSensitive } from './mmkv-storage';
import { registerStoreReset } from './resetAllStores';
import { stillSignedIn } from './domain/helpers/sessionGuard';

/** The most held at once, in memory and MMKV, by EVERY path (~186KB at 500). */
const LOCAL_NOTIFICATION_CAP = 500;

/** Rows per page, for the first fetch and load-more alike. */
const PAGE_SIZE = 30;

// Not in state: a function there would rewrite MMKV on every socket connect.
let _realtimeCleanup: (() => void) | null = null;

/** Every read's columns; each ALSO in the schema below, or Zod drops it silently. */
const NOTIFICATION_COLUMNS = 'id, user_id, type, from_username, from_user_id, message, is_read, created_at, film_id, poster_path, group_key, title';
const RealtimeNotifSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  type: z.string().default('system'),
  message: z.string(),
  // PostgREST sends null; `.nullish()` then `?? undefined` gives AppNotification's shape.
  from_username: z.string().nullish().transform(v => v ?? undefined),
  // WHO it is from, for block filtering (a name is not an identity).
  from_user_id: z.string().nullish().transform(v => v ?? undefined),
  film_id: z.number().nullish().transform(v => v ?? undefined),
  poster_path: z.string().nullish().transform(v => v ?? undefined),
  // The grouping identity, declared by the trigger (see NOTIFICATION_COLUMNS).
  group_key: z.string().nullish().transform(v => v ?? undefined),
  // The certified thing's name, for a group label: a column, never parsed from copy.
  title: z.string().nullish().transform(v => v ?? undefined),
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
    /** e.g. "endorse:log:<uuid>": declared by the server, never inferred here. */
    group_key?: string;
    /** The certified thing's name, for a group label. */
    title?: string;
    read: boolean;
    created_at: string;
}

/**
 * Removing rows can make room under the cap, so paging reopens (a full list
 * turns it off). If the SERVER had no more, the one wasted request finds none
 * and turns it off again: self-correcting, never stuck.
 */
export function reopenPagingIfRoom<T extends { notifications: AppNotification[]; _hasMore: boolean; _cursor: string | null }>(
    state: T,
    cap: number = LOCAL_NOTIFICATION_CAP,
): boolean {
    if (state._hasMore) return true;
    return state._cursor != null && state.notifications.length < cap;
}

/**
 * One arriving notification into the list, the badge kept exact; out of the
 * socket callback so it is tested. Already present: the SAME state, so Zustand
 * skips the update and its MMKV write.
 */
export function applyIncomingNotification<T extends { notifications: AppNotification[]; _unreadCount: number }>(
    state: T,
    incoming: AppNotification,
    cap: number = LOCAL_NOTIFICATION_CAP,
): T {
    // Prevent duplicate injects
    if (state.notifications.some(n => n.id === incoming.id)) return state;

    const next = [incoming, ...state.notifications].slice(0, cap);

    // An arrival is unread (+1). Count the unread rows that ACTUALLY fell off the
    // end (0 or 1 under one cap), not an assumed one, so no cap change can drift it.
    const evictedRows = state.notifications.length + 1 > cap
        ? state.notifications.slice(cap - 1)
        : [];
    const evictedUnread = evictedRows.reduce((n, r) => n + (r.read ? 0 : 1), 0);

    return { ...state, notifications: next, _unreadCount: state._unreadCount + 1 - evictedUnread };
}

export interface NotificationState {
    notifications: AppNotification[];
    loading: boolean;
    /** The last read of the board could not be answered (never persisted). */
    fetchFailed: boolean;
    _fetching: boolean;
    _fetchingMore: boolean;
    fetchNotifications: () => Promise<void>;
    loadMoreNotifications: () => Promise<void>;
    markRead: (id: string) => Promise<void>;
    /** One notice by id — from the list if it is loaded, else from the server. */
    getNotice: (id: string) => Promise<AppNotification | null>;
    markAllRead: () => Promise<void>;
    dismiss: (id: string) => Promise<void>;
    markGroupRead: (ids: string[]) => Promise<void>;
    dismissGroup: (ids: string[]) => Promise<void>;
    /** Derived O(1) counter — updated on every mutation */
    _unreadCount: number;
    /** Keyset paging: whether there is more, and the last row's `created_at|id`. */
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
    fetchFailed: false,
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
            // The badge is asked of the SERVER, never counted from one page of 30.
            const [{ data, error }, unreadRes] = await Promise.all([
                supabase
                    .from('notifications')
                    .select(NOTIFICATION_COLUMNS)
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .limit(PAGE_SIZE),
                supabase
                    .from('notifications')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .eq('is_read', false),
            ]);

        if (unreadRes.error) {
            // The page's own count stands in, said aloud.
            logger.warn('[notificationStore.fetch] unread count failed:', unreadRes.error.message);
        }

        // Signed out meanwhile: writing would refill, and re-persist, what the reset cleared.
        if (!stillSignedIn(user.id)) return;

        if (!error && data) {
            // Each row validated alone: a malformed one is dropped, the page kept.
            const validated = (data ?? []).flatMap((row) => {
                const r = RealtimeNotifSchema.safeParse(row);
                if (!r.success) {
                    logger.warn('[notificationStore.fetch] Dropped malformed notification row:', r.error.message);
                    return [];
                }
                return [r.data];
            });
            // `created_at|id`, so two rows at one instant are neither repeated nor
            // skipped; from the RAW last row, or a bad last row would never be passed.
            const lastRaw = data[data.length - 1] as { created_at?: string; id?: string } | undefined;
            const cursor = lastRaw?.created_at && lastRaw?.id ? `${lastRaw.created_at}|${lastRaw.id}` : null;
            set({
                fetchFailed: false,
                notifications: validated,
                // The server's count; the page's only as a fallback.
                _unreadCount: unreadRes.error ? validated.filter(n => !n.read).length : (unreadRes.count ?? 0),
                // Did the SERVER send a full page (not: how many rows survived)?
                _hasMore: !!cursor && data.length >= PAGE_SIZE,
                _cursor: cursor,
            });
        } else if (error) {
            // To Sentry. The screen says so: a board it could not read is not a clear one.
            logger.warn('[notificationStore.fetch] Supabase error:', error.message);
            set({ fetchFailed: true });
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
            const [cursorDate, cursorId] = _cursor.split('|');
            let query = supabase
                .from('notifications')
                .select(NOTIFICATION_COLUMNS)
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .order('id', { ascending: false })
                .limit(PAGE_SIZE);

        if (cursorDate && cursorId) {
            query = query.or(`created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},id.lt.${cursorId})`);
        } else if (cursorDate) {
            // A bare created_at cursor, as an older saved state may hold.
            query = query.lt('created_at', cursorDate);
        }

        const { data, error } = await query;

        // Same as the initial fetch — see the note there.
        if (!stillSignedIn(user.id)) return;

        if (!error && data) {
            const validated = (data ?? []).flatMap((row) => {
                const r = RealtimeNotifSchema.safeParse(row);
                if (!r.success) {
                    logger.warn('[notificationStore.loadMore] Dropped malformed notification row:', r.error.message);
                    return [];
                }
                return [r.data];
            });
            set(state => {
                // De-duplicated by id, as an arrival over the socket may already be here.
                const existingIds = new Set(state.notifications.map(n => n.id));
                const deduped = validated.filter(n => !existingIds.has(n.id));
                const allNotifs = [...state.notifications, ...deduped].slice(0, LOCAL_NOTIFICATION_CAP);
                
                // From the RAW response, as in the first fetch.
                const lastRaw = data[data.length - 1] as { created_at?: string; id?: string } | undefined;
                const advanced = lastRaw?.created_at && lastRaw?.id
                    ? `${lastRaw.created_at}|${lastRaw.id}`
                    : null;

                return {
                    notifications: allNotifs,
                    _unreadCount: state._unreadCount, // older pages change no total
                    // A full SERVER page, and a cursor that moved (no bad row ends
                    // history; no loop repeats a page).
                    _hasMore: !!advanced && data.length >= PAGE_SIZE && allNotifs.length < LOCAL_NOTIFICATION_CAP,
                    _cursor: advanced ?? state._cursor,
                };
            });
        } else if (error) {
            logger.warn('[notificationStore.loadMore] Supabase error:', error.message);
        }
        } finally {
            set({ loading: false, _fetchingMore: false });
        }
    },

    markRead: async (id: string) => {
        const startedAs = useAuthStore.getState().user?.id ?? null;
        const previousState = get().notifications;
        const previousUnread = get()._unreadCount;
        const wasUnread = previousState.some(n => n.id === id && !n.read);

        // Optimistic update
        set((state) => ({
            notifications: state.notifications.map((n) =>
                n.id === id ? { ...n, read: true } : n
            ),
            _unreadCount: wasUnread ? state._unreadCount - 1 : state._unreadCount,
        }));
        
        try {
            // The user_id filter is depth, not the guard: RLS already refuses
            // another member's notice (checked against production).
            const user = useAuthStore.getState().user;
            if (!user) throw new Error('Authentication required');
            const { error } = await supabase.from('notifications')
                .update({ is_read: true })
                .eq('id', id)
                .eq('user_id', user.id);
            if (error) throw error;
        } catch (e) {
            logger.warn(`[markRead] Failed for ${id}:`, e);
            // Only while still signed in: after a logout it would restore the last member's.
            if (stillSignedIn(startedAs)) set({ notifications: previousState, _unreadCount: previousUnread });
        }
    },

    // A tapped push carries only an id: from the list, or read alone (this
    // member's, validated), never added to the list, which must stay in order.
    getNotice: async (id: string) => {
        const loaded = get().notifications.find(n => n.id === id);
        if (loaded) return loaded;
        const user = useAuthStore.getState().user;
        if (!user) return null;
        try {
            const { data, error } = await supabase
                .from('notifications')
                .select(NOTIFICATION_COLUMNS)
                .eq('id', id)
                .eq('user_id', user.id)
                .maybeSingle();
            if (error || !data) return null;
            const parsed = RealtimeNotifSchema.safeParse(data);
            return parsed.success ? parsed.data : null;
        } catch (e) {
            logger.warn('[notificationStore.getNotice] failed:', e);
            return null;
        }
    },

    markAllRead: async () => {
        const startedAs = useAuthStore.getState().user?.id ?? null;
        const user = useAuthStore.getState().user;
        if (!user) return;

        const previousState = get().notifications;
        const previousUnread = get()._unreadCount;

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
            // Rolled back only while still signed in, as in markRead.
            if (stillSignedIn(startedAs)) set({ notifications: previousState, _unreadCount: previousUnread });
        }
    },

    dismiss: async (id: string) => {
        const startedAs = useAuthStore.getState().user?.id ?? null;
        const previousState = get().notifications;
        const previousUnread = get()._unreadCount;
        const wasDismissedUnread = previousState.some(n => n.id === id && !n.read);

        // Optimistic Update
        set((state) => {
            const notifications = state.notifications.filter((n) => n.id !== id);
            return {
                notifications,
                _unreadCount: wasDismissedUnread ? state._unreadCount - 1 : state._unreadCount,
                _hasMore: reopenPagingIfRoom({ ...state, notifications }),
            };
        });

        try {
            const user = useAuthStore.getState().user;
            if (!user) throw new Error('Authentication required');
            // user_id: depth beside RLS, as in markRead.
            const { error } = await supabase.from('notifications').delete().eq('id', id).eq('user_id', user.id);
            if (error) throw error;
        } catch (e) {
            logger.warn(`[dismiss] Failed for ${id}:`, e);
            // Rolled back only while still signed in, as in markRead.
            if (stillSignedIn(startedAs)) set({ notifications: previousState, _unreadCount: previousUnread });
        }
    },

    markGroupRead: async (ids: string[]) => {
        const startedAs = useAuthStore.getState().user?.id ?? null;
        if (ids.length === 0) return;

        const previousState = get().notifications;
        const previousUnread = get()._unreadCount;
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
            const user = useAuthStore.getState().user;
            if (!user) throw new Error('Authentication required');
            // user_id: depth beside RLS, as in markRead.
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .in('id', ids)
                .eq('user_id', user.id);
            if (error) throw error;
        } catch (e) {
            logger.warn(`[markGroupRead] Failed for ${ids.length} items:`, e);
            if (stillSignedIn(startedAs)) set({ // see markRead
                notifications: previousState,
                _unreadCount: previousUnread,
            });
        }
    },

    dismissGroup: async (ids: string[]) => {
        const startedAs = useAuthStore.getState().user?.id ?? null;
        if (ids.length === 0) return;

        const previousState = get().notifications;
        const previousUnread = get()._unreadCount;
        const unreadDismissed = previousState.filter(
            n => ids.includes(n.id) && !n.read
        ).length;

        // Optimistic update
        set(state => {
            const notifications = state.notifications.filter(n => !ids.includes(n.id));
            return {
                notifications,
                _unreadCount: state._unreadCount - unreadDismissed,
                _hasMore: reopenPagingIfRoom({ ...state, notifications }),
            };
        });

        try {
            const user = useAuthStore.getState().user;
            if (!user) throw new Error('Authentication required');
            // user_id: depth beside RLS, as in markRead.
            const { error } = await supabase
                .from('notifications')
                .delete()
                .in('id', ids)
                .eq('user_id', user.id);
            if (error) throw error;
        } catch (e) {
            logger.warn(`[dismissGroup] Failed for ${ids.length} items:`, e);
            if (stillSignedIn(startedAs)) set({ // see markRead
                notifications: previousState,
                _unreadCount: previousUnread,
            });
        }
    },

    unreadCount: () => get()._unreadCount,

    setupRealtime: () => {
        const user = useAuthStore.getState().user;
        if (!user) return;

        // One subscription, however often this is called (StrictMode calls twice).
        if (_realtimeCleanup) return _realtimeCleanup;

        const channel = supabase
            .channel('global_notifications')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
                (payload) => {
                    // A malformed payload is reported and dropped, never shown.
                    const parsed = RealtimeNotifSchema.safeParse(payload.new);
                    if (!parsed.success) {
                      logger.warn('[NotificationStore.realtime] Malformed payload discarded:', parsed.error.message);
                      return;
                    }
                    const newNotif: AppNotification = parsed.data;

                    // Blocked and muted actors are dropped HERE only: the fetches are
                    // filtered by RLS (notifications_hide_blocked), and filtering them
                    // again would skew their cursors. System notices have no from_user_id.
                    if (newNotif.from_user_id && useBlockStore.getState().isHidden(newNotif.from_user_id)) {
                        return;
                    }

                    set((state) => applyIncomingNotification(state, newNotif));
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
            storage: createJSONStorage(() => zustandMMKVStorageSensitive),
            // The data and its paging, so a cold start need not refetch.
            partialize: (state) => ({
                notifications: state.notifications,
                _unreadCount: state._unreadCount,
                _hasMore: state._hasMore,
                _cursor: state._cursor,
            }),
            skipHydration: true, // hydrated once the encryption key is known
        }
    )
);

export const rehydrateNotificationStore = () => useNotificationStore.persist.rehydrate();

// On logout: the socket closed, the list emptied, and its saved copy deleted,
// so the next member never rehydrates the previous one's notifications.
registerStoreReset(() => {
    if (_realtimeCleanup) { _realtimeCleanup(); _realtimeCleanup = null; }
    useNotificationStore.setState({ notifications: [], _unreadCount: 0, _hasMore: true, _cursor: null });
    try { zustandMMKVStorage.removeItem('reelhouse-notifications'); } catch { /* noop */ }
});

/** Closes the socket early, for auth.ts during logout. */
export function teardownNotificationRealtime() {
    if (_realtimeCleanup) { _realtimeCleanup(); _realtimeCleanup = null; }
}
