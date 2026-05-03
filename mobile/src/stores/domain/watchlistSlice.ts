import { StateCreator } from 'zustand';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../auth';
import { FilmState } from '../films';
import reelToast from '../../utils/reelToast';
import { WatchlistItem } from '../../types';
import { Image } from 'expo-image';
import { enqueueMutation } from '../../utils/offlineQueue';

export interface WatchlistSlice {
    watchlist: WatchlistItem[];
    watchlistHasMore: boolean;
    watchlistPage: number;
    _fetchingWatchlist: boolean;
    _watchlistIndex: Record<number, true>;

    fetchWatchlist: (loadMore?: boolean) => Promise<void>;
    addToWatchlist: (film: { id: number; title?: string; name?: string; poster_path?: string | null; release_date?: string }) => Promise<void>;
    removeFromWatchlist: (filmId: number) => Promise<void>;
}

export const createWatchlistSlice: StateCreator<FilmState, [], [], WatchlistSlice> = (set, get) => ({
    watchlist: [],
    watchlistHasMore: true,
    watchlistPage: 0,
    _fetchingWatchlist: false,
    _watchlistIndex: {},

    fetchWatchlist: async (loadMore = false) => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        const state = get();
        if (state._fetchingWatchlist) return;
        if (loadMore && !state.watchlistHasMore) return;
        set({ _fetchingWatchlist: true });

        const PAGE_SIZE = 50;
        const page = loadMore ? state.watchlistPage : 0;

        const { data, error } = await supabase
            .from('watchlists').select('id, user_id, film_id, film_title, poster_path, year, created_at').eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (error || !data) { set({ _fetchingWatchlist: false }); return; }

        const hasMore = data.length === PAGE_SIZE;
        const newItems = data.map((w) => ({ id: w.film_id, title: w.film_title, poster_path: w.poster_path ?? null, year: w.year ?? null }));
        const nextWatchlist = loadMore ? [...state.watchlist, ...newItems] : newItems;
        const cappedWatchlist = nextWatchlist.slice(0, 500);
        const idx: Record<number, true> = {};
        cappedWatchlist.forEach(w => { idx[w.id] = true; });
        
        set({
            watchlist: cappedWatchlist,
            _watchlistIndex: idx,
            watchlistPage: page + 1,
            watchlistHasMore: hasMore,
            _fetchingWatchlist: false,
        });

        // Background Image Prefetching (Cache Warming) — D4-01 FIX: only prefetch NEW entries
        const newEntries = loadMore ? newItems : cappedWatchlist;
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
            poster_path: film.poster_path ?? null,
            year: film.release_date ? (parseInt(film.release_date.slice(0, 4)) || null) : null,
        };

        set((state) => ({
            watchlist: [newEntry, ...state.watchlist],
            _watchlistIndex: { ...state._watchlistIndex, [film.id]: true }
        }));

        const { error } = await supabase.from('watchlists').insert([{
            user_id: user.id,
            film_id: film.id,
            film_title: film.title ?? film.name ?? 'Untitled',
            poster_path: film.poster_path ?? null,
            year: film.release_date ? (parseInt(film.release_date.slice(0, 4)) || null) : null,
        }]);

        if (error) {
            const errMsg = error?.message ?? '';
            const errLower = errMsg.toLowerCase();
            if (errLower.includes('fetch') || errLower.includes('network')) {
                // H-06 AUDIT FIX: Queue for offline sync instead of silent rollback
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
    },

    removeFromWatchlist: async (filmId) => {
        const user = useAuthStore.getState().user;
        if (!user) return;

        const itemToRemove = get().watchlist.find((f) => f.id === filmId);
        if (!itemToRemove) return;

        set((state) => {
            const nextIdx = { ...state._watchlistIndex };
            delete nextIdx[filmId];
            return {
                watchlist: state.watchlist.filter((f) => f.id !== filmId),
                _watchlistIndex: nextIdx
            };
        });

        const { error } = await supabase.from('watchlists').delete().eq('user_id', user.id).eq('film_id', filmId);

        if (error) {
            const errMsg = error?.message ?? '';
            const errLower = errMsg.toLowerCase();
            if (errLower.includes('fetch') || errLower.includes('network')) {
                // H-06 AUDIT FIX: Queue removal for offline sync
                enqueueMutation({ type: 'remove_watchlist', payload: { user_id: user.id, film_id: filmId } });
            } else {
                set((state) => ({
                    watchlist: [itemToRemove, ...state.watchlist],
                    _watchlistIndex: { ...state._watchlistIndex, [filmId]: true }
                }));
                reelToast.error('Failed to remove from watchlist.');
            }
        }
    },
});
