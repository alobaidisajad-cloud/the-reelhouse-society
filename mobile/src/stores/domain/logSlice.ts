import { StateCreator } from 'zustand';
import { queryClient } from '../../lib/queryClient';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../auth';
import { FilmState } from '../films';
import reelToast from '../../utils/reelToast';
import { enqueueMutation } from '../../utils/offlineQueue';
import { isNetworkError } from '../../utils/networkError';
import { colors } from '../../theme/theme';
import { FilmLog } from '../../types';
import { Image } from 'expo-image';

// L-03 AUDIT FIX: Extracted duplicated format-mapping IIFE into shared utility
const FORMAT_MAP: Record<string, string> = { 'DVD': 'dvd', 'Blu-Ray': 'bluray', '4K UHD': '4k', 'VHS': 'vhs', 'Film Print': 'filmprint' };
const resolveFormat = (physicalMedia?: string | null): string => FORMAT_MAP[physicalMedia ?? ''] ?? 'digital';

export interface LogSlice {
    logs: FilmLog[];
    logsHasMore: boolean;
    logsPage: number;
    _loggedIndex: Record<number, FilmLog>;
    _fetchingLogs: boolean;
    _addLogMutex: boolean;

    fetchLogs: (loadMore?: boolean) => Promise<void>;
    addLog: (log: Partial<FilmLog>) => Promise<void>;
    updateLog: (id: string, updates: Partial<FilmLog>) => Promise<void>;
    removeLog: (id: string) => Promise<void>;
    markAsWatched: (film: { id: number; title?: string; name?: string; poster_path?: string | null; release_date?: string }, status?: 'watched' | 'rewatched' | 'abandoned') => Promise<void>;
    unmarkWatched: (filmId: number) => Promise<void>;
    getCinephileStats: (overrideCount?: number) => { count: number, level: string, color: string, progress: number };
}

export const createLogSlice: StateCreator<FilmState, [], [], LogSlice> = (set, get) => ({
    logs: [],
    logsHasMore: true,
    logsPage: 0,
    _loggedIndex: {},
    _fetchingLogs: false,
    _addLogMutex: false,

    fetchLogs: async (loadMore = false) => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        const state = get();
        if (state._fetchingLogs) return;
        if (loadMore && !state.logsHasMore) return;
        set({ _fetchingLogs: true });

        const PAGE_SIZE = 50;
        const page = loadMore ? state.logsPage : 0;

        const { data, error } = await supabase
            .from('logs').select('id, user_id, film_id, film_title, poster_path, year, rating, review, status, watched_date, is_spoiler, watched_with, private_notes, abandoned_reason, physical_media, is_autopsied, autopsy, alt_poster, editorial_header, drop_cap, pull_quote, video_url, format, created_at, view_count, viewing_history').eq('user_id', user.id)
            .order('watched_date', { ascending: false })
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        
        if (error || !data) { set({ _fetchingLogs: false }); return; }
        
        const hasMore = data.length === PAGE_SIZE;

        const newLogs = data.map((dbLog) => ({
                id: dbLog.id,
                filmId: dbLog.film_id,
                title: dbLog.film_title,
                poster: dbLog.poster_path ?? null,
                year: dbLog.year ?? null,
                rating: dbLog.rating,
                review: dbLog.review,
                status: dbLog.status ?? 'watched',
                isSpoiler: dbLog.is_spoiler ?? false,
                watchedDate: dbLog.watched_date,
                watchedWith: dbLog.watched_with ?? null,
                privateNotes: dbLog.private_notes ?? null,
                abandonedReason: dbLog.abandoned_reason ?? null,
                physicalMedia: dbLog.physical_media ?? null,
                isAutopsied: dbLog.is_autopsied ?? false,
                autopsy: dbLog.autopsy ?? null,
                altPoster: dbLog.alt_poster ?? null,
                editorialHeader: dbLog.editorial_header ?? null,
                dropCap: dbLog.drop_cap ?? false,
                pullQuote: dbLog.pull_quote ?? '',
                videoUrl: dbLog.video_url ?? null,
                createdAt: dbLog.created_at,
                viewCount: dbLog.view_count ?? 1,
                viewingHistory: dbLog.viewing_history ?? [],
        }));

        const nextLogs = loadMore ? [...state.logs, ...newLogs] : newLogs;
        const cappedLogs = nextLogs.slice(0, 500);
        const idx: Record<number, FilmLog> = {};
        cappedLogs.forEach(l => { if (l.filmId && !idx[l.filmId]) idx[l.filmId] = l as FilmLog; });

        set({ 
            logs: cappedLogs as FilmLog[], 
            _loggedIndex: idx,
            logsPage: page + 1,
            logsHasMore: hasMore,
            _fetchingLogs: false,
        });

        // Background Image Prefetching (Cache Warming) — only prefetch NEW entries
        const newEntries = loadMore ? newLogs : cappedLogs;
        const posterUrls = newEntries
            .filter(l => l.poster)
            .map(l => `https://image.tmdb.org/t/p/w500${l.poster}`);
        if (posterUrls.length > 0) {
            Image.prefetch(posterUrls, 'disk').catch(() => {});
        }
    },

    addLog: async (log) => {
        const user = useAuthStore.getState().user;
        if (!user) return;

        if (get()._addLogMutex) return;
        set({ _addLogMutex: true });

        try {
            let existingLog = log.filmId ? get()._loggedIndex[log.filmId] : undefined;
            if (!existingLog && log.filmId) {
                const { data: serverCheck } = await supabase.from('logs')
                    .select('id, rating, review, watched_date, watched_with, view_count, viewing_history, created_at, status')
                    .eq('user_id', user.id).eq('film_id', log.filmId).maybeSingle();
                if (serverCheck) {
                    existingLog = {
                        id: serverCheck.id, filmId: log.filmId, rating: serverCheck.rating, review: serverCheck.review, 
                        watchedDate: serverCheck.watched_date, watchedWith: serverCheck.watched_with, 
                        viewCount: serverCheck.view_count, viewingHistory: serverCheck.viewing_history,
                        createdAt: serverCheck.created_at, status: serverCheck.status
                    } as FilmLog;
                }
            }

            if (existingLog) {
                const oldHistory = (Array.isArray(existingLog.viewingHistory) ? existingLog.viewingHistory : []) as { date?: string; rating: number; review?: string; watchedWith?: string | null }[];
                const archivedEntry = {
                    date: existingLog.watchedDate ?? existingLog.createdAt ?? new Date().toISOString(),
                    rating: existingLog.rating,
                    review: existingLog.review ?? '',
                    watchedWith: existingLog.watchedWith ?? null,
                };
                const newHistory = [archivedEntry, ...oldHistory];
                const newViewCount = (existingLog.viewCount ?? 1) + 1;

                await get().updateLog(existingLog.id, {
                    rating: log.rating ?? 0,
                    review: log.review ?? '',
                    status: log.status === 'abandoned' ? 'abandoned' : 'rewatched',
                    watchedDate: log.watchedDate ?? new Date().toISOString(),
                    watchedWith: log.watchedWith ?? null,
                    isSpoiler: log.isSpoiler ?? false,
                    privateNotes: log.privateNotes ?? null,
                    physicalMedia: log.physicalMedia ?? null,
                    abandonedReason: log.abandonedReason ?? null,
                    isAutopsied: log.isAutopsied ?? false,
                    autopsy: log.autopsy ?? null,
                    altPoster: log.altPoster ?? null,
                    editorialHeader: log.editorialHeader ?? null,
                    dropCap: log.dropCap ?? false,
                    pullQuote: log.pullQuote ?? '',
                    videoUrl: log.videoUrl ?? null,
                    format: resolveFormat(log.physicalMedia),
                    viewCount: newViewCount,
                    viewingHistory: newHistory,
                } as Partial<FilmLog>);

                queryClient.invalidateQueries({ queryKey: ['film', Number(existingLog.filmId)] });
                return;
            }

            const payload = {
                user_id: user.id,
                film_id: log.filmId, film_title: log.title,
                poster_path: log.poster ?? null, year: log.year ? (parseInt(String(log.year)) || null) : null,
                rating: log.rating ?? 0, review: log.review ?? '',
                status: log.status ?? 'watched', is_spoiler: log.isSpoiler ?? false,
                watched_date: log.watchedDate ?? new Date().toISOString(),
                watched_with: log.watchedWith ?? null,
                private_notes: log.privateNotes ?? null,
                abandoned_reason: log.abandonedReason ?? null,
                physical_media: log.physicalMedia ?? null,
                is_autopsied: log.isAutopsied ?? false, autopsy: log.autopsy ?? null,
                alt_poster: log.altPoster ?? null, editorial_header: log.editorialHeader ?? null,
                drop_cap: log.dropCap ?? false, pull_quote: log.pullQuote ?? '',
                video_url: log.videoUrl ?? null,
                format: resolveFormat(log.physicalMedia),
                view_count: 1,
                viewing_history: [],
            };
            const { data, error } = await supabase.from('logs').insert([payload]).select().single();

            if (error) { 
                // O-01 AUDIT FIX: Use shared network error detection
                if (isNetworkError(error)) {
                    enqueueMutation({ type: 'add_log', payload });
                    reelToast('Archived offline. Will sync when connected.');
                    const fakeId = `offline-${Date.now()}`;
                    const fullLog = { ...log, id: fakeId, createdAt: new Date().toISOString(), viewCount: 1, viewingHistory: [] } as FilmLog;
                    set((state) => ({
                        logs: [fullLog, ...state.logs],
                        _loggedIndex: (() => { const n = { ...state._loggedIndex }; if (log.filmId) n[log.filmId] = fullLog; return n; })()
                    }));
                    return;
                }
                reelToast.error('Failed to file record — please try again.'); 
                return; 
            }

            const fullLog = { ...log, id: data.id, createdAt: data.created_at, viewCount: 1, viewingHistory: [] } as FilmLog;
            set((state) => ({
                logs: [fullLog, ...state.logs],
                _loggedIndex: (() => { const n = { ...state._loggedIndex }; if (log.filmId) n[log.filmId] = fullLog; return n; })()
            }));

            // Predictive cache update for film/[id].tsx community reviews
            if (log.filmId) {
                queryClient.setQueryData(['film', Number(log.filmId)], (old: any) => {
                    if (!old) return old;
                    const newReview = {
                        id: data.id,
                        rating: log.rating ?? 0,
                        review: log.review ?? '',
                        status: log.status ?? 'watched',
                        created_at: data.created_at,
                        user_id: user.id,
                        username: user.username,
                        role: user.role,
                        isLocal: true,
                    };
                    return {
                        ...old,
                        reviews: [newReview, ...old.reviews.filter((r: any) => r.user_id !== user.id)],
                    };
                });
            }

            if (log.physicalMedia && FORMAT_MAP[log.physicalMedia] && log.filmId !== undefined) {
                const fmt = FORMAT_MAP[log.physicalMedia];
                try {
                    await get().addToPhysicalArchive({ id: log.filmId, title: log.title ?? '', poster_path: log.poster, release_date: log.year?.toString() }, [fmt]);
                } catch (e) {
                    if (__DEV__) console.error('Failed to auto-sync physical archive', e);
                }
            }
        } finally {
            set({ _addLogMutex: false });
        }
    },

    markAsWatched: async (film, status = 'watched') => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        
        let existingLog = get()._loggedIndex[film.id];
        if (!existingLog) {
            const { data: serverCheck } = await supabase.from('logs').select('id, status').eq('user_id', user.id).eq('film_id', film.id).maybeSingle();
            if (serverCheck) existingLog = { id: serverCheck.id, status: serverCheck.status } as FilmLog;
        }

        if (existingLog) {
            await get().updateLog(existingLog.id, { status } as Partial<FilmLog>);
            return;
        }
        const payload = {
            user_id: user.id,
            film_id: film.id,
            film_title: film.title ?? film.name ?? 'Untitled',
            poster_path: film.poster_path ?? null,
            year: film.release_date ? (parseInt(film.release_date.slice(0, 4)) || null) : null,
            rating: 0,
            review: '',
            status,
            watched_date: new Date().toISOString(),
            is_spoiler: false,
            view_count: 1,
            viewing_history: [],
        };
        const { data, error } = await supabase.from('logs').insert([payload]).select().single();
        
        let newLogId = `offline-${Date.now()}`;
        let createdAt = new Date().toISOString();

        if (error) { 
            // O-01 AUDIT FIX: Use shared network error detection
            if (isNetworkError(error)) {
                enqueueMutation({ type: 'mark_watched', payload });
                reelToast('Marked watched offline. Will sync when connected.');
            } else {
                reelToast.error('Failed to mark as watched — please try again.'); 
                return; 
            }
        } else {
            newLogId = data.id;
            createdAt = data.created_at;
        }

        const newLog: FilmLog = {
            id: newLogId,
            filmId: film.id,
            title: film.title ?? film.name ?? 'Untitled',
            poster: film.poster_path,
            year: film.release_date ? (parseInt(film.release_date.slice(0, 4)) || undefined) : undefined,
            rating: 0,
            status,
            createdAt,
            watchedDate: new Date().toISOString(),
            viewCount: 1,
            viewingHistory: [],
        };
        set(state => {
            const nextIdx = { ...state._loggedIndex };
            nextIdx[film.id] = newLog;
            return { logs: [newLog, ...state.logs], _loggedIndex: nextIdx };
        });
        const inWatchlist = get().watchlist.some(w => w.id === film.id);
        if (inWatchlist) get().removeFromWatchlist(film.id);
        
        queryClient.invalidateQueries({ queryKey: ['film', Number(film.id)] });
    },

    unmarkWatched: async (filmId) => {
        const existingLog = get().logs.find(l => l.filmId === filmId);
        if (!existingLog) return;
        if (existingLog.rating > 0 || (existingLog.review && existingLog.review.length > 0)) return;
        await get().removeLog(existingLog.id);
    },

    getCinephileStats: (overrideCount?: number) => {
        const logs = get().logs;
        const count = overrideCount ?? logs.length;
        let level = 'FIRST REEL';
        let color: string = colors.fog;
        if (count >= 100) { level = 'THE ORACLE'; color = colors.sepia; }
        else if (count >= 25) { level = 'THE DEVOTEE'; color = colors.bloodReel; }
        else if (count >= 10) { level = 'THE REGULAR'; color = colors.flicker; }
        else if (count >= 1) { level = 'THE INITIATE'; color = colors.bone; }
        // Progress toward NEXT tier: Initiate=1→10, Regular=10→25, Devotee=25→100, Oracle=100+
        let progress = 0;
        if (count >= 100) progress = 100; // Oracle — fully achieved
        else if (count >= 25) progress = Math.round(((count - 25) / 75) * 100); // Devotee → Oracle
        else if (count >= 10) progress = Math.round(((count - 10) / 15) * 100); // Regular → Devotee
        else if (count >= 1) progress = Math.round(((count - 1) / 9) * 100);   // Initiate → Regular
        return { count, level, color, progress };
    },

    updateLog: async (id, updates) => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        
        const prevLogs = get().logs;
        const prevIdx = get()._loggedIndex;
        
        let filmIdToUpdate: number | undefined;
        set((state) => {
            const nextLogs = state.logs.map((l) => {
                if (l.id === id) {
                    filmIdToUpdate = l.filmId;
                    return { ...l, ...updates } as FilmLog;
                }
                return l;
            });
            const nextIdx = { ...state._loggedIndex };
            if (filmIdToUpdate) {
                const updated = nextLogs.find(l => l.filmId === filmIdToUpdate);
                if (updated) nextIdx[filmIdToUpdate] = updated as FilmLog;
            }
            return { logs: nextLogs, _loggedIndex: nextIdx };
        });

        const dbUpdates: Record<string, any> = {};
        if (updates.rating !== undefined) dbUpdates.rating = updates.rating;
        if (updates.review !== undefined) dbUpdates.review = updates.review;
        if (updates.status !== undefined) dbUpdates.status = updates.status;
        if (updates.isSpoiler !== undefined) dbUpdates.is_spoiler = updates.isSpoiler;
        if (updates.watchedDate !== undefined) dbUpdates.watched_date = updates.watchedDate;
        if (updates.watchedWith !== undefined) dbUpdates.watched_with = updates.watchedWith;
        if (updates.privateNotes !== undefined) dbUpdates.private_notes = updates.privateNotes;
        if (updates.abandonedReason !== undefined) dbUpdates.abandoned_reason = updates.abandonedReason;
        if (updates.physicalMedia !== undefined) dbUpdates.physical_media = updates.physicalMedia;
        if (updates.isAutopsied !== undefined) dbUpdates.is_autopsied = updates.isAutopsied;
        if (updates.autopsy !== undefined) dbUpdates.autopsy = updates.autopsy;
        if (updates.pullQuote !== undefined) dbUpdates.pull_quote = updates.pullQuote;
        if (updates.dropCap !== undefined) dbUpdates.drop_cap = updates.dropCap;
        if (updates.editorialHeader !== undefined) dbUpdates.editorial_header = updates.editorialHeader;
        if (updates.altPoster !== undefined) dbUpdates.alt_poster = updates.altPoster;
        if (updates.videoUrl !== undefined) dbUpdates.video_url = updates.videoUrl;
        if (updates.viewCount !== undefined) dbUpdates.view_count = updates.viewCount;
        if (updates.viewingHistory !== undefined) dbUpdates.viewing_history = updates.viewingHistory; // Raw array — Supabase handles jsonb serialization
        
        let previousFilmData: any;
        if (filmIdToUpdate) {
            const queryKey = ['film', Number(filmIdToUpdate)];
            await queryClient.cancelQueries({ queryKey });
            previousFilmData = queryClient.getQueryData(queryKey);
            queryClient.setQueryData(queryKey, (old: any) => {
                if (!old || !old.reviews) return old;
                return {
                    ...old,
                    reviews: old.reviews.map((r: any) => r.user_id === user.id ? { ...r, ...dbUpdates } : r)
                };
            });
        }

        try {
            const { error } = await supabase.from('logs').update(dbUpdates).eq('id', id);
            if (error) {
                // O-01 AUDIT FIX: Use shared network error detection
                if (isNetworkError(error)) {
                    enqueueMutation({ type: 'update_log', payload: { id, updates: dbUpdates } });
                    reelToast('Saved offline. Will sync when connected.');
                } else {
                    throw error;
                }
            }
            
            if (updates.physicalMedia && FORMAT_MAP[updates.physicalMedia]) {
                const fmt = FORMAT_MAP[updates.physicalMedia];
                const logToUpdate = get().logs.find(l => l.id === id);
                if (logToUpdate && logToUpdate.filmId !== undefined) {
                    try {
                        await get().addToPhysicalArchive({ id: logToUpdate.filmId, title: logToUpdate.title ?? '', poster_path: logToUpdate.poster, release_date: logToUpdate.year?.toString() }, [fmt]);
                    } catch (e) {
                        if (__DEV__) console.error('Failed to auto-sync physical archive on update', e);
                    }
                }
            }
        } catch (e: unknown) {
            set({ logs: prevLogs, _loggedIndex: prevIdx });
            if (filmIdToUpdate && previousFilmData !== undefined) {
                queryClient.setQueryData(['film', Number(filmIdToUpdate)], previousFilmData);
            }
            reelToast.error('Failed to update log — changes reverted.');
            throw e;
        } finally {
            if (filmIdToUpdate) {
                queryClient.invalidateQueries({ queryKey: ['film', Number(filmIdToUpdate)] });
            }
        }
    },

    removeLog: async (id) => {
        const logToRemove = get().logs.find((l) => l.id === id);
        if (!logToRemove) return;
        
        set((state) => {
            const nextIdx = { ...state._loggedIndex };
            if (logToRemove.filmId) delete nextIdx[logToRemove.filmId];
            return { logs: state.logs.filter((l) => l.id !== id), _loggedIndex: nextIdx };
        });
        
        let previousFilmData: any;
        if (logToRemove.filmId) {
            const queryKey = ['film', Number(logToRemove.filmId)];
            await queryClient.cancelQueries({ queryKey });
            previousFilmData = queryClient.getQueryData(queryKey);
            const user = useAuthStore.getState().user;
            if (user) {
                queryClient.setQueryData(queryKey, (old: any) => {
                    if (!old || !old.reviews) return old;
                    return { ...old, reviews: old.reviews.filter((r: any) => r.user_id !== user.id) };
                });
            }
        }

        try {
            const user = useAuthStore.getState().user;
            if (!user) { throw new Error('Must be authenticated to delete logs'); }
            const { error } = await supabase.from('logs').delete().eq('id', id).eq('user_id', user.id);
            if (error) {
                // O-01 AUDIT FIX: Use shared network error detection
                if (isNetworkError(error)) {
                    enqueueMutation({ type: 'remove_log', payload: { log_id: id } });
                    reelToast('Removed offline. Will sync when connected.');
                    return;
                }
                throw error;
            }
            reelToast(`"${logToRemove.title}" removed.`);
        } catch (e: unknown) {
            if (__DEV__) console.warn(`[removeLog] Failed for log ${id}:`, e);
            set((state) => {
                const nextIdx = { ...state._loggedIndex };
                if (logToRemove.filmId) nextIdx[logToRemove.filmId] = logToRemove;
                return { logs: [logToRemove, ...state.logs], _loggedIndex: nextIdx };
            });
            if (logToRemove.filmId && previousFilmData !== undefined) {
                queryClient.setQueryData(['film', Number(logToRemove.filmId)], previousFilmData);
            }
            reelToast.error('Failed to remove log.');
        } finally {
            if (logToRemove.filmId) {
                queryClient.invalidateQueries({ queryKey: ['film', Number(logToRemove.filmId)] });
            }
        }
    },
});
