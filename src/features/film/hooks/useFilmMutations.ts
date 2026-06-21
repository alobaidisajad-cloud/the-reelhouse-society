import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../supabaseClient';
import { useAuthStore } from '../../../stores/auth';
import { useFilmStore } from '../../../stores/films';
import reelToast from '../../../utils/reelToast';
import { enqueueMutation } from '../../../utils/offlineQueue';
import { FilmLog } from '../../../types';

interface TMDBFilmInput {
    id: number;
    title?: string;
    name?: string;
    poster_path?: string | null;
    release_date?: string;
}

/**
 * Aggregate accessor used by consumers that destructure the individual mutation
 * hooks (LogForm, FilmHero, DiscoverPage). Returns the hook functions; callers
 * invoke them at the top level of their component (function declarations above
 * are hoisted, so order here is irrelevant).
 */
export function useFilmMutations() {
    return {
        useAddToWatchlist,
        useAddLog,
        useUpdateLog,
        useRemoveLog,
        useRemoveFromWatchlist,
        useMarkAsWatched,
        useUnmarkWatched,
    };
}

export function useAddToWatchlist() {
    return useMutation({
        networkMode: 'offlineFirst',
        mutationFn: async (film: TMDBFilmInput) => {
            const user = useAuthStore.getState().user;
            if (!user) throw new Error("Not logged in");

            const payload = {
                user_id: user.id,
                film_id: film.id,
                film_title: film.title || film.name || 'Unknown',
                poster_path: film.poster_path || null,
                year: film.release_date ? new Date(film.release_date).getFullYear() : null,
            };

            const { error } = await supabase.from('watchlists').insert([payload]);
            if (error) {
                if (error.message?.toLowerCase().includes('fetch') || error.message?.toLowerCase().includes('network')) {
                    await enqueueMutation({ type: 'add_watchlist', payload });
                    return film;
                }
                throw error;
            }
            return film;
        },
        onMutate: async (film) => {
            const store = useFilmStore.getState();
            const exists = store.watchlist.find((f) => f.id === film.id);
            if (!exists) {
                useFilmStore.setState(state => ({
                    watchlist: [...state.watchlist, { 
                        id: film.id, 
                        title: film.title || film.name || 'Unknown', 
                        poster_path: film.poster_path || null, 
                        year: film.release_date ? new Date(film.release_date).getFullYear() : undefined 
                    }],
                    _watchlistIndex: { ...state._watchlistIndex, [film.id]: true }
                }));
            }
            return { exists };
        },
        onError: (err, film, context) => {
            if (!context?.exists) {
                useFilmStore.setState(state => {
                    const nextIdx = { ...state._watchlistIndex };
                    delete nextIdx[film.id];
                    return {
                        watchlist: state.watchlist.filter(w => w.id !== film.id),
                        _watchlistIndex: nextIdx
                    };
                });
            }
            reelToast.error('Failed to add to watchlist. Please try again.');
        },
        onSuccess: () => {
            reelToast.success('Added to watchlist');
        }
    });
}

export function useAddLog() {
    const queryClient = useQueryClient();
    return useMutation({
        networkMode: 'offlineFirst',
        mutationFn: async (log: Partial<FilmLog>) => {
            const user = useAuthStore.getState().user;
            if (!user) throw new Error("Not logged in");

            // We perform the same logic as films.ts addLog
            let existingLog = log.filmId ? useFilmStore.getState()._loggedIndex[log.filmId] : undefined;
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
                const oldHistory = existingLog.viewingHistory || [];
                const archivedEntry = {
                    date: existingLog.watchedDate || existingLog.createdAt || new Date().toISOString(),
                    rating: existingLog.rating,
                    review: existingLog.review || '',
                    watchedWith: existingLog.watchedWith || null,
                };
                const newHistory = [archivedEntry, ...oldHistory];
                const newViewCount = (existingLog.viewCount || 1) + 1;

                const updates = {
                    rating: log.rating || 0,
                    review: log.review || '',
                    status: 'rewatched',
                    watched_date: log.watchedDate || new Date().toISOString(),
                    watched_with: log.watchedWith || null,
                    is_spoiler: log.isSpoiler || false,
                    private_notes: log.privateNotes || null,
                    physical_media: log.physicalMedia || null,
                    view_count: newViewCount,
                    viewing_history: JSON.stringify(newHistory),
                };

                const { error } = await supabase.from('logs').update(updates).eq('id', existingLog.id);
                if (error) {
                    if (error.message?.toLowerCase().includes('fetch') || error.message?.toLowerCase().includes('network')) {
                        // Offline queueing not fully supported for complex rewatch updates yet
                        throw new Error("Offline rewatch not supported");
                    }
                    throw error;
                }
                
                return { isRewatch: true, existingLog, updates: { ...updates, viewingHistory: newHistory } };
            }

            // First watch
            const payload = {
                user_id: user.id,
                film_id: log.filmId, film_title: log.title,
                poster_path: log.poster || null, year: log.year || null,
                rating: log.rating || 0, review: log.review || '',
                status: log.status || 'watched', is_spoiler: log.isSpoiler || false,
                watched_date: log.watchedDate || new Date().toISOString(),
                watched_with: log.watchedWith || null,
                private_notes: log.privateNotes || null,
                abandoned_reason: log.abandonedReason || null,
                physical_media: log.physicalMedia || null,
                is_autopsied: log.isAutopsied || false, autopsy: log.autopsy || null,
                alt_poster: log.altPoster || null, editorial_header: log.editorialHeader || null,
                drop_cap: log.dropCap || false, pull_quote: log.pullQuote || '',
                video_url: log.videoUrl || null,
                format: log.physicalMedia || 'Digital',
                view_count: 1,
                viewing_history: '[]',
            };

            const { data, error } = await supabase.from('logs').insert([payload]).select().single();
            if (error) {
                if (error.message?.toLowerCase().includes('fetch') || error.message?.toLowerCase().includes('network')) {
                    await enqueueMutation({ type: 'add_log', payload });
                    return { isRewatch: false, log: { ...payload, id: `offline-${Date.now()}`, created_at: new Date().toISOString() } };
                }
                throw error;
            }

            return { isRewatch: false, log: data };
        },
        onSuccess: (data, logInput) => {
            if (data.isRewatch && data.existingLog) {
                const store = useFilmStore.getState();
                const mappedUpdates = {
                    rating: data.updates.rating,
                    review: data.updates.review,
                    status: data.updates.status,
                    watchedDate: data.updates.watched_date,
                    watchedWith: data.updates.watched_with,
                    isSpoiler: data.updates.is_spoiler,
                    privateNotes: data.updates.private_notes,
                    physicalMedia: data.updates.physical_media,
                    viewCount: data.updates.view_count,
                    viewingHistory: data.updates.viewingHistory,
                } as Partial<FilmLog>;
                
                let filmIdToUpdate: number | undefined;
                const nextLogs = store.logs.map((l) => {
                    if (l.id === data.existingLog!.id) {
                        filmIdToUpdate = l.filmId;
                        return { ...l, ...mappedUpdates } as FilmLog;
                    }
                    return l;
                });
                const nextIdx = { ...store._loggedIndex };
                if (filmIdToUpdate) {
                    const updated = nextLogs.find(l => l.filmId === filmIdToUpdate);
                    if (updated) nextIdx[filmIdToUpdate] = updated as FilmLog;
                }
                useFilmStore.setState({ logs: nextLogs, _loggedIndex: nextIdx });

            } else if (!data.isRewatch && data.log) {
                const fullLog = { 
                    ...logInput, 
                    id: data.log.id, 
                    createdAt: data.log.created_at, 
                    viewCount: 1, 
                    viewingHistory: [] 
                } as FilmLog;
                
                useFilmStore.setState((state) => {
                    const nextIdx = { ...state._loggedIndex };
                    if (logInput.filmId) nextIdx[logInput.filmId] = fullLog;
                    return { logs: [fullLog, ...state.logs], _loggedIndex: nextIdx };
                });
            }

            // Sync to physical archive
            const syncFormatMap: Record<string, string> = { 'DVD': 'dvd', 'Blu-Ray': 'bluray', '4K UHD': '4k', 'VHS': 'vhs' };
            if (logInput.physicalMedia && syncFormatMap[logInput.physicalMedia] && logInput.filmId !== undefined) {
                const fmt = syncFormatMap[logInput.physicalMedia];
                useFilmStore.getState().addToPhysicalArchive({ id: logInput.filmId, title: logInput.title || '', poster_path: logInput.poster, release_date: logInput.year?.toString() }, [fmt]).catch(e => console.error(e));
            }

            reelToast.success('Film logged to your diary');
        },
        onError: () => {
            reelToast.error('Failed to log film. Please try again.');
        }
    });
}

export function useUpdateLog() {
    const queryClient = useQueryClient();
    return useMutation({
        networkMode: 'offlineFirst',
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<FilmLog> }) => {
            const user = useAuthStore.getState().user;
            if (!user) throw new Error("Not logged in");

            const dbUpdates: any = {};
            if (updates.rating !== undefined) dbUpdates.rating = updates.rating;
            if (updates.review !== undefined) dbUpdates.review = updates.review;
            if (updates.status !== undefined) dbUpdates.status = updates.status;
            if (updates.isSpoiler !== undefined) dbUpdates.is_spoiler = updates.isSpoiler;
            if (updates.watchedDate !== undefined) dbUpdates.watched_date = updates.watchedDate;
            if (updates.watchedWith !== undefined) dbUpdates.watched_with = updates.watchedWith;
            if (updates.abandonedReason !== undefined) dbUpdates.abandoned_reason = updates.abandonedReason;
            if (updates.privateNotes !== undefined) dbUpdates.private_notes = updates.privateNotes;
            if (updates.physicalMedia !== undefined) dbUpdates.physical_media = updates.physicalMedia;
            if (updates.isAutopsied !== undefined) dbUpdates.is_autopsied = updates.isAutopsied;
            if (updates.autopsy !== undefined) dbUpdates.autopsy = updates.autopsy;
            if (updates.altPoster !== undefined) dbUpdates.alt_poster = updates.altPoster;
            if (updates.editorialHeader !== undefined) dbUpdates.editorial_header = updates.editorialHeader;
            if (updates.dropCap !== undefined) dbUpdates.drop_cap = updates.dropCap;
            if (updates.pullQuote !== undefined) dbUpdates.pull_quote = updates.pullQuote;
            if (updates.videoUrl !== undefined) dbUpdates.video_url = updates.videoUrl;

            const { error } = await supabase.from('logs').update(dbUpdates).eq('id', id);
            if (error) {
                if (error.message?.toLowerCase().includes('fetch') || error.message?.toLowerCase().includes('network')) {
                    await enqueueMutation({ type: 'update_log', payload: { id, updates: dbUpdates } });
                    return { id, updates };
                }
                throw error;
            }
            return { id, updates };
        },
        onSuccess: (data) => {
            const store = useFilmStore.getState();
            let filmIdToUpdate: number | undefined;
            const nextLogs = store.logs.map((l) => {
                if (l.id === data.id) {
                    filmIdToUpdate = l.filmId;
                    return { ...l, ...data.updates } as FilmLog;
                }
                return l;
            });
            const nextIdx = { ...store._loggedIndex };
            if (filmIdToUpdate) {
                const updated = nextLogs.find(l => l.filmId === filmIdToUpdate);
                if (updated) nextIdx[filmIdToUpdate] = updated as FilmLog;
            }
            useFilmStore.setState({ logs: nextLogs, _loggedIndex: nextIdx });

            const user = useAuthStore.getState().user;
            if (user) {
                queryClient.invalidateQueries({ queryKey: ['user-profile-logs', user.id] });
            }
        }
    });
}

export function useRemoveLog() {
    const queryClient = useQueryClient();
    return useMutation({
        networkMode: 'offlineFirst',
        mutationFn: async (id: string) => {
            const user = useAuthStore.getState().user;
            if (!user) throw new Error("Not logged in");

            const { error } = await supabase.from('logs').delete().eq('id', id);
            if (error) {
                if (error.message?.toLowerCase().includes('fetch') || error.message?.toLowerCase().includes('network')) {
                    await enqueueMutation({ type: 'delete_log', payload: { id } });
                    return id;
                }
                throw error;
            }
            return id;
        },
        onSuccess: (id) => {
            useFilmStore.setState((state) => {
                const log = state.logs.find(l => l.id === id);
                const nextLogs = state.logs.filter((l) => l.id !== id);
                const nextIdx = { ...state._loggedIndex };
                if (log?.filmId) delete nextIdx[log.filmId];
                return { logs: nextLogs, _loggedIndex: nextIdx };
            });

            const user = useAuthStore.getState().user;
            if (user) {
                queryClient.invalidateQueries({ queryKey: ['user-profile-logs', user.id] });
            }
        }
    });
}

export function useRemoveFromWatchlist() {
    const queryClient = useQueryClient();
    return useMutation({
        networkMode: 'offlineFirst',
        mutationFn: async (filmId: number) => {
            const user = useAuthStore.getState().user;
            if (!user) throw new Error("Not logged in");

            const { error } = await supabase.from('watchlists').delete().eq('user_id', user.id).eq('film_id', filmId);
            if (error) {
                if (error.message?.toLowerCase().includes('fetch') || error.message?.toLowerCase().includes('network')) {
                    await enqueueMutation({ type: 'remove_watchlist', payload: { film_id: filmId } });
                    return filmId;
                }
                throw error;
            }
            return filmId;
        },
        onMutate: async (filmId) => {
            const store = useFilmStore.getState();
            const exists = store.watchlist.find((f) => f.id === filmId);
            if (exists) {
                useFilmStore.setState(state => {
                    const nextIdx = { ...state._watchlistIndex };
                    delete nextIdx[filmId];
                    return {
                        watchlist: state.watchlist.filter(w => w.id !== filmId),
                        _watchlistIndex: nextIdx
                    };
                });
            }
            return { exists };
        },
        onError: (err, filmId, context) => {
            if (context?.exists) {
                useFilmStore.setState(state => ({
                    watchlist: [...state.watchlist, context.exists!],
                    _watchlistIndex: { ...state._watchlistIndex, [filmId]: true }
                }));
            }
            
            const user = useAuthStore.getState().user;
            if (user) {
                queryClient.invalidateQueries({ queryKey: ['user-profile-logs', user.id] });
            }
        }
    });
}

export function useMarkAsWatched() {
    const queryClient = useQueryClient();
    return useMutation({
        networkMode: 'offlineFirst',
        mutationFn: async (film: TMDBFilmInput) => {
            const user = useAuthStore.getState().user;
            if (!user) throw new Error("Not logged in");

            const payload = {
                user_id: user.id,
                film_id: film.id,
                film_title: film.title || film.name || 'Unknown',
                poster_path: film.poster_path || null,
                year: film.release_date ? new Date(film.release_date).getFullYear() : null,
                rating: 0,
                status: 'watched',
                watched_date: new Date().toISOString(),
                view_count: 1,
                viewing_history: '[]'
            };

            const { data, error } = await supabase.from('logs').insert([payload]).select().single();
            if (error) {
                if (error.message?.toLowerCase().includes('fetch') || error.message?.toLowerCase().includes('network')) {
                    await enqueueMutation({ type: 'add_log', payload });
                    return { ...payload, id: `offline-${Date.now()}`, created_at: new Date().toISOString() };
                }
                throw error;
            }
            return data;
        },
        onSuccess: (data, film) => {
            const fullLog = { 
                id: data.id, 
                filmId: film.id,
                title: film.title || film.name || 'Unknown',
                poster: film.poster_path || null,
                year: film.release_date ? new Date(film.release_date).getFullYear().toString() : undefined,
                rating: 0,
                status: 'watched',
                createdAt: data.created_at, 
                viewCount: 1, 
                viewingHistory: [] 
            } as FilmLog;
            
            useFilmStore.setState((state) => {
                const nextIdx = { ...state._loggedIndex };
                nextIdx[film.id] = fullLog;
                return { logs: [fullLog, ...state.logs], _loggedIndex: nextIdx };
            });
            reelToast.success('Marked as watched');

            const user = useAuthStore.getState().user;
            if (user) {
                queryClient.invalidateQueries({ queryKey: ['user-profile-logs', user.id] });
            }
        }
    });
}

export function useUnmarkWatched() {
    const queryClient = useQueryClient();
    return useMutation({
        networkMode: 'offlineFirst',
        mutationFn: async (filmId: number) => {
            const store = useFilmStore.getState();
            const log = store._loggedIndex[filmId];
            if (!log) throw new Error("Log not found");

            const user = useAuthStore.getState().user;
            if (!user) throw new Error("Not logged in");

            const { error } = await supabase.from('logs').delete().eq('id', log.id);
            if (error) {
                if (error.message?.toLowerCase().includes('fetch') || error.message?.toLowerCase().includes('network')) {
                    await enqueueMutation({ type: 'delete_log', payload: { id: log.id } });
                    return log.id;
                }
                throw error;
            }
            return log.id;
        },
        onSuccess: (id) => {
            useFilmStore.setState((state) => {
                const log = state.logs.find(l => l.id === id);
                const nextLogs = state.logs.filter((l) => l.id !== id);
                const nextIdx = { ...state._loggedIndex };
                if (log?.filmId) delete nextIdx[log.filmId];
                return { logs: nextLogs, _loggedIndex: nextIdx };
            });
            reelToast.success('Removed watch history');
            
            const user = useAuthStore.getState().user;
            if (user) {
                queryClient.invalidateQueries({ queryKey: ['user-profile-logs', user.id] });
            }
        }
    });
}
