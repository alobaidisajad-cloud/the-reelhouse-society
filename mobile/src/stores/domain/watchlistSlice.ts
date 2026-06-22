import { Image } from 'expo-image';
import { StateCreator } from 'zustand';
import { supabase } from '../../lib/supabase';
import { WatchlistItem } from '../../types';
import { isNetworkError } from '../../utils/networkError';
import { enqueueMutation } from '../../utils/offlineQueue';
import reelToast from '../../utils/reelToast';
import { useAuthStore } from '../auth';

export interface WatchlistSlice {
    watchlist: WatchlistItem[];
    watchlistHasMore: boolean;
    watchlistPage: number;
    _fetchingWatchlist: boolean;
    _watchlistIndex: Record<number, true>;
    _watchlistPromises: Record<number, Promise<void>>;
    _watchlistCursor: string | null;

    fetchWatchlist: (loadMore?: boolean) => Promise<void>;
    addToWatchlist: (film: { id: number; title?: string; name?: string; poster_path?: string | null; release_date?: string }) => Promise<void>;
    removeFromWatchlist: (filmId: number) => Promise<void>;
}

export const createWatchlistSlice: StateCreator<WatchlistSlice, [], [], WatchlistSlice> = (set, get) => ({
    watchlist: [],
    watchlistHasMore: true,
    watchlistPage: 0,
    _fetchingWatchlist: false,
    _watchlistIndex: {},
    _watchlistPromises: {},
    _watchlistCursor: null,

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
        try { require('react-native').AccessibilityInfo.announceForAccessibility('Added to watchlist'); } catch { /* test env */ }

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
                } else {
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

        const prevPromise = get()._watchlistPromises[film.id] || Promise.resolve();
        const nextPromise = prevPromise.then(dbOperation).catch(() => {});
        set(state => ({ _watchlistPromises: { ...state._watchlistPromises, [film.id]: nextPromise } }));
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

        const dbOperation = async () => {
            const { error } = await supabase.from('watchlists').delete().eq('user_id', user.id).eq('film_id', filmId);

            if (error) {
                if (isNetworkError(error)) {
                    // Queue removal for offline sync
                    enqueueMutation({ type: 'remove_watchlist', payload: { user_id: user.id, film_id: filmId } });
                } else {
                    set((state) => ({
                        watchlist: previousWatchlist,
                        _watchlistIndex: { ...state._watchlistIndex, [filmId]: true }
                    }));
                    reelToast.error('Failed to remove from watchlist.');
                }
            }
        };

        const prevPromise = get()._watchlistPromises[filmId] || Promise.resolve();
        const nextPromise = prevPromise.then(dbOperation).catch(() => {});
        set(state => ({ _watchlistPromises: { ...state._watchlistPromises, [filmId]: nextPromise } }));
    },
});
