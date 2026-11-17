import { houseIso } from '@/src/lib/houseClock';
import { monotonicNow } from '@/src/lib/waits';
import { logger } from '@/src/utils/logger';
import { carriedForward, SAVED_VERSION } from './savedVersion';
import { z } from 'zod';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import { watchChannel } from '../lib/watchChannel';
import { openChannel } from '../lib/openChannel';
import { useAuthStore } from './auth';
import { useBlockStore } from './blockStore';
import { zustandMMKVStorage, zustandMMKVStorageSensitive } from './mmkv-storage';
import { registerStoreReset } from './resetAllStores';
import { stillSignedIn } from './domain/helpers/sessionGuard';
import reelToast from '../utils/reelToast';
import { hydrateFollowing } from './domain/socialSlice';

/** The most held at once, in memory and MMKV, by EVERY path (~186KB at 500). */
const LOCAL_NOTIFICATION_CAP = 500;

/** Rows per page, for the first fetch and load-more alike. */
const PAGE_SIZE = 30;

// Not in state: a function there would rewrite MMKV on every socket connect.
let _realtimeCleanup: (() => void) | null = null;

/** Every read's columns; each ALSO in the schema below, or Zod drops it silently. */
const NOTIFICATION_COLUMNS = 'id, user_id, type, from_username, from_user_id, message, is_read, created_at, film_id, poster_path, group_key, title, related_lounge_id';
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
  // The salon a Lounge notice is about (an admission, a request to enter): the notice opens it.
  related_lounge_id: z.string().nullish().transform(v => v ?? undefined),
  // DB column is `is_read` — transform to `read` for JS interface compat
  is_read: z.boolean().default(false),
  created_at: z.string().default(() => houseIso()),
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
    /** The salon a Lounge notice is about. */
    related_lounge_id?: string;
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
    /** The last ask for an older page could not be answered (never persisted). */
    moreFailed: boolean;
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
    /**
     * A follow request answered at the door: the house takes its notice (a_request_takes_its_notice),
     * so the board does too, unread count and all. `null`: every request (declined all at once).
     */
    forgetRequestNotices: (fromUserId: string | null) => void;
    /** Members now hidden (blocked or muted): their notices leave the board and the bell. */
    forgetNoticesFrom: (hidden: ReadonlySet<string>) => void;
    /** Derived O(1) counter — updated on every mutation */
    _unreadCount: number;
    /** Keyset paging: whether there is more, and the last row's `created_at|id`. */
    _hasMore: boolean;
    _cursor: string | null;
    unreadCount: () => number;
    /** How many notices arrived live this session: a room waiting on its door listens for it (never persisted). */
    noticesHeard: number;
    /** The notices' live channel is answering; false once it has been down past a beat (watchChannel). Never persisted. */
    noticesLive: boolean;
    setupRealtime: () => void | (() => void);
}

/**
 * Every value the store holds, as it starts: what it is made with and what a sign-out puts back,
 * one list. The reset's own list named six of eleven, and a read a sign-out cut short left
 * `_fetching` raised: the next member's notices never read again (everyStoreStartsAgain.guard).
 */
export const noticesAtStart = () => ({
    notifications: [] as NotificationState['notifications'],
    loading: false,
    fetchFailed: false,
    moreFailed: false,
    _fetching: false,
    _fetchingMore: false,
    _unreadCount: 0,
    noticesHeard: 0,
    noticesLive: true,
    _hasMore: true,
    _cursor: null as string | null,
});

// ── NOTIFICATION STORE ──
/**
 * A failed write undoes its own notices, and nothing else. Each rollback once wrote back the whole
 * list as it stood before its own change: two notices dismissed offline, both refused, and the
 * second rollback took the first one off the board again, its unread uncounted (review round 5).
 */
type Board = { notifications: AppNotification[]; _unreadCount: number };

/** These notices read again (only those that were unread before the write), counted back. */
function unreadAgain(state: Board, ids: ReadonlySet<string>): Board {
    let back = 0;
    const notifications = state.notifications.map((n) => {
        if (!ids.has(n.id) || !n.read) return n;
        back += 1;
        return { ...n, read: false };
    });
    return { notifications, _unreadCount: state._unreadCount + back };
}

/** These notices put back where they stood (newest first, as the board reads), counted back. */
function putBack(state: Board, removed: readonly AppNotification[]): Board {
    const held = new Set(state.notifications.map((n) => n.id));
    const missing = removed.filter((n) => !held.has(n.id));
    if (missing.length === 0) return state;
    const newerFirst = (a: AppNotification, b: AppNotification) =>
        a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : (a.created_at < b.created_at ? 1 : -1);
    return {
        notifications: [...state.notifications, ...missing].sort(newerFirst),
        _unreadCount: state._unreadCount + missing.filter((n) => !n.read).length,
    };
}

/**
 * Notices this phone marked read, by when the house took the mark (Infinity while it is on its
 * way). A read asked before a mark landed answers with the notice unread: a push tapped as the app
 * opened was read by its tap, and the board's read, asked first and landing after, wrote it back
 * unread, counted in the bell (review round 7). Such a read is answered with the mark laid over it;
 * a mark the house took before a read was asked is in its answer, and is forgotten then.
 */
const readHere = new Map<string, number>();
const markingRead = (ids: readonly string[]) => { for (const id of ids) readHere.set(id, Infinity); };
const markTaken = (ids: readonly string[]) => { const at = monotonicNow(); for (const id of ids) readHere.set(id, at); };
const markRefused = (ids: readonly string[]) => { for (const id of ids) readHere.delete(id); };
/**
 * READ ALL and the notices dismissed here, kept the same way: a read asked before READ ALL landed
 * wrote every notice back unread, the bell's count with them and READ ALL lit again, and one asked
 * before a dismissal put the notice back on the board (review round 8).
 */
let allReadAt: number | null = null;
const goneHere = new Map<string, number>();

export const useNotificationStore = create<NotificationState>()(
    persist(
        (set, get) => ({
    ...noticesAtStart(),

    fetchNotifications: async () => {
        const user = useAuthStore.getState().user;
        if (!user) return;

        const state = get();
        if (state._fetching) return;

        set({ loading: true, _fetching: true });
        const askedAt = monotonicNow();
        try {
            // The badge is asked of the SERVER, never counted from one page of 30.
            const [{ data, error }, unreadRes] = await Promise.all([
                supabase
                    .from('notifications')
                    .select(NOTIFICATION_COLUMNS)
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .order('id', { ascending: false })
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
            // Marks this read was asked before the house took: laid over its answer (readHere).
            const markedSince = new Set([...readHere].filter(([, at]) => at >= askedAt).map(([id]) => id));
            for (const [id, at] of readHere) if (at < askedAt) readHere.delete(id);
            // READ ALL since it was asked: every notice in its answer is read. Dismissed since: gone.
            const allReadSince = allReadAt !== null && allReadAt >= askedAt;
            if (allReadAt !== null && allReadAt < askedAt) allReadAt = null;
            const goneSince = new Set([...goneHere].filter(([, at]) => at >= askedAt).map(([id]) => id));
            for (const [id, at] of goneHere) if (at < askedAt) goneHere.delete(id);
            const readSince = (n: AppNotification) => allReadSince || markedSince.has(n.id);
            const answeredUnread = validated.filter((n) => (readSince(n) || goneSince.has(n.id)) && !n.read).length;
            const kept = goneSince.size ? validated.filter((n) => !goneSince.has(n.id)) : validated;
            const shown = answeredUnread ? kept.map((n) => (readSince(n) ? { ...n, read: true } : n)) : kept;
            set({
                fetchFailed: false,
                moreFailed: false,
                notifications: shown,
                // The server's count; the page's only as a fallback.
                _unreadCount: unreadRes.error || allReadSince ? shown.filter(n => !n.read).length : Math.max(0, (unreadRes.count ?? 0) - answeredUnread),
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
            // Lowered for this read alone: an older page still on its way keeps the list reading.
            // Signed out meanwhile, the reset has lowered them already.
            if (stillSignedIn(user.id)) set((state) => ({ loading: state._fetchingMore, _fetching: false }));
        }
    },

    loadMoreNotifications: async () => {
        const { loading, _hasMore, _cursor, _fetchingMore } = get();
        if (loading || _fetchingMore || !_hasMore || !_cursor) return;
        const user = useAuthStore.getState().user;
        if (!user) return;

        set({ loading: true, _fetchingMore: true });
        const askedAt = monotonicNow();
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
                // Asked after a list a refresh has since replaced: this page follows that list, not
                // this one, and laid under the new first page with its cursor it hid every notice
                // between them until the next refresh.
                if (state._cursor !== _cursor) return {};
                // De-duplicated by id, as an arrival over the socket may already be here.
                const existingIds = new Set(state.notifications.map(n => n.id));
                // The acts made here since this page was asked laid over it, as over the first page's: an
                // older page on its way as READ ALL was tapped came in unread, and a dismissed notice
                // on it came back (review round 9). Kept, not forgotten: the first page's read does that.
                const allReadSince = allReadAt !== null && allReadAt >= askedAt;
                const since = (acts: Map<string, number>, id: string) => (acts.get(id) ?? -Infinity) >= askedAt;
                const deduped = validated
                    .filter(n => !existingIds.has(n.id) && !since(goneHere, n.id))
                    .map(n => (!n.read && (allReadSince || since(readHere, n.id)) ? { ...n, read: true } : n));
                const allNotifs = [...state.notifications, ...deduped].slice(0, LOCAL_NOTIFICATION_CAP);

                // From the RAW response, as in the first fetch.
                const lastRaw = data[data.length - 1] as { created_at?: string; id?: string } | undefined;
                const advanced = lastRaw?.created_at && lastRaw?.id
                    ? `${lastRaw.created_at}|${lastRaw.id}`
                    : null;

                return {
                    moreFailed: false,
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
            set({ moreFailed: true });
        }
        } finally {
            if (stillSignedIn(user.id)) set((state) => ({ loading: state._fetching, _fetchingMore: false }));
        }
    },

    markRead: async (id: string) => {
        const startedAs = useAuthStore.getState().user?.id ?? null;
        const previousState = get().notifications;
        const wasUnread = previousState.some(n => n.id === id && !n.read);

        // Optimistic update
        set((state) => ({
            notifications: state.notifications.map((n) =>
                n.id === id ? { ...n, read: true } : n
            ),
            _unreadCount: wasUnread ? state._unreadCount - 1 : state._unreadCount,
        }));
        markingRead([id]);

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
            markTaken([id]);
            // Unread on the board again, a READ ALL refused meanwhile having taken it back with the
            // rest: the house has it read, and the board says so (review round 10).
            if (stillSignedIn(startedAs) && get().notifications.some((n) => n.id === id && !n.read)) {
                set((state) => ({
                    notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
                    _unreadCount: Math.max(0, state._unreadCount - 1),
                }));
            }
        } catch (e) {
            markRefused([id]);
            logger.warn('[markRead] failed', id, e);
            // Only while still signed in: after a logout it would restore the last member's.
            if (stillSignedIn(startedAs) && wasUnread) set((state) => unreadAgain(state, new Set([id])));
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

        // Optimistic Update
        set((state) => ({
            notifications: state.notifications.map((n) => ({ ...n, read: true })),
            _unreadCount: 0,
        }));
        const allReadBefore = allReadAt;
        allReadAt = Infinity;

        try {
            const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
            if (error) throw error;
            // Landed after a sign-out, it is the last member's: the next member's board is not read
            // all-read by it, nor handed the last member's mark back.
            if (stillSignedIn(startedAs)) allReadAt = monotonicNow();
        } catch (e) {
            if (stillSignedIn(startedAs)) allReadAt = allReadBefore;
            logger.warn(`[markAllRead] Failed:`, e);
            // Rolled back only while still signed in, as in markRead: the ones it marked, alone, and not
            // one the member opened meanwhile that the house took (readHere holds when), which the rollback
            // marked unread again. One opened and still on its way is taken back with the rest: refused
            // too, it is unread, as at the house; taken, its own landing marks it read again.
            // Said: undone in silence, the board flipped back as though READ ALL had never been pressed
            // (review round 10).
            if (stillSignedIn(startedAs)) {
                set((state) => unreadAgain(state, new Set(previousState.filter((n) => !n.read && !((readHere.get(n.id) ?? Infinity) < Infinity)).map((n) => n.id))));
                reelToast.error('The notices could not be marked read. Try again.');
            }
        }
    },

    dismiss: async (id: string) => {
        const startedAs = useAuthStore.getState().user?.id ?? null;
        const previousState = get().notifications;
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
            goneHere.set(id, Infinity);
            const { error } = await supabase.from('notifications').delete().eq('id', id).eq('user_id', user.id);
            if (error) throw error;
            goneHere.set(id, monotonicNow());
        } catch (e) {
            goneHere.delete(id);
            logger.warn('[dismiss] failed', id, e);
            // Rolled back only while still signed in, as in markRead: this notice, put back, and said.
            if (stillSignedIn(startedAs)) {
                set((state) => putBack(state, previousState.filter((n) => n.id === id)));
                reelToast.error('The notice could not be dismissed. Try again.');
            }
        }
    },

    markGroupRead: async (ids: string[]) => {
        const startedAs = useAuthStore.getState().user?.id ?? null;
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
        markingRead(ids);

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
            markTaken(ids);
        } catch (e) {
            markRefused(ids);
            logger.warn('[markGroupRead] failed', ids.length, e);
            // See markRead: the group's notices that were unread, read again.
            if (stillSignedIn(startedAs)) set((state) => unreadAgain(state, new Set(previousState.filter((n) => ids.includes(n.id) && !n.read).map((n) => n.id))));
        }
    },

    dismissGroup: async (ids: string[]) => {
        const startedAs = useAuthStore.getState().user?.id ?? null;
        if (ids.length === 0) return;

        const previousState = get().notifications;
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
            for (const id of ids) goneHere.set(id, Infinity);
            const { error } = await supabase
                .from('notifications')
                .delete()
                .in('id', ids)
                .eq('user_id', user.id);
            if (error) throw error;
            const at = monotonicNow();
            for (const id of ids) goneHere.set(id, at);
        } catch (e) {
            for (const id of ids) goneHere.delete(id);
            logger.warn('[dismissGroup] failed', ids.length, e);
            // See markRead: the group, put back.
            if (stillSignedIn(startedAs)) {
                set((state) => putBack(state, previousState.filter((n) => ids.includes(n.id))));
                reelToast.error('The notices could not be dismissed. Try again.');
            }
        }
    },

    // The board hides a request's notice (the door answers it), so the bell kept its unread count
    // and READ ALL stood lit over a board with nothing to read until it was read again (review
    // round 6).
    forgetRequestNotices: (fromUserId) => set((state) => {
        const gone = state.notifications.filter((n) => n.type === 'follow_request'
            && (fromUserId === null || n.from_user_id === fromUserId));
        if (gone.length === 0) return state;
        const unreadGone = gone.filter((n) => !n.read).length;
        return {
            notifications: state.notifications.filter((n) => !gone.includes(n)),
            _unreadCount: Math.max(0, state._unreadCount - unreadGone),
        };
    }),

    // The house withholds a hidden member's notices from every read (notifications_hide_blocked),
    // but the board held what it had read: after a block or a mute the bell still counted theirs
    // and the board drew them until it was read again, and offline for good (review round 7).
    forgetNoticesFrom: (hidden) => set((state) => {
        const gone = state.notifications.filter((n) => !!n.from_user_id && hidden.has(n.from_user_id));
        if (gone.length === 0) return state;
        const unreadGone = gone.filter((n) => !n.read).length;
        return {
            notifications: state.notifications.filter((n) => !gone.includes(n)),
            _unreadCount: Math.max(0, state._unreadCount - unreadGone),
        };
    }),

    unreadCount: () => get()._unreadCount,

    setupRealtime: () => {
        const user = useAuthStore.getState().user;
        if (!user) return;

        // One subscription, however often this is called (StrictMode calls twice).
        if (_realtimeCleanup) return _realtimeCleanup;

        // Back after a drop, the notices missed in the gap are read; down past a beat, they are
        // said not to be live and read again on a fixed interval until the channel answers.
        const watch = watchChannel({
            reread: () => { void get().fetchNotifications(); },
            onLive: (live) => set((s) => (s.noticesLive === live ? s : { noticesLive: live })),
        });

        // Private: realtime.messages admits a signed-in member; each row still
        // reaches only its own member, by the notifications table's rules.
        // Opened once its last leave is answered: a member switch opened it again in the same moment, and
        // was handed the last member's channel on its way out (openChannel, review round 9).
        const close = openChannel('global_notifications', (topic) => supabase
            .channel(topic, { config: { private: true } })
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

                    set((state) => ({ ...applyIncomingNotification(state, newNotif), noticesHeard: state.noticesHeard + 1 }));
                    // A request answered: the follow is the house's now, and the phone's list said
                    // REQUESTED, the dossier sealed under the notice that said it was open.
                    if (newNotif.type === 'follow_accept') void hydrateFollowing();
                }
            )
            .subscribe((status) => { watch.status(status); }));

        const cleanup = () => {
            // Left on purpose: its CLOSED is not a drop.
            watch.end();
            close();
            _realtimeCleanup = null;
            set({ noticesLive: true });
        };

        // Module-scoped cleanup so resetAllStores can call it
        _realtimeCleanup = cleanup;

        return cleanup;
    }
        }),
        {
            name: 'reelhouse-notifications',
            // What the last release saved, named and carried (savedVersion.ts).
            version: SAVED_VERSION,
            migrate: carriedForward,
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
    // All of it, from the one list: a flag left raised holds every read after it.
    useNotificationStore.setState(noticesAtStart());
    readHere.clear();
    goneHere.clear();
    allReadAt = null;
    try { zustandMMKVStorage.removeItem('reelhouse-notifications'); } catch { /* noop */ }
});

// A member hidden on this phone leaves the notices at once (forgetNoticesFrom). Heard here, where
// the block store is already read: the block store reaching for this one would make the two load
// each other.
useBlockStore.subscribe((now, before) => {
    if (now.blocked === before.blocked && now.muted === before.muted) return;
    useNotificationStore.getState().forgetNoticesFrom(new Set([...now.blocked, ...now.muted]));
});

/** Closes the socket early, for auth.ts during logout. */
export function teardownNotificationRealtime() {
    if (_realtimeCleanup) { _realtimeCleanup(); _realtimeCleanup = null; }
}
