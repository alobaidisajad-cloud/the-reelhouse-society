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

/**
 * The most notifications the client holds at once — in memory AND in MMKV.
 *
 * ── #51 · WHY THIS IS ONE NUMBER NOW ────────────────────────────────────────────────
 * There used to be two. The fetch and load-more paths kept 500; the Realtime handler
 * kept 50. So a single arriving notification truncated the list to 50 and destroyed up
 * to 450 already-loaded rows — and it did it persistently, because the truncated list
 * is written straight back to MMKV by `partialize` below.
 *
 * It broke three things at once, and the third is why a smaller cap could not simply be
 * accepted as a memory decision:
 *   1. the rows themselves
 *   2. the unread badge — the eviction accounting below assumes AT MOST ONE row leaves,
 *      so evicting 450 subtracted 1 and left the badge counting notifications that no
 *      longer existed
 *   3. recovery — `_hasMore` had already been set false at the 500 cap, so load-more
 *      refuses to run and the list stays at 50 until a cold refetch
 *
 * With ONE cap the Realtime path can only ever evict a single row, which makes that
 * O(1) accounting correct by construction rather than by luck, and makes the stranded
 * pagination unreachable.
 *
 * WHY 500 AND NOT SOMETHING SMALLER: this is not a new cost. Every other state change
 * in this file already persists the whole list — measured at ~186KB for 500 rows, and
 * there are 17 such writes. Raising the Realtime cap makes that path pay what the rest
 * already pay; it can never retain more than the fetch path already does.
 *
 * Persisting a SHORTER list was considered and rejected: `_cursor` points at the oldest
 * row of the full list, so truncating what is saved would make load-more skip rows —
 * trading a data-loss bug for a pagination bug, which is the same defect class.
 */
const LOCAL_NOTIFICATION_CAP = 500;

/** Rows per page. Was declared separately inside two functions; one number now. */
const PAGE_SIZE = 30;

// Module-scoped cleanup ref — not reactive state.
// Storing a function in Zustand caused spurious subscriber notifications
// and MMKV writes on every WS connect/disconnect.
let _realtimeCleanup: (() => void) | null = null;

// Hoisted to module scope — compiled once at import time, not on every WS event.
// Mirrors HydrateRowSchema pattern in socialSlice.ts.
/**
 * The columns every notification read asks for.
 *
 * ONE list. It used to be written out twice — byte-identical, in fetch and in
 * load-more — so adding a column to one and not the other would have produced
 * notifications that group on first load and stop grouping as you scroll. Silent,
 * partial, and exactly the kind of half-working state that is hard to notice.
 *
 * `group_key` and `title` are what make grouping work at all (#73): the first is the
 * identity the server declares, the second is the label. Both must ALSO be present in
 * RealtimeNotifSchema below and on AppNotification — Zod strips unknown keys, so a
 * column selected but not declared is silently dropped and grouping quietly dies again.
 */
const NOTIFICATION_COLUMNS = 'id, user_id, type, from_username, from_user_id, message, is_read, created_at, film_id, poster_path, group_key, title';
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
  // #73 — grouping identity, declared by the trigger. Without this field here Zod
  // strips the column and grouping silently reverts to inert.
  group_key: z.string().nullish().transform(v => v ?? undefined),
  // The certified thing's name (film / stack / dossier), for the group label. Read
  // from a column instead of parsed out of the message — parsing the message is what
  // broke grouping when the copy was rewritten.
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
    /** #73 — e.g. "endorse:log:<uuid>". Declared by the server; never inferred here. */
    group_key?: string;
    /** The certified thing's name, for a group label. */
    title?: string;
    read: boolean;
    created_at: string;
}

/**
 * Merge one Realtime notification into the list, and keep the unread badge honest.
 *
 * Pulled out of the socket callback so it can be TESTED. It carries the whole of #51:
 * the cap, the de-duplication, and the eviction arithmetic that feeds the badge. Inside
 * a `.on(...)` handler none of that was reachable by a test, which is why a cap that
 * destroyed 450 rows and a comment that mis-stated the drift by a factor of 450 both
 * survived review.
 *
 * Returns the SAME state object when the notification is already present, so Zustand
 * skips the update — and, with it, an MMKV write of the entire list.
 */
/**
 * Removing rows can make room under the cap — so paging must become possible again.
 *
 *  is set false when a page fills the local cap. Nothing recomputed it when
 * rows were then DISMISSED, so a member who filled the list and cleared some of it was
 * stuck: load-more refuses while there is room and a cursor pointing at more rows.
 *
 * That is the same "cannot recover" state #51 describes, reached by a different door —
 * dismissing rather than truncating — which is why closing only the truncation half
 * would have left the symptom alive.
 *
 * When  was false because the SERVER had no more rows, re-enabling costs one
 * request that returns nothing and sets it false again. Self-correcting, and strictly
 * better than a list that can never grow again.
 */
export function reopenPagingIfRoom<T extends { notifications: AppNotification[]; _hasMore: boolean; _cursor: string | null }>(
    state: T,
    cap: number = LOCAL_NOTIFICATION_CAP,
): boolean {
    if (state._hasMore) return true;
    return state._cursor != null && state.notifications.length < cap;
}

export function applyIncomingNotification<T extends { notifications: AppNotification[]; _unreadCount: number }>(
    state: T,
    incoming: AppNotification,
    cap: number = LOCAL_NOTIFICATION_CAP,
): T {
    // Prevent duplicate injects
    if (state.notifications.some(n => n.id === incoming.id)) return state;

    const next = [incoming, ...state.notifications].slice(0, cap);

    // O(1) increment — new Realtime notifications always arrive as read=false.
    // Because `cap` is the SAME one the fetch paths use, this slice can evict at most
    // ONE row, so the single-row accounting is exact rather than approximate. Under the
    // old 50-row cap it could evict 450 while subtracting 1, and the comment that used
    // to sit here claimed the count "may drift by 1" — it could drift by 450.
    // Count what ACTUALLY fell off the end, however many rows that is, rather than
    // assuming a single one. With one shared cap it is always 0 or 1 — but an
    // assumption that happens to hold is exactly what #51 was: the old code assumed
    // one eviction while the mismatched caps evicted 450, and the badge went on
    // counting rows that no longer existed. Deriving it costs one slice of length ≤1
    // and makes the arithmetic exact for ANY input, so no future cap change can
    // reintroduce the drift.
    const evictedRows = state.notifications.length + 1 > cap
        ? state.notifications.slice(cap - 1)
        : [];
    const evictedUnread = evictedRows.reduce((n, r) => n + (r.read ? 0 : 1), 0);

    return { ...state, notifications: next, _unreadCount: state._unreadCount + 1 - evictedUnread };
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
            // The badge is asked of the SERVER, not counted from this page.
            // It used to be `validated.filter(n => !n.read).length` over a single
            // page of 30 — so a member with 50 unread saw at most 30, and nothing
            // in this file ever asked the database for the real number.
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
            // Degrade to the page-derived number rather than showing nothing —
            // but never silently.
            logger.warn('[notificationStore.fetch] unread count failed:', unreadRes.error.message);
        }

        // The member can leave while this is in the air. Writing below would
        // repopulate the store AFTER the reset cleared it — and this store
        // PERSISTS, so it would rewrite the very MMKV key the reset deletes to
        // prevent the cross-user leak documented there. The defence and the
        // defect are in the same file.
        if (!stillSignedIn(user.id)) return;

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
            //
            // Taken from the RAW row, not the salvaged one. If the last row of a
            // page fails validation, a cursor built from `validated` would not
            // advance past it — and with _hasMore now driven by the server count
            // below, that would re-fetch the same page forever.
            const lastRaw = data[data.length - 1] as { created_at?: string; id?: string } | undefined;
            const cursor = lastRaw?.created_at && lastRaw?.id ? `${lastRaw.created_at}|${lastRaw.id}` : null;
            set({
                notifications: validated,
                // Server truth when we have it; the page-derived number only as a
                // fallback, which is what it always was.
                _unreadCount: unreadRes.error ? validated.filter(n => !n.read).length : (unreadRes.count ?? 0),
                // The question _hasMore asks is "did the SERVER have a full page",
                // not "how many rows survived validation". One malformed row used
                // to end a member's history permanently.
                _hasMore: !!cursor && data.length >= PAGE_SIZE,
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
            // Full compound cursor (created_at|id) prevents duplicate/skipped
            // notifications when batch events share the same created_at timestamp.
            // Matches the keyset pagination pattern used in logSlice, watchlistSlice, FeedService.
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
            // Backward compat: bare created_at cursor from in-flight requests
            query = query.lt('created_at', cursorDate);
        }

        const { data, error } = await query;

        // Same as the initial fetch — see the note there.
        if (!stillSignedIn(user.id)) return;

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
                const allNotifs = [...state.notifications, ...deduped].slice(0, LOCAL_NOTIFICATION_CAP);
                
                // Cursor from the RAW server response, not the salvaged array and
                // not the merged one. If every row on a page failed validation,
                // a cursor built from `validated` would stay put — and paging
                // would re-issue the identical query forever without advancing.
                const lastRaw = data[data.length - 1] as { created_at?: string; id?: string } | undefined;
                const advanced = lastRaw?.created_at && lastRaw?.id
                    ? `${lastRaw.created_at}|${lastRaw.id}`
                    : null;

                return {
                    notifications: allNotifs,
                    // The badge is server truth from the initial fetch; paging in
                    // OLDER pages cannot change how many are unread overall, so it
                    // is deliberately left alone here.
                    _unreadCount: state._unreadCount,
                    // Ask what the SERVER returned, and only continue if the cursor
                    // actually moved. Both conditions are required: the first stops
                    // one bad row ending history, the second stops a stuck loop.
                    _hasMore: !!advanced && data.length >= PAGE_SIZE && allNotifs.length < LOCAL_NOTIFICATION_CAP,
                    _cursor: advanced ?? state._cursor,
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
            // Background DB sync
            const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
            if (error) throw error;
        } catch (e) {
            logger.warn(`[markRead] Failed for ${id}:`, e);
            // Rollback
            // Roll back only if they are still here. The optimistic change this
            // undoes was made before the await, so a logout has already cleared
            // it — restoring would hand the next member the previous one's
            // notifications, and persist them.
            if (stillSignedIn(startedAs)) set({ notifications: previousState, _unreadCount: previousUnread });
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
            // Rollback
            // Roll back only if they are still here. The optimistic change this
            // undoes was made before the await, so a logout has already cleared
            // it — restoring would hand the next member the previous one's
            // notifications, and persist them.
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
            // Defense-in-depth ownership filter on notification delete.
            // Matches the pattern used by markAllRead. RLS is primary guard, this prevents
            // any edge case where a notification ID from another user is passed.
            const { error } = await supabase.from('notifications').delete().eq('id', id).eq('user_id', user.id);
            if (error) throw error;
        } catch (e) {
            logger.warn(`[dismiss] Failed for ${id}:`, e);
            // Rollback
            // Roll back only if they are still here. The optimistic change this
            // undoes was made before the await, so a logout has already cleared
            // it — restoring would hand the next member the previous one's
            // notifications, and persist them.
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
            // Defense-in-depth ownership filter, matching dismissGroup. Row security is
            // the real protection; of the four batch/single mutators here, two carried
            // this filter and two did not. This path had never once executed — grouping
            // was inert — so it is being made reachable and consistent in the same change.
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .in('id', ids)
                .eq('user_id', user.id);
            if (error) throw error;
        } catch (e) {
            logger.warn(`[markGroupRead] Failed for ${ids.length} items:`, e);
            // Rollback — only while they are still signed in; see the note on
            // the single-item rollbacks above.
            if (stillSignedIn(startedAs)) set({
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
            // Defense-in-depth ownership filter on batch notification delete.
            const { error } = await supabase
                .from('notifications')
                .delete()
                .in('id', ids)
                .eq('user_id', user.id);
            if (error) throw error;
        } catch (e) {
            logger.warn(`[dismissGroup] Failed for ${ids.length} items:`, e);
            // Rollback — only while they are still signed in; see the note on
            // the single-item rollbacks above.
            if (stillSignedIn(startedAs)) set({
                notifications: previousState,
                _unreadCount: previousUnread,
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
