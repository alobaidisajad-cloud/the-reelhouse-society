import { Image } from 'expo-image';
import { StateCreator } from 'zustand';
import { captureError } from '../../lib/sentry';
import { supabase } from '../../lib/supabase';
import { WatchlistItem } from '../../types';
import { isNetworkError } from '../../utils/networkError';
import { enqueueMutation } from '../../utils/offlineQueue';
import reelToast from '../../utils/reelToast';
import { useAuthStore } from '../auth';
import { runWithMutex } from './helpers/promiseMutex';

/** The DATA this slice owns — see the note on `LogSliceData`. */
export interface WatchlistSliceData {
    watchlist: WatchlistItem[];
    watchlistHasMore: boolean;
    watchlistPage: number;
    _fetchingWatchlist: boolean;
    _watchlistIndex: Record<number, true>;
    _watchlistCursor: string | null;
}

/**
 * A FUNCTION, never a shared constant — see the note on `logSliceInitialState`.
 * The reset spreads this, and a constant would hand every reset the same objects.
 */
export const watchlistSliceInitialState = (): WatchlistSliceData => ({
    watchlist: [],
    watchlistHasMore: true,
    watchlistPage: 0,
    _fetchingWatchlist: false,
    _watchlistIndex: {},
    _watchlistCursor: null,
});

export interface WatchlistSlice extends WatchlistSliceData {
    fetchWatchlist: (loadMore?: boolean) => Promise<void>;
    addToWatchlist: (film: { id: number; title?: string; name?: string; poster_path?: string | null; release_date?: string }) => Promise<void>;
    removeFromWatchlist: (filmId: number) => Promise<void>;
}

export const createWatchlistSlice: StateCreator<WatchlistSlice, [], [], WatchlistSlice> = (set, get) => ({
    ...watchlistSliceInitialState(),

    fetchWatchlist: async (loadMore = false) => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        const state = get();
        if (state._fetchingWatchlist) return;
        if (loadMore && !state.watchlistHasMore) return;
        set({ _fetchingWatchlist: true });

        const PAGE_SIZE = 50;

        let query = supabase
            .from('watchlists').select('id, user_id, film_id, film_title, poster_path, year, created_at').eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(PAGE_SIZE);

        // Cursor-based keyset pagination
        const cursor = loadMore ? state._watchlistCursor : null;
        if (cursor) {
            const [cursorDate, cursorId] = cursor.split('|');
            if (cursorDate && cursorId) {
                query = query.or(`created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},id.lt.${cursorId})`);
            }
        }

        const { data, error } = await query;

        if (error || !data) { set({ _fetchingWatchlist: false }); return; }

        const hasMore = data.length === PAGE_SIZE;
        const newItems = data.map((w) => ({ id: w.film_id, title: w.film_title, poster: w.poster_path ?? null, poster_path: w.poster_path ?? null, year: w.year ?? null }));
        // No arbitrary cap: keyset pagination bounds each fetch and the list is
        // virtualized, so capping here only served to silently drop a power
        // user's items past 500 whenever loadMore ran.
        const nextWatchlist = loadMore ? [...state.watchlist, ...newItems] : newItems;
        const idx: Record<number, true> = {};
        nextWatchlist.forEach(w => { idx[w.id] = true; });

        // Compute next cursor from last row
        const lastRow = data.length > 0 ? data[data.length - 1] : null;
        const nextCursor = hasMore && lastRow ? `${lastRow.created_at}|${lastRow.id}` : null;
        
        set({
            watchlist: nextWatchlist,
            _watchlistIndex: idx,
            watchlistPage: (loadMore ? state.watchlistPage : 0) + 1,
            watchlistHasMore: hasMore,
            _fetchingWatchlist: false,
            _watchlistCursor: nextCursor,
        });

        // Background image prefetching: only prefetch new entries
        const newEntries = loadMore ? newItems : nextWatchlist;
        const posterUrls = newEntries
            .filter(w => w.poster_path)
            .map(w => `https://image.tmdb.org/t/p/w500${w.poster_path}`);
        if (posterUrls.length > 0) {
            Image.prefetch(posterUrls, 'disk').catch(() => {});
        }
    },

    addToWatchlist: async (film) => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        
        const exists = get().watchlist.find((f) => f.id === film.id);
        if (exists) return;

        const newEntry = {
            id: film.id,
            title: film.title ?? film.name ?? 'Untitled',
            poster: film.poster_path ?? null,
            poster_path: film.poster_path ?? null,
            year: film.release_date ? (parseInt(film.release_date.slice(0, 4)) || null) : null,
        };

        set((state) => ({
            watchlist: [newEntry, ...state.watchlist],
            _watchlistIndex: { ...state._watchlistIndex, [film.id]: true }
        }));
        // NOT announced here. The success path below toasts — and a toast is now
        // spoken on both platforms (ToastOverlay announces on iOS, where the
        // live region does not fire) — so announcing here as well made a
        // VoiceOver member hear "Added to watchlist" and then, half a second
        // later, "\"Dune\" added to watchlist": the same fact twice, the second
        // strictly more informative. Android had been doubling this all along;
        // giving iOS its missing spoken channel is what made it visible.
        //
        // The offline branch is the one path with no toast, so it announces —
        // see below. One spoken message per outcome, which is the same rule the
        // log flow follows.

        const dbOperation = async () => {
            const { error } = await supabase.from('watchlists').insert([{
                user_id: user.id,
                film_id: film.id,
                film_title: film.title ?? film.name ?? 'Untitled',
                poster_path: film.poster_path ?? null,
                year: film.release_date ? (parseInt(film.release_date.slice(0, 4)) || null) : null,
            }]);

            if (error) {
                if (isNetworkError(error)) {
                    // Queue for offline sync instead of silent rollback
                    enqueueMutation({ type: 'add_watchlist', payload: {
                        user_id: user.id, film_id: film.id,
                        film_title: film.title ?? film.name ?? 'Untitled',
                        poster_path: film.poster_path ?? null,
                        year: film.release_date ? (parseInt(film.release_date.slice(0, 4)) || null) : null,
                    } });
                    // The only path here that shows no toast, so it is the only
                    // one that speaks for itself. Sighted members see the row
                    // appear; without this a VoiceOver member got nothing at all.
                    try { require('react-native').AccessibilityInfo.announceForAccessibility('Added to watchlist'); } catch { /* test env */ }
                } else {
                    // Not a network failure — the offline branch above owns those.
                    captureError(error, { scope: 'watchlistSlice.addToWatchlist', filmId: film.id });
                    set((state) => {
                        const nextIdx = { ...state._watchlistIndex };
                        delete nextIdx[film.id];
                        return {
                            watchlist: state.watchlist.filter((f) => f.id !== film.id),
                            _watchlistIndex: nextIdx
                        };
                    });
                    reelToast.error('Failed to add to watchlist.');
                }
            } else {
                reelToast(`"${newEntry.title}" added to watchlist.`);
            }
        };

        // Fire-and-forget, exactly as before: this function did not await the
        // chain, and dbOperation handles its own failures rather than throwing.
        // The trailing catch preserves that — the shared helper propagates a
        // rejection to its caller, and nothing here is listening.
        void runWithMutex(`watchlist:${film.id}`, dbOperation).catch(() => {});
    },

    removeFromWatchlist: async (filmId) => {
        const user = useAuthStore.getState().user;
        if (!user) return;

        const previousWatchlist = [...get().watchlist];
        const itemToRemove = previousWatchlist.find((f) => f.id === filmId);
        if (!itemToRemove) return;

        set((state) => {
            const nextIdx = { ...state._watchlistIndex };
            delete nextIdx[filmId];
            return {
                watchlist: state.watchlist.filter((f) => f.id !== filmId),
                _watchlistIndex: nextIdx
            };
        });

        // Adding spoke and removing said nothing — the same silent-sibling
        // asymmetry as filing a record versus amending one. Removal shows no
        // success toast on ANY path (the row simply disappears, which a sighted
        // member can see and a VoiceOver member cannot), so this is the single
        // spoken channel here and cannot double with one.
        try { require('react-native').AccessibilityInfo.announceForAccessibility('Removed from watchlist'); } catch { /* test env */ }

        const dbOperation = async () => {
            const { error } = await supabase.from('watchlists').delete().eq('user_id', user.id).eq('film_id', filmId);

            if (error) {
                if (isNetworkError(error)) {
                    // Queue removal for offline sync
                    enqueueMutation({ type: 'remove_watchlist', payload: { user_id: user.id, film_id: filmId } });
                } else {
                    // Not a network failure — the offline branch above owns those.
                    captureError(error, { scope: 'watchlistSlice.removeFromWatchlist', filmId });
                    set((state) => ({
                        watchlist: previousWatchlist,
                        _watchlistIndex: { ...state._watchlistIndex, [filmId]: true }
                    }));
                    reelToast.error('Failed to remove from watchlist.');
                }
            }
        };

        // Same key as the add path, so add and remove for one film serialise
        // against each other — a remove must never overtake its own add.
        void runWithMutex(`watchlist:${filmId}`, dbOperation).catch(() => {});
    },
});
