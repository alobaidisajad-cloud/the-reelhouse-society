import { StateCreator } from 'zustand';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../auth';
import { FilmState } from '../films';
import reelToast from '../../utils/reelToast';
import { enqueueMutation } from '../../utils/offlineQueue';
import { CustomList } from '../../types';
import { Image } from 'expo-image';
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// C-02 AUDIT FIX: Helper to detect network errors for offline queue routing
const isNetworkError = (e: unknown): boolean => {
    const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
    return msg.includes('fetch') || msg.includes('network') || msg.includes('offline');
};

export interface ListSlice {
    lists: CustomList[];
    listsHasMore: boolean;
    listsPage: number;
    _fetchingLists: boolean;

    fetchLists: (loadMore?: boolean) => Promise<void>;
    createList: (list: Partial<CustomList>) => Promise<void>;
    updateList: (listId: string, updates: Partial<CustomList>) => Promise<void>;
    deleteList: (listId: string) => Promise<void>;
    addFilmToList: (listId: string, film: { id: number; title?: string; name?: string; poster_path?: string | null }) => Promise<void>;
    removeFilmFromList: (listId: string, filmId: number) => Promise<void>;
}

export const createListSlice: StateCreator<FilmState, [], [], ListSlice> = (set, get) => ({
    lists: [],
    listsHasMore: true,
    listsPage: 0,
    _fetchingLists: false,

    fetchLists: async (loadMore = false) => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        const state = get();
        if (state._fetchingLists) return;
        if (loadMore && !state.listsHasMore) return;
        set({ _fetchingLists: true });

        const PAGE_SIZE = 20;
        const page = loadMore ? state.listsPage : 0;

        const { data, error } = await supabase
            .from('lists')
            .select(`
                id, user_id, title, description, is_ranked, is_private, created_at,
                list_items ( id, film_id, film_title, poster_path, position )
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (error || !data) { set({ _fetchingLists: false }); return; }

        const hasMore = data.length === PAGE_SIZE;

        interface ListItemRow { id: string; film_id: number; film_title: string; poster_path: string | null; position: number }
        interface ListRow { id: string; title: string; description: string | null; is_ranked: boolean; is_private: boolean; created_at: string; list_items: ListItemRow[] }

        const newLists = (data as ListRow[]).map((d) => {
            const items = d.list_items || [];
            items.sort((a, b) => a.position - b.position);
            return {
                id: d.id,
                title: d.title,
                description: d.description ?? undefined,
                isRanked: d.is_ranked,
                isPrivate: d.is_private,
                createdAt: d.created_at,
                films: items.map((i) => ({
                    id: i.film_id,
                    title: i.film_title,
                    poster: i.poster_path
                }))
            };
        });

        const nextLists = loadMore ? [...state.lists, ...newLists] : newLists;
        set({
            lists: nextLists,
            listsPage: page + 1,
            listsHasMore: hasMore,
            _fetchingLists: false,
        });

        // Background Image Prefetching (Cache Warming) — D4-02 FIX: only prefetch NEW entries
        const posterUrls: string[] = [];
        newLists.forEach(list => {
            list.films?.forEach((f: any) => {
                if (f.poster) {
                    posterUrls.push(`https://image.tmdb.org/t/p/w500${f.poster}`);
                }
            });
        });
        if (posterUrls.length > 0) {
            Image.prefetch(posterUrls, 'disk').catch(() => {});
        }
    },

    createList: async (list) => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        const listId = generateUUID();
        const { data, error } = await supabase.from('lists').insert([{
            id: listId, user_id: user.id, title: list.title, description: list.description ?? '', is_private: list.isPrivate ?? false, is_ranked: list.isRanked ?? false
        }]).select().single();
        if (error) {
            if (isNetworkError(error)) {
                // C-02 AUDIT FIX: Queue for offline sync
                const inputFilms = (list as { films?: { id: number; title?: string; poster_path?: string | null; poster?: string | null }[] }).films ?? [];
                enqueueMutation({ type: 'create_list', payload: {
                    id: listId, user_id: user.id, title: list.title ?? 'Untitled', description: list.description ?? '',
                    is_private: list.isPrivate ?? false, is_ranked: list.isRanked ?? false,
                    films: inputFilms.map((f, idx) => ({ film_id: f.id, film_title: f.title ?? 'Unknown', poster_path: f.poster_path ?? f.poster ?? null, position: idx })),
                } });
                const filmEntries = inputFilms.map(f => ({ id: f.id, title: f.title ?? 'Unknown', poster: f.poster_path ?? f.poster ?? null }));
                set((state) => ({ lists: [{ id: listId, title: list.title ?? 'Untitled', description: list.description ?? '', isRanked: list.isRanked ?? false, isPrivate: list.isPrivate ?? false, films: filmEntries, createdAt: new Date().toISOString() }, ...state.lists] }));
                reelToast('List saved offline. Will sync when connected.');
                return;
            }
            throw error;
        }
        if (data) {
            const inputFilms = (list as { films?: { id: number; title?: string; poster_path?: string | null; poster?: string | null }[] }).films ?? [];
            const filmEntries = inputFilms.map((f) => ({ id: f.id, title: f.title ?? 'Unknown', poster: f.poster_path ?? f.poster ?? null }));
            
            set((state) => ({ lists: [{ id: data.id, title: list.title ?? 'Untitled', description: list.description ?? '', isRanked: list.isRanked ?? false, isPrivate: list.isPrivate ?? false, films: filmEntries, createdAt: data.created_at }, ...state.lists] }));
            
            if (inputFilms.length > 0) {
                const items = inputFilms.map((f, idx) => ({
                    list_id: data.id,
                    film_id: f.id,
                    film_title: f.title ?? 'Unknown',
                    poster_path: f.poster_path ?? f.poster ?? null,
                    position: idx,
                }));
                const { error: itemsError } = await supabase.from('list_items').insert(items);
                if (itemsError) {
                    if (__DEV__) console.warn('[createList] list_items insert failed, rolling back:', itemsError);
                    set((state) => ({ lists: state.lists.filter(l => l.id !== data.id) }));
                    await supabase.from('lists').delete().eq('id', data.id).eq('user_id', user.id);
                    reelToast.error('Failed to save films to list — please try again.');
                    throw itemsError;
                }
            }
        }
    },

    updateList: async (listId, updates) => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        
        const prevList = get().lists.find(l => l.id === listId);
        if (!prevList) return;
        
        const dbUpdates: Record<string, any> = {};
        if (updates.title !== undefined) dbUpdates.title = updates.title;
        if (updates.description !== undefined) dbUpdates.description = updates.description;
        if (updates.isPrivate !== undefined) dbUpdates.is_private = updates.isPrivate;
        if (updates.isRanked !== undefined) dbUpdates.is_ranked = updates.isRanked;

        const inputFilms = (updates as { films?: { id: number; title?: string; poster_path?: string | null; poster?: string | null }[] }).films;
        
        set((state) => ({
            lists: state.lists.map(l => l.id === listId ? { 
                ...l, 
                ...updates,
                films: inputFilms !== undefined ? inputFilms.map(f => ({ id: f.id, title: f.title ?? 'Unknown', poster: f.poster_path ?? f.poster ?? null })) : l.films 
            } : l)
        }));

        try {
            const { error } = await supabase.from('lists').update(dbUpdates).eq('id', listId).eq('user_id', user.id);
            if (error) throw error;
            
            if (inputFilms !== undefined) {
                await supabase.from('list_items').delete().eq('list_id', listId);
                if (inputFilms.length > 0) {
                    const items = inputFilms.map((f, idx) => ({
                        list_id: listId,
                        film_id: f.id,
                        film_title: f.title ?? 'Unknown',
                        poster_path: f.poster_path ?? f.poster ?? null,
                        position: idx,
                    }));
                    const { error: itemsError } = await supabase.from('list_items').insert(items);
                    if (itemsError) throw itemsError;
                }
            }
        } catch (e: unknown) {
            set((state) => ({ lists: state.lists.map(l => l.id === listId ? prevList : l) }));
            reelToast.error('Failed to update list — changes reverted.');
            throw e;
        }
    },

    deleteList: async (listId) => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        
        const listToRemove = get().lists.find(l => l.id === listId);
        if (!listToRemove) return;
        
        set((state) => ({ lists: state.lists.filter(l => l.id !== listId) }));

        try {
            // Delete child items FIRST to prevent orphans (safe regardless of CASCADE)
            await supabase.from('list_items').delete().eq('list_id', listId);
            const { error } = await supabase.from('lists').delete().eq('id', listId).eq('user_id', user.id);
            if (error) throw error;
        } catch (e: unknown) {
            if (isNetworkError(e)) {
                // C-02 AUDIT FIX: Queue for offline sync
                enqueueMutation({ type: 'delete_list', payload: { list_id: listId, user_id: user.id } });
                reelToast('List removed offline. Will sync when connected.');
                return;
            }
            set((state) => ({ lists: [listToRemove, ...state.lists] }));
            reelToast.error('Failed to delete list — please try again.');
            throw e;
        }
    },

    addFilmToList: async (listId, film) => {
        const listIdx = get().lists.findIndex(l => l.id === listId);
        if (listIdx === -1) return;
        
        const currentList = get().lists[listIdx];
        if (currentList.films.some(f => f.id === film.id)) return;
        
        const newFilm = { id: film.id, title: film.title ?? film.name ?? 'Unknown', poster: film.poster_path ?? null };

        set((state) => ({
            lists: state.lists.map((l) => l.id === listId ? { ...l, films: [...l.films, newFilm] } : l),
        }));

        try {
            const position = currentList.films.length; // 0-indexed: new film goes to end
            const { error } = await supabase.from('list_items').insert([{
                list_id: listId, film_id: film.id, film_title: newFilm.title,
                poster_path: newFilm.poster,
                position, // Required for ranked lists — maintains sort order
            }]);
            if (error) throw error;
         
        } catch (e: unknown) {
            if (isNetworkError(e)) {
                // C-02 AUDIT FIX: Queue for offline sync
                enqueueMutation({ type: 'add_film_to_list', payload: {
                    list_id: listId, film_id: film.id, film_title: newFilm.title, poster_path: newFilm.poster, position: currentList.films.length,
                } });
                reelToast('Film added offline. Will sync when connected.');
                return;
            }
            set((state) => ({
                lists: state.lists.map((l) => l.id === listId ? { ...l, films: l.films.filter(f => f.id !== film.id) } : l),
            }));
            reelToast.error('Failed to add film to stack.');
        }
    },

    removeFilmFromList: async (listId, filmId) => {
        const listIdx = get().lists.findIndex(l => l.id === listId);
        if (listIdx === -1) return;
        
        const currentList = get().lists[listIdx];
        const filmToRemove = currentList.films.find(f => f.id === filmId);
        if (!filmToRemove) return;

        set((state) => ({
            lists: state.lists.map((l) => l.id === listId ? { ...l, films: l.films.filter((f) => f.id !== filmId) } : l),
        }));

        try {
            const { error } = await supabase.from('list_items').delete().eq('list_id', listId).eq('film_id', filmId);
            if (error) throw error;
         
        } catch (e: unknown) {
            if (isNetworkError(e)) {
                // C-02 AUDIT FIX: Queue for offline sync
                enqueueMutation({ type: 'remove_film_from_list', payload: { list_id: listId, film_id: filmId } });
                reelToast('Film removed offline. Will sync when connected.');
                return;
            }
            set((state) => ({
                lists: state.lists.map((l) => l.id === listId ? { ...l, films: [...l.films, filmToRemove] } : l),
            }));
            reelToast.error('Failed to remove film from stack.');
        }
    },
});
