import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../supabaseClient';
import { useAuthStore } from '../../../stores/auth';
import { useFilmStore } from '../../../stores/films';
import reelToast from '../../../utils/reelToast';
import { enqueueMutation } from '../../../utils/offlineQueue';
import { FilmLog } from '../../../types';
import * as Vault from '../../../services/vault';
import { useVaultStore } from '../../../stores/vault';

/** A history as the server sends it — always a list since 2026-09-18, but read defensively. */
const parseHistory = (raw: unknown): FilmLog['viewingHistory'] => {
    if (Array.isArray(raw)) return raw as FilmLog['viewingHistory'];
    if (typeof raw === 'string') { try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; } }
    return [];
};

/**
 * Write the note that came with a log. The record itself is already filed by
 * the time this runs, so a note that cannot be kept does not take the record
 * down with it — but the member is told, once, in plain words, rather than
 * finding their writing missing later.
 */
async function saveNoteQuietly(logId: string, viewingId: string, note: string): Promise<void> {
    try {
        await useVaultStore.getState().saveNote(logId, viewingId, note);
    } catch (e) {
        reelToast.error(Vault.isRankRefusal(e)
            ? 'Your record is filed. The Vault is an Archivist feature, so the note was not kept.'
            : 'Your record is filed, but the note could not be kept. Try again from the log.');
    }
}

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

/**
 * A viewing's fields, named as the server names them, from what the form sent.
 *
 * Only keys the form actually provided are included, and the server leaves every
 * other field of the viewing as it was — so a member below a rank, whose form
 * omits the ranked fields, never erases them. `private_notes`, `viewing_history`
 * and `view_count` are never among them: a note is written on its viewing, and
 * the history and its count belong to the server.
 */
export function viewingFieldsFromLog(log: Partial<FilmLog>): Record<string, unknown> {
    const f: Record<string, unknown> = {};
    const put = (col: string, v: unknown) => { if (v !== undefined) f[col] = v; };
    put('rating', log.rating);
    put('review', log.review);
    put('status', log.status);
    put('watched_date', log.watchedDate);
    put('watched_with', log.watchedWith === '' ? null : log.watchedWith);
    put('is_spoiler', log.isSpoiler);
    put('abandoned_reason', log.abandonedReason);
    put('physical_media', log.physicalMedia);
    put('is_autopsied', log.isAutopsied);
    put('autopsy', log.autopsy);
    put('alt_poster', log.altPoster);
    put('editorial_header', log.editorialHeader);
    put('drop_cap', log.dropCap);
    put('pull_quote', log.pullQuote);
    put('video_url', log.videoUrl);
    if (log.physicalMedia !== undefined) f.format = log.physicalMedia || 'Digital';
    return f;
}

/**
 * The note the form carried, if the member touched it. `undefined` means they
 * did not, and an untouched note is never written — that is what protects
 * writing the member never looked at.
 */
const touchedNote = (log: Partial<FilmLog>): string | undefined =>
    typeof log.privateNotes === 'string' ? log.privateNotes.trim() : undefined;

export function useAddLog() {
    const queryClient = useQueryClient();
    return useMutation({
        networkMode: 'offlineFirst',
        mutationFn: async (log: Partial<FilmLog>) => {
            const user = useAuthStore.getState().user;
            if (!user) throw new Error("Not logged in");

            let existingLog = log.filmId ? useFilmStore.getState()._loggedIndex[log.filmId] : undefined;
            if (!existingLog && log.filmId) {
                const { data: serverCheck } = await supabase.from('logs')
                    .select('id, viewing_id, rating, review, watched_date, watched_with, view_count, viewing_history, created_at, status')
                    .eq('user_id', user.id).eq('film_id', log.filmId).maybeSingle();

                if (serverCheck) {
                    existingLog = {
                        id: serverCheck.id, filmId: log.filmId, viewingId: serverCheck.viewing_id,
                        rating: serverCheck.rating, review: serverCheck.review,
                        watchedDate: serverCheck.watched_date, watchedWith: serverCheck.watched_with,
                        viewCount: serverCheck.view_count, viewingHistory: parseHistory(serverCheck.viewing_history),
                        createdAt: serverCheck.created_at, status: serverCheck.status
                    } as FilmLog;
                }
            }

            const note = touchedNote(log);

            if (existingLog) {
                // ── A rewatch ──
                // The SERVER archives the viewing being left — from the row it
                // holds, with its own identity, so the note written about it stays
                // with it — and moves the log on to the new one. The web used to
                // build the history here and JSON.stringify it, which is how 16
                // members' histories were shredded into single characters.
                //
                // The new viewing is named HERE, before the write, so a retried
                // call is the same rewatch and never a second one.
                const newViewingId = crypto.randomUUID();
                const fields = viewingFieldsFromLog({
                    ...log,
                    status: log.status === 'abandoned' ? 'abandoned' : 'rewatched',
                    watchedDate: log.watchedDate || new Date().toISOString().slice(0, 10),
                });

                let queuedOffline = false;
                try {
                    await Vault.addViewing(existingLog.id, newViewingId, fields);
                } catch (e) {
                    if (!Vault.isNetworkError(e)) throw e;
                    await enqueueMutation({ type: 'add_viewing', payload: { log_id: existingLog.id, viewing_id: newViewingId, fields } });
                    queuedOffline = true;
                }
                // The note belongs to the viewing that has just begun. Queued in
                // order behind the rewatch when offline — a note needs a viewing.
                if (note) await saveNoteQuietly(existingLog.id, newViewingId, note);

                return { isRewatch: true as const, existingLog, newViewingId, fields, queuedOffline };
            }

            // ── A first watch ──
            // Both identities are chosen here: the log's, so an offline log has a
            // real id rather than a placeholder, and its first viewing's, so a
            // note can be written on it before the queue has flushed.
            const payload = {
                id: crypto.randomUUID(),
                viewing_id: crypto.randomUUID(),
                user_id: user.id,
                film_id: log.filmId, film_title: log.title,
                poster_path: log.poster || null, year: log.year || null,
                rating: log.rating || 0, review: log.review || '',
                status: log.status || 'watched', is_spoiler: log.isSpoiler || false,
                watched_date: log.watchedDate || new Date().toISOString(),
                watched_with: log.watchedWith || null,
                abandoned_reason: log.abandonedReason || null,
                physical_media: log.physicalMedia || null,
                is_autopsied: log.isAutopsied || false, autopsy: log.autopsy || null,
                alt_poster: log.altPoster || null, editorial_header: log.editorialHeader || null,
                drop_cap: log.dropCap || false, pull_quote: log.pullQuote || '',
                video_url: log.videoUrl || null,
                format: log.physicalMedia || 'Digital',
            };

            const { data, error } = await supabase.from('logs').insert([payload]).select().single();
            if (error) {
                if (Vault.isNetworkError(error)) {
                    await enqueueMutation({ type: 'add_log', payload });
                    if (note) await saveNoteQuietly(payload.id, payload.viewing_id, note);
                    return { isRewatch: false as const, log: { ...payload, created_at: new Date().toISOString() } };
                }
                throw error;
            }
            if (note) await saveNoteQuietly(payload.id, payload.viewing_id, note);

            return { isRewatch: false as const, log: data };
        },
        onSuccess: (data, logInput) => {
            if (data.isRewatch) {
                const store = useFilmStore.getState();
                const prior = data.existingLog;
                // What the screen shows until the next fetch: the viewing it left,
                // named, at the front of the history — and no note in it.
                const archived = {
                    viewingId: prior.viewingId ?? undefined,
                    date: prior.watchedDate || prior.createdAt || new Date().toISOString(),
                    rating: prior.rating,
                    review: prior.review || '',
                    watchedWith: prior.watchedWith || null,
                };
                const mappedUpdates = {
                    rating: logInput.rating ?? prior.rating,
                    review: logInput.review ?? prior.review,
                    status: data.fields.status as FilmLog['status'],
                    watchedDate: data.fields.watched_date as string,
                    watchedWith: logInput.watchedWith ?? prior.watchedWith,
                    isSpoiler: logInput.isSpoiler ?? prior.isSpoiler,
                    physicalMedia: logInput.physicalMedia ?? prior.physicalMedia,
                    viewingId: data.newViewingId,
                    viewCount: (prior.viewCount || 1) + 1,
                    viewingHistory: [archived, ...(prior.viewingHistory || [])],
                } as Partial<FilmLog>;

                let filmIdToUpdate: number | undefined;
                const nextLogs = store.logs.map((l) => {
                    if (l.id === prior.id) {
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

            } else if (data.log) {
                const { privateNotes: _note, ...withoutNote } = logInput;
                const fullLog = {
                    ...withoutNote,
                    id: data.log.id,
                    viewingId: data.log.viewing_id ?? null,
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
            // No `private_notes`. A note is written on its VIEWING, below.
            if (updates.physicalMedia !== undefined) dbUpdates.physical_media = updates.physicalMedia;
            if (updates.isAutopsied !== undefined) dbUpdates.is_autopsied = updates.isAutopsied;
            if (updates.autopsy !== undefined) dbUpdates.autopsy = updates.autopsy;
            if (updates.altPoster !== undefined) dbUpdates.alt_poster = updates.altPoster;
            if (updates.editorialHeader !== undefined) dbUpdates.editorial_header = updates.editorialHeader;
            if (updates.dropCap !== undefined) dbUpdates.drop_cap = updates.dropCap;
            if (updates.pullQuote !== undefined) dbUpdates.pull_quote = updates.pullQuote;
            if (updates.videoUrl !== undefined) dbUpdates.video_url = updates.videoUrl;

            // Addressed by owner as well as id: RLS is the real guard, but a
            // refused row answers 200 with no error, and the screen would then
            // show an edit that never happened.
            if (Object.keys(dbUpdates).length > 0) {
                const { error } = await supabase.from('logs').update(dbUpdates).eq('id', id).eq('user_id', user.id);
                if (error) {
                    if (!Vault.isNetworkError(error)) throw error;
                    await enqueueMutation({ type: 'update_log', payload: { id, updates: dbUpdates } });
                }
            }

            // The note, if the member touched it — on the viewing this log is ON.
            const note = touchedNote(updates);
            if (note !== undefined) {
                let viewingId = useFilmStore.getState().logs.find(l => l.id === id)?.viewingId ?? null;
                if (!viewingId) {
                    const { data } = await supabase.from('logs').select('viewing_id').eq('id', id).maybeSingle();
                    viewingId = (data as { viewing_id?: string } | null)?.viewing_id ?? null;
                }
                if (viewingId) await saveNoteQuietly(id, viewingId, note);
            }
            return { id, updates };
        },
        onSuccess: (data) => {
            const store = useFilmStore.getState();
            // The note is not part of the log and never sits on it.
            const { privateNotes: _note, ...logUpdates } = data.updates;
            let filmIdToUpdate: number | undefined;
            const nextLogs = store.logs.map((l) => {
                if (l.id === data.id) {
                    filmIdToUpdate = l.filmId;
                    return { ...l, ...logUpdates } as FilmLog;
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

            // Deleting the log deletes every note on it, at the database (the
            // notes' foreign key cascades). Addressed by owner as well as id.
            const { error } = await supabase.from('logs').delete().eq('id', id).eq('user_id', user.id);
            if (error) {
                if (Vault.isNetworkError(error)) {
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

            // The log and its first viewing are named here, so a film marked
            // watched with no signal has a real id and can take a note at once.
            // No `viewing_history` or `view_count`: both are the server's.
            const payload = {
                id: crypto.randomUUID(),
                viewing_id: crypto.randomUUID(),
                user_id: user.id,
                film_id: film.id,
                film_title: film.title || film.name || 'Unknown',
                poster_path: film.poster_path || null,
                year: film.release_date ? new Date(film.release_date).getFullYear() : null,
                rating: 0,
                status: 'watched',
                watched_date: new Date().toISOString(),
            };

            const { data, error } = await supabase.from('logs').insert([payload]).select().single();
            if (error) {
                if (Vault.isNetworkError(error)) {
                    await enqueueMutation({ type: 'add_log', payload });
                    return { ...payload, created_at: new Date().toISOString() };
                }
                throw error;
            }
            return data;
        },
        onSuccess: (data, film) => {
            const fullLog = {
                id: data.id,
                viewingId: data.viewing_id ?? null,
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

// useUnmarkWatched was removed on 2026-09-18. Nothing called it, and it deleted
// the whole log — review, rewatches and every private note on it — without
// checking whether the log held anything but the mark. A destructive act that
// no screen uses is a defect waiting for its first caller.
