import { StateCreator } from 'zustand';
import { supabase } from '../../lib/supabase';
import { PhysicalArchiveItem, TicketStub } from '../../types';
import { enqueueMutation } from '../../utils/offlineQueue';
import reelToast from '../../utils/reelToast';
import { isArchivistPlusTier } from '../../utils/tier';
import { useAuthStore } from '../auth';

import { isNetworkError } from '../../utils/networkError';

export interface ArchiveSlice {
    physicalArchive: PhysicalArchiveItem[];
    archiveHasMore: boolean;
    archivePage: number;
    _fetchingArchive: boolean;
    _archiveCursor: string | null;
    stubs: TicketStub[];

    fetchPhysicalArchive: (userId?: string, loadMore?: boolean) => Promise<PhysicalArchiveItem[]>;
    addToPhysicalArchive: (film: { id: number; title?: string; name?: string; poster_path?: string | null; poster?: string | null; release_date?: string }, formats: string[], notes?: string, condition?: string) => Promise<void>;
    removeFromPhysicalArchive: (filmId: number) => Promise<void>;
    updatePhysicalArchiveItem: (filmId: number, updates: Partial<PhysicalArchiveItem>) => Promise<void>;
    
    fetchStubs: () => Promise<void>;
    saveStub: (stub: Partial<TicketStub> & { showtimeId?: string, slotId?: string }) => Promise<string | null>;
}

export const createArchiveSlice: StateCreator<ArchiveSlice, [], [], ArchiveSlice> = (set, get) => ({
    physicalArchive: [],
    archiveHasMore: true,
    archivePage: 0,
    _fetchingArchive: false,
    _archiveCursor: null,
    stubs: [],

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
            
            if (error) throw error;
            
            if (data && !existingItem) {
                set(state => ({
                    physicalArchive: state.physicalArchive.map(item => 
                        item.filmId === film.id ? { ...item, id: data.id } : item
                    )
                }));
            }
         
        } catch (e: unknown) {
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
            if (error) throw error;
         
        } catch (e: unknown) {
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
            if (error) throw error;
         
        } catch (e: unknown) {
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

    fetchStubs: async () => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        const { data, error } = await supabase
            .from('tickets')
            .select('id, user_id, showtime_id, seat, ticket_type, amount, qr_code, screen_name, created_at, showtimes(film_title, date)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(500);
        if (!error && data) {
            set({
                stubs: data.map((t) => {
                    const showtime = Array.isArray(t.showtimes) ? t.showtimes[0] : t.showtimes;
                    return {
                        id: t.id ?? '',
                        filmTitle: showtime?.film_title ?? 'Unknown Film',
                        date: showtime?.date ?? '',
                        seat: t.seat ?? '—',
                        ticketType: t.ticket_type ?? 'Standard',
                        amount: t.amount ?? 0,
                        qrCode: t.qr_code ?? null,
                        screenName: t.screen_name ?? null,
                        createdAt: t.created_at ?? new Date().toISOString(),
                    };
                }),
            });
        }
    },

    saveStub: async (stub) => {
        const user = useAuthStore.getState().user;
        if (!user) return null;
        
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const isRealShowtime = stub.showtimeId && UUID_RE.test(stub.showtimeId);
        if (!isRealShowtime) return null;
        const { data, error } = await supabase.from('tickets').insert([{
            user_id: user.id,
            showtime_id: stub.showtimeId,
            slot_id: stub.slotId ?? 'default',
            seat: stub.seat ?? '—',
            ticket_type: stub.ticketType ?? 'Standard',
            amount: stub.amount ?? 0,
            qr_code: stub.qrCode ?? null,
            screen_name: stub.screenName ?? null,
        }]).select().single();
        if (error || !data) {
            reelToast.error('Failed to save ticket stub — please try again.');
            throw error ?? new Error('Ticket stub save returned no data');
        }
        return data.id;
    },
});
