import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import { StateCreator } from 'zustand';
import { queryClient } from '../../lib/queryClient';
import { supabase } from '../../lib/supabase';
import { tmdb } from '../../lib/tmdb';
import { CustomList } from '../../types';
import { ListRow, mapListRow } from '../../utils/mappers';
import { isNetworkError } from '../../utils/networkError';
import { enqueueMutation } from '../../utils/offlineQueue';
import reelToast from '../../utils/reelToast';
import { useAuthStore } from '../auth';

export interface ListSlice {
    lists: CustomList[];
    listsHasMore: boolean;
    _listsCursor: string | null;
    _fetchingLists: boolean;

    fetchLists: (loadMore?: boolean) => Promise<void>;
    createList: (list: Partial<CustomList>) => Promise<void>;
    updateList: (listId: string, updates: Partial<CustomList>) => Promise<void>;
    deleteList: (listId: string) => Promise<void>;
    addFilmToList: (listId: string, film: { id: number; title?: string; name?: string; poster_path?: string | null }) => Promise<void>;
    removeFilmFromList: (listId: string, filmId: number) => Promise<void>;
}

export const createListSlice: StateCreator<ListSlice, [], [], ListSlice> = (set, get) => ({
    lists: [],
    listsHasMore: true,
    _listsCursor: null,
    _fetchingLists: false,

    fetchLists: async (loadMore = false) => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        const state = get();
        if (state._fetchingLists) return;
        if (loadMore && !state.listsHasMore) return;
        set({ _fetchingLists: true });

        const PAGE_SIZE = 20;

        let query = supabase
            .from('lists')
            .select(`
                id, user_id, title, description, is_ranked, is_private, created_at,
                list_items ( id, film_id, film_title, poster_path, position )
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .order('position', { foreignTable: 'list_items', ascending: true })
            .limit(PAGE_SIZE);

        // Cursor-based keyset pagination
        const cursor = loadMore ? state._listsCursor : null;
        if (cursor) {
            const parts = cursor.split('|');
            if (parts.length === 2 && parts[0] && parts[1]) {
                const [cursorDate, cursorId] = parts;
                query = query.or(`created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},id.lt.${cursorId})`);
            }
        }

        const { data, error } = await query;

        if (error || !data) { set({ _fetchingLists: false }); return; }

        const hasMore = data.length === PAGE_SIZE;

        // Compute next cursor from last row
        const lastRow = data.length > 0 ? data[data.length - 1] : null;
        const nextCursor = hasMore && lastRow ? `${lastRow.created_at}|${lastRow.id}` : null;

        const newLists = (data as unknown as ListRow[]).map(mapListRow);

        // ── Prevent optimistic clobbering (mirrors fetchLogsOp pattern) ──
        // When the offline queue has pending list mutations, server data is stale.
        // Merge pending creates/deletes/updates so the user sees consistent state.
        // NOTE: Dynamic require avoids Jest module mock resolution issues in test env.
        const { getOfflineQueue } = require('../../utils/offlineQueue');
        const queue: { type: string; payload: Record<string, any>; timestamp: number }[] = getOfflineQueue();
        const pendingDeletes = new Set(
            queue.filter((q: { type: string; payload: Record<string, any> }) => q.type === 'delete_list').map((q: { payload: Record<string, any> }) => q.payload.list_id as string)
        );
        const pendingUpdates = queue.filter((q: { type: string }) => q.type === 'update_list');
        const pendingCreates = queue
            .filter((q: { type: string; payload: Record<string, any> }) => q.type === 'create_list' && q.payload.user_id === user.id && !pendingDeletes.has(q.payload.id as string))
            .map((q: { payload: Record<string, any>; timestamp: number }) => {
                const p = q.payload as Record<string, any>;
                const films = Array.isArray(p.films) ? p.films.map((f: any) => ({
                    id: f.film_id ?? f.id,
                    title: f.film_title ?? f.title ?? 'Unknown',
                    poster: f.poster_path ?? f.poster ?? null,
                })) : [];
                return {
                    id: p.id as string,
                    title: (p.title as string) ?? 'Untitled',
                    description: (p.description as string) ?? '',
                    isRanked: p.is_ranked ?? false,
                    isPrivate: p.is_private ?? false,
                    createdAt: new Date(q.timestamp).toISOString(),
                    userId: user.id,
                    films,
                } as CustomList;
            });

        // Filter out deleted lists and apply pending item updates
        const reconciledLists = newLists
            .filter(l => !pendingDeletes.has(l.id))
            .map(list => {
                const upd = pendingUpdates.find((q: { payload: Record<string, any> }) => q.payload.list_id === list.id);
                if (upd?.payload.films && Array.isArray(upd.payload.films)) {
                    const films = (upd.payload.films as any[]).map((f: any) => ({
                        id: f.film_id ?? f.id,
                        title: f.film_title ?? f.title ?? 'Unknown',
                        poster: f.poster_path ?? f.poster ?? null,
                    }));
                    return { ...list, films };
                }
                return list;
            });

        // Deduplicate: pending creates that already exist on server (flushed between enqueue and fetch)
        const serverIds = new Set(reconciledLists.map(l => l.id));
        const uniqueCreates = pendingCreates.filter(l => !serverIds.has(l.id));

        const nextLists = loadMore
            ? [...state.lists, ...reconciledLists]
            : [...uniqueCreates, ...reconciledLists];
        // ── end ──
        set({
            lists: nextLists,
            _listsCursor: nextCursor,
            listsHasMore: hasMore,
            _fetchingLists: false,
        });

        // Background image prefetching to warm the native image cache.
        const posterUrls = new Set<string>();
        newLists.forEach(list => {
            // Cap at 4 items matching ProfileListsTab grid to prevent JS bridge starvation
            list.films?.slice(0, 4).forEach((f: any) => {
                if (f.poster && typeof f.poster === 'string') {
                    const url = tmdb.poster(f.poster, 'w185');
                    if (url) posterUrls.add(url);
                }
            });
        });
        if (posterUrls.size > 0) {
            const urls = Array.from(posterUrls).filter(Boolean) as string[];
            setTimeout(async () => {
                for (let i = 0; i < urls.length; i += 5) {
                    const chunk = urls.slice(i, i + 5);
                    await Promise.all(chunk.map(url => Image.prefetch(url, 'disk').catch(() => {})));
                }
            }, 1000);
        }
    },

    createList: async (list) => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        const listId = Crypto.randomUUID();
        const { data, error } = await supabase.from('lists').insert([{
            id: listId, user_id: user.id, title: list.title, description: list.description ?? '', is_private: list.isPrivate ?? false, is_ranked: list.isRanked ?? false
        }]).select().single();
        if (error) {
            if (isNetworkError(error)) {
                // Queue for offline sync
                const inputFilms = (list as { films?: { id: number; title?: string; poster_path?: string | null; poster?: string | null }[] }).films ?? [];
                enqueueMutation({ type: 'create_list', payload: {
                    id: listId, user_id: user.id, title: list.title ?? 'Untitled', description: list.description ?? '',
                    is_private: list.isPrivate ?? false, is_ranked: list.isRanked ?? false,
                    films: inputFilms.map((f, idx) => ({ film_id: f.id, film_title: f.title ?? 'Unknown', poster_path: f.poster_path ?? f.poster ?? null, position: idx })),
                } });
                const filmEntries = inputFilms.map(f => ({ id: f.id, title: f.title ?? 'Unknown', poster: f.poster_path ?? f.poster ?? null }));
                set((state) => ({ lists: [{ id: listId, title: list.title ?? 'Untitled', description: list.description ?? '', isRanked: list.isRanked ?? false, isPrivate: list.isPrivate ?? false, films: filmEntries, createdAt: new Date().toISOString(), userId: user.id }, ...state.lists] }));
                reelToast('List saved offline. Will sync when connected.');
                return;
            }
            throw error;
        }
        if (data) {
            const inputFilms = (list as { films?: { id: number; title?: string; poster_path?: string | null; poster?: string | null }[] }).films ?? [];
            const filmEntries = inputFilms.map((f) => ({ id: f.id, title: f.title ?? 'Unknown', poster: f.poster_path ?? f.poster ?? null }));
            
            set((state) => ({ lists: [{ id: data.id, title: list.title ?? 'Untitled', description: list.description ?? '', isRanked: list.isRanked ?? false, isPrivate: list.isPrivate ?? false, films: filmEntries, createdAt: data.created_at, userId: user.id }, ...state.lists] }));
            
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
                    if (isNetworkError(itemsError)) {
                        // Push idempotent update payload to queue instead of failing offline rollback.
                        // Since the parent list is already created, sending 'create_list' would trigger a Primary Key Violation.
                        enqueueMutation({ type: 'update_list', payload: {
                            list_id: data.id, user_id: user.id, updates: {}, films: inputFilms, removed_film_ids: []
                        } });
                        reelToast('List saved offline. Will sync when connected.');
                        return;
                    }
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
        
        const dbUpdates: Record<string, any> = {};
        if (updates.title !== undefined) dbUpdates.title = updates.title;
        if (updates.description !== undefined) dbUpdates.description = updates.description;
        if (updates.isPrivate !== undefined) dbUpdates.is_private = updates.isPrivate;
        if (updates.isRanked !== undefined) dbUpdates.is_ranked = updates.isRanked;

        const inputFilms = (updates as { films?: { id: number; title?: string; poster_path?: string | null; poster?: string | null }[] }).films;
        
        if (prevList) {
            set((state) => ({
                lists: state.lists.map(l => l.id === listId ? { 
                    ...l, 
                    ...updates,
                    films: inputFilms !== undefined ? inputFilms.map(f => ({ id: f.id, title: f.title ?? 'Unknown', poster: f.poster_path ?? f.poster ?? null })) : l.films 
                } : l)
            }));
        }

        try {
            if (Object.keys(dbUpdates).length > 0) {
                const { error } = await supabase.from('lists').update(dbUpdates).eq('id', listId).eq('user_id', user.id);
                if (error) throw error;
            }
            
            if (inputFilms !== undefined) {
                if (inputFilms.length > 0) {
                    const items = inputFilms.map((f, idx) => ({
                        list_id: listId,
                        film_id: f.id,
                        film_title: f.title ?? 'Unknown',
                        poster_path: f.poster_path ?? f.poster ?? null,
                        position: idx,
                    })).sort((a, b) => a.film_id - b.film_id);
                    // UPSERT new/updated items first to prevent data loss if connection drops
                    const { error: itemsError } = await supabase.from('list_items').upsert(items, { onConflict: 'list_id,film_id' });
                    if (itemsError) throw itemsError;
                    
                    // Atomic Diffing pruning to prevent 414 URI Too Long & Last-Write-Wins collisions
                    if (prevList && prevList.films) {
                        const newFilmIds = new Set(inputFilms.map(f => f.id));
                        const removedIds = prevList.films.filter(f => !newFilmIds.has(f.id)).map(f => f.id);
                        for (let i = 0; i < removedIds.length; i += 100) {
                            const chunk = removedIds.slice(i, i + 100);
                            const { error: pruneError } = await supabase.from('list_items').delete().eq('list_id', listId).in('film_id', chunk);
                            if (pruneError) {
                                enqueueMutation({ type: 'update_list', payload: { list_id: listId, user_id: user.id, updates: {}, films: inputFilms, removed_film_ids: chunk } });
                                break;
                            }
                        }
                    } else {
                        // Fallback if prevList was missing
                        const keepIds = items.map(f => f.film_id);
                        await supabase.from('list_items').delete().eq('list_id', listId).not('film_id', 'in', `(${keepIds.join(',')})`);
                    }
                } else {
                    await supabase.from('list_items').delete().eq('list_id', listId);
                }
            }
            queryClient.invalidateQueries({ queryKey: ['stack', listId] });
        } catch (e: unknown) {
            if (isNetworkError(e)) {
                // Queue for offline sync
                let removedIds: number[] = [];
                if (prevList && prevList.films && inputFilms !== undefined) {
                    const newFilmIds = new Set(inputFilms.map(f => f.id));
                    removedIds = prevList.films.filter(f => !newFilmIds.has(f.id)).map(f => f.id);
                }
                enqueueMutation({ type: 'update_list', payload: { list_id: listId, user_id: user.id, updates: dbUpdates, films: inputFilms, removed_film_ids: removedIds } });
                queryClient.invalidateQueries({ queryKey: ['stack', listId] });
                reelToast('List updated offline. Will sync when connected.');
                return;
            }
            if (prevList) {
                set((state) => ({
                    lists: state.lists.map(l => {
                        if (l.id !== listId) return l;
                        // Targeted compensation: revert only the fields we tried to update
                        const reverted = { ...l };
                        if (updates.title !== undefined) reverted.title = prevList.title;
                        if (updates.description !== undefined) reverted.description = prevList.description;
                        if (updates.isPrivate !== undefined) reverted.isPrivate = prevList.isPrivate;
                        if (updates.isRanked !== undefined) reverted.isRanked = prevList.isRanked;
                        if (inputFilms !== undefined) reverted.films = prevList.films;
                        return reverted;
                    })
                }));
            }
            reelToast.error('Failed to update list — changes reverted.');
            throw e;
        }
    },

    deleteList: async (listId) => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        
        const listToRemoveIndex = get().lists.findIndex(l => l.id === listId);
        const listToRemove = listToRemoveIndex !== -1 ? get().lists[listToRemoveIndex] : null;
        
        if (listToRemoveIndex !== -1) {
            set((state) => ({ lists: state.lists.filter(l => l.id !== listId) }));
        }

        try {
            // Atomic server-side cascade via RPC.
            // Previous implementation: 4 sequential HTTP DELETEs that could partially fail.
            // New implementation: single RPC = single PostgreSQL transaction = all-or-nothing.
            // Ownership is verified via auth.uid() inside the function (not client-supplied user_id).
            const { error } = await supabase.rpc('delete_list_cascade', { p_list_id: listId });
            if (error) {
                throw error;
            }
        } catch (e: unknown) {
            if (isNetworkError(e)) {
                // Queue for offline sync
                enqueueMutation({ type: 'delete_list', payload: { list_id: listId, user_id: user.id } });
                reelToast('List removed offline. Will sync when connected.');
                return;
            }
            if (listToRemoveIndex !== -1 && listToRemove) {
                set((state) => {
                    // Re-append and chronologically sort to prevent array corruption if UI changed during network request.
                    const reverted = [...state.lists, listToRemove];
                    reverted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                    return { lists: reverted };
                });
            }
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
            queryClient.invalidateQueries({ queryKey: ['stack', listId] });
        } catch (e: unknown) {
            if (isNetworkError(e)) {
                // Queue for offline sync
                enqueueMutation({ type: 'add_film_to_list', payload: {
                    list_id: listId, film_id: film.id, film_title: newFilm.title, poster_path: newFilm.poster, position: currentList.films.length,
                } });
                queryClient.invalidateQueries({ queryKey: ['stack', listId] });
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
        
        const filmToRemoveIndex = currentList.films.findIndex(f => f.id === filmId);

        // Remove film and recompute positions
        const newFilms = currentList.films.filter((f) => f.id !== filmId);
        // Only compute positions for trailing films that mathematically shifted.
        const trailing_films = newFilms.slice(filmToRemoveIndex).map((f, idx) => ({ id: f.id, title: f.title, poster: f.poster, position: filmToRemoveIndex + idx }));

        set((state) => ({
            lists: state.lists.map((l) => l.id === listId ? { ...l, films: newFilms } : l),
        }));

        try {
            const { error } = await supabase.from('list_items').delete().eq('list_id', listId).eq('film_id', filmId);
            if (error) throw error;
            
            // Sync trailing films online to fix Position-Shift paradox
            if (trailing_films.length > 0) {
                const rows = trailing_films.map(f => ({
                    list_id: listId, film_id: f.id, film_title: f.title ?? 'Unknown', poster_path: f.poster ?? null, position: f.position
                }));
                const { error: upsertError } = await supabase.from('list_items').upsert(rows, { onConflict: 'list_id,film_id' });
                if (upsertError) {
                    // Instead of trying to re-insert the deleted film (which also requires network),
                    // queue ONLY the trailing position fix. The delete already succeeded (correct behavior),
                    // so we just need the positions fixed on next flush.
                    if (isNetworkError(upsertError)) {
                        const currentUser = useAuthStore.getState().user;
                        if (currentUser) {
                            enqueueMutation({ type: 'update_list', payload: {
                                list_id: listId, user_id: currentUser.id, updates: {},
                                films: newFilms.map((f, idx) => ({ id: f.id, title: f.title, poster_path: f.poster, position: idx })),
                                removed_film_ids: [],
                            } });
                        }
                        queryClient.invalidateQueries({ queryKey: ['stack', listId] });
                        reelToast('Positions will sync when connected.');
                        return;
                    }
                    throw upsertError;
                }
            }
            queryClient.invalidateQueries({ queryKey: ['stack', listId] });
        } catch (e: unknown) {
            if (isNetworkError(e)) {
                // Queue for offline sync
                enqueueMutation({ type: 'remove_film_from_list', payload: { list_id: listId, film_id: filmId, trailing_films } });
                queryClient.invalidateQueries({ queryKey: ['stack', listId] });
                reelToast('Film removed offline. Will sync when connected.');
                return;
            }
            set((state) => ({
                lists: state.lists.map((l) => {
                    if (l.id !== listId) return l;
                    // Targeted compensation: safely insert the removed film back at its approximate index
                    const revertedFilms = [...l.films];
                    revertedFilms.splice(filmToRemoveIndex, 0, filmToRemove);
                    return { ...l, films: revertedFilms };
                }),
            }));
            reelToast.error('Failed to remove film from stack.');
        }
    },
});
