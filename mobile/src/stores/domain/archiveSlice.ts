import { StateCreator } from 'zustand';
import { supabase } from '../../lib/supabase';
import { PhysicalArchiveItem, TicketStub } from '../../types';
import { enqueueMutation } from '../../utils/offlineQueue';
import reelToast from '../../utils/reelToast';
import { isArchivistPlusTier } from '../../utils/tier';
import { useAuthStore } from '../auth';
import { stillSignedIn } from './helpers/sessionGuard';

import { captureError } from '../../lib/sentry';
import { isNetworkError } from '../../utils/networkError';

/** The DATA this slice owns — see the note on `LogSliceData`. */
export interface ArchiveSliceData {
    physicalArchive: PhysicalArchiveItem[];
    archiveHasMore: boolean;
    archivePage: number;
    _fetchingArchive: boolean;
    _archiveCursor: string | null;
    stubs: TicketStub[];
}

/** A FUNCTION, never a shared constant — see `logSliceInitialState`. */
export const archiveSliceInitialState = (): ArchiveSliceData => ({
    physicalArchive: [],
    archiveHasMore: true,
    archivePage: 0,
    _fetchingArchive: false,
    _archiveCursor: null,
    stubs: [],
});

export interface ArchiveSlice extends ArchiveSliceData {
    fetchPhysicalArchive: (userId?: string, loadMore?: boolean) => Promise<PhysicalArchiveItem[]>;
    addToPhysicalArchive: (film: { id: number; title?: string; name?: string; poster_path?: string | null; poster?: string | null; release_date?: string }, formats: string[], notes?: string, condition?: string) => Promise<void>;
    removeFromPhysicalArchive: (filmId: number) => Promise<void>;
    updatePhysicalArchiveItem: (filmId: number, updates: Partial<PhysicalArchiveItem>) => Promise<void>;
    
    fetchStubs: () => Promise<void>;
    saveStub: (stub: Partial<TicketStub> & { showtimeId?: string, slotId?: string }) => Promise<string | null>;
}

export const createArchiveSlice: StateCreator<ArchiveSlice, [], [], ArchiveSlice> = (set, get) => ({
    ...archiveSliceInitialState(),

    fetchPhysicalArchive: async (userId?: string, loadMore = false) => {
        const uid = userId ?? useAuthStore.getState().user?.id;
        const user = useAuthStore.getState().user;
        if (!uid || !isArchivistPlusTier(user)) return [];
        const state = get();
        if (loadMore && !state.archiveHasMore) return state.physicalArchive;
        if (state._fetchingArchive) return state.physicalArchive;

        set({ _fetchingArchive: true });
        try {
            const PAGE_SIZE = 50;

            let query = supabase
                .from('physical_archive').select('id, user_id, film_id, film_title, poster_path, year, formats, notes, condition, created_at').eq('user_id', uid)
                .order('created_at', { ascending: false })
                .order('id', { ascending: false })
                .limit(PAGE_SIZE);

            // Cursor-based keyset pagination
            const cursor = loadMore ? state._archiveCursor : null;
            if (cursor) {
                const [cursorDate, cursorId] = cursor.split('|');
                if (cursorDate && cursorId) {
                    query = query.or(`created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},id.lt.${cursorId})`);
                }
            }

            const { data, error } = await query;
            // Guarded on the SIGNED-IN member, not on `uid`. `uid` is who the
            // fetch was for — which may be another member's public archive — so
            // comparing it to the session would make this op bail every time
            // someone viewed a profile that was not their own.
            if (!stillSignedIn(user?.id)) return get().physicalArchive;
            if (!error && data) {
                const items = data.map((item) => ({
                    id: item.id,
                    filmId: item.film_id,
                    title: item.film_title,
                    poster: item.poster_path ?? null,
                    poster_path: item.poster_path ?? null,
                    year: item.year ?? null,
                    formats: item.formats ?? [],
                    notes: item.notes ?? '',
                    condition: item.condition ?? 'good',
                    createdAt: item.created_at,
                }));
                const hasMore = data.length === PAGE_SIZE;

                // Compute next cursor from last row
                const lastRow = data.length > 0 ? data[data.length - 1] : null;
                const nextCursor = hasMore && lastRow ? `${lastRow.created_at}|${lastRow.id}` : null;

                if (!userId || userId === useAuthStore.getState().user?.id) {
                    set((prev) => ({ 
                        physicalArchive: loadMore ? [...prev.physicalArchive, ...items] : items,
                        archiveHasMore: hasMore,
                        archivePage: (loadMore ? prev.archivePage : 0) + 1,
                        _archiveCursor: nextCursor,
                    }));
                }
                return items;
            }
            return get().physicalArchive;
        } finally {
            set({ _fetchingArchive: false });
        }
    },

    addToPhysicalArchive: async (film, formats, notes = '', condition = 'good') => {
        const user = useAuthStore.getState().user;
        if (!user || !isArchivistPlusTier(user)) return;

        const existingItem = get().physicalArchive.find(item => item.filmId === film.id);
        const newFormats = existingItem ? Array.from(new Set([...existingItem.formats, ...formats])) : formats;
        
        const newItem: PhysicalArchiveItem = {
            id: String(existingItem ? existingItem.id : `-${Date.now()}`),
            filmId: film.id,
            title: film.title ?? film.name ?? 'Unknown',
            poster: film.poster_path ?? film.poster ?? null,
            poster_path: film.poster_path ?? film.poster ?? null,
            year: film.release_date ? parseInt(film.release_date.slice(0, 4)) : undefined,
            formats: newFormats,
            notes,
            condition,
            createdAt: existingItem ? existingItem.createdAt : new Date().toISOString(),
        };

        set((state) => {
            const filtered = state.physicalArchive.filter(i => i.filmId !== film.id);
            return { physicalArchive: [newItem, ...filtered] };
        });

        try {
            const { data, error } = await supabase.from('physical_archive').upsert([{
                user_id: user.id,
                film_id: film.id,
                film_title: film.title ?? film.name ?? 'Unknown',
                poster_path: film.poster_path ?? film.poster ?? null,
                year: film.release_date ? parseInt(film.release_date.slice(0, 4)) : null,
                formats: newFormats,
                notes,
                condition,
            }], { onConflict: 'user_id, film_id' }).select().single();

            // Left mid-write — see sessionGuard. The row is saved server-side
            // either way; the writes below would put it in the next member's store.
            if (!stillSignedIn(user.id)) return;
            
            if (error) throw error;
            
            if (data && !existingItem) {
                set(state => ({
                    physicalArchive: state.physicalArchive.map(item => 
                        item.filmId === film.id ? { ...item, id: data.id } : item
                    )
                }));
            }
         
        } catch (e: unknown) {
            if (!isNetworkError(e)) captureError(e, { scope: 'archiveSlice.addToPhysicalArchive' });
            if (isNetworkError(e)) {
                // Queue for offline sync
                enqueueMutation({ type: 'add_archive', payload: {
                    user_id: user.id, film_id: film.id,
                    film_title: film.title ?? film.name ?? 'Unknown',
                    poster_path: film.poster_path ?? film.poster ?? null,
                    year: film.release_date ? parseInt(film.release_date.slice(0, 4)) : null,
                    formats: newFormats, notes, condition,
                } });
                reelToast('Archive saved offline. Will sync when connected.');
                return;
            }
            set((state) => {
                const filtered = state.physicalArchive.filter(i => i.filmId !== film.id);
                return { 
                    physicalArchive: existingItem ? [existingItem, ...filtered] : filtered 
                };
            });
            reelToast.error('Failed to update physical archive.');
        }
    },

    removeFromPhysicalArchive: async (filmId) => {
        const user = useAuthStore.getState().user;
        if (!user || !isArchivistPlusTier(user)) return;

        const itemToRemove = get().physicalArchive.find((item) => item.filmId === filmId);
        if (!itemToRemove) return;

        // Use unique record id for optimistic removal (not filmId which could match multiple)
        const removeId = itemToRemove.id;
        set((state) => ({
            physicalArchive: state.physicalArchive.filter((item) => item.id !== removeId)
        }));

        try {
            const { error } = await supabase.from('physical_archive').delete().eq('user_id', user.id).eq('film_id', filmId);
            if (!stillSignedIn(user.id)) return;
            if (error) throw error;
         
        } catch (e: unknown) {
            if (!isNetworkError(e)) captureError(e, { scope: 'archiveSlice.removeFromPhysicalArchive' });
            if (isNetworkError(e)) {
                // Queue for offline sync
                enqueueMutation({ type: 'remove_archive', payload: { user_id: user.id, film_id: filmId } });
                reelToast('Removed offline. Will sync when connected.');
                return;
            }
            set((state) => ({
                physicalArchive: [itemToRemove, ...state.physicalArchive]
            }));
            reelToast.error('Failed to remove from physical archive.');
        }
    },

    updatePhysicalArchiveItem: async (filmId: number, updates: Partial<PhysicalArchiveItem>) => {
        const user = useAuthStore.getState().user;
        if (!user || !isArchivistPlusTier(user)) return;
        
        const prevItem = get().physicalArchive.find(a => a.filmId === filmId);
        
        set((state) => ({ physicalArchive: state.physicalArchive.map(a => a.filmId === filmId ? { ...a, ...updates } : a) }));
        
        try {
            const dbUpdates: Record<string, any> = {};
            if (updates.formats) dbUpdates.formats = updates.formats;
            if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
            if (updates.condition !== undefined) dbUpdates.condition = updates.condition;
            const { error } = await supabase.from('physical_archive').update(dbUpdates).eq('user_id', user.id).eq('film_id', filmId);
            if (!stillSignedIn(user.id)) return;
            if (error) throw error;
         
        } catch (e: unknown) {
            if (!isNetworkError(e)) captureError(e, { scope: 'archiveSlice.updatePhysicalArchiveItem' });
            if (isNetworkError(e)) {
                // Queue for offline sync
                const dbUpdates: Record<string, any> = {};
                if (updates.formats) dbUpdates.formats = updates.formats;
                if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
                if (updates.condition !== undefined) dbUpdates.condition = updates.condition;
                enqueueMutation({ type: 'update_archive', payload: { user_id: user.id, film_id: filmId, updates: dbUpdates } });
                reelToast('Archive updated offline. Will sync when connected.');
                return;
            }
            if (prevItem) {
                set((state) => ({ physicalArchive: state.physicalArchive.map(a => a.filmId === filmId ? prevItem : a) }));
            }
            reelToast.error('Failed to update physical archive.');
        }
    },

    // fetchStubs and saveStub were removed with batch 31. They read and wrote
    // `tickets` and `showtimes`, two tables from an abandoned cinema-booking
    // feature that has now been dropped. Neither had a single call site in the
    // app or in the shipped TestFlight build — verified across the whole history
    // — so they were unreachable code pointing at tables that no longer exist.
    //
    // `stubs` stays on the slice as an empty array so nothing reading it breaks;
    // removing the field is a UI decision, not cleanup.
    fetchStubs: async () => { /* removed with batch 31 — `tickets` no longer exists */ },
    saveStub: async () => null,
});
