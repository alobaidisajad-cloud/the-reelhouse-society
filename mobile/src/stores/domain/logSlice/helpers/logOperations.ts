import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import { queryClient } from '../../../../lib/queryClient';
import { supabase } from '../../../../lib/supabase';
import { standingFor } from '@/src/constants/standing';
import type { DomainLog } from '../../../../types';
import { LOG_SELECT_COLUMNS, mapLogRow, mapLogToDbPayload } from '../../../../utils/mappers';
import { captureError } from '../../../../lib/sentry';
import { isNetworkError } from '../../../../utils/networkError';
import { enqueueMutation, getOfflineQueue } from '../../../../utils/offlineQueue';
import reelToast from '../../../../utils/reelToast';
import { sanitizeInput } from '../../../../utils/sanitizeInput';
import { resolveTier } from '../../../../utils/tier';
import { localCalendarDate } from '../../../../utils/timeAgo';
import { useAuthStore } from '../../../auth';
import { VaultService } from '../../../../services/VaultService';
import { useVaultStore } from '../../../vaultStore';
import { stillSignedIn } from '../../helpers/sessionGuard';
import type { FilmState } from '../../../films';

import { StoreApi } from 'zustand';

/**
 * A viewing's fields as the server names them, less the two it keeps itself
 * (history and count); a field left out is left as it was.
 */
const viewingFieldsOf = (dbUpdates: Record<string, unknown>): Record<string, unknown> => {
    const { viewing_history: _h, view_count: _c, ...fields } = dbUpdates;
    return fields;
};

// A duplicate key: SQLSTATE, or PostgreSQL's exact wording (`42P10` also says "UNIQUE").
const DUPLICATE_KEY_MESSAGE = /duplicate key value violates unique constraint/i;
const isDuplicateKey = (error: unknown): boolean => {
    const e = error as { code?: string; message?: string } | null;
    return e?.code === '23505' || DUPLICATE_KEY_MESSAGE.test(String(e?.message ?? ''));
};

/** "A write of this kind is already in flight", as a CODE the screen can match, not prose. */
export const LOG_BUSY = 'LOG_BUSY' as const;

// A SUCCESS, spoken: it has no toast ("RECORD SEALED" is visual). A failure's toast is
// already spoken, so a failure is not announced here too.
const announceToScreenReader = (message: string): void => {
    try {
        require('react-native').AccessibilityInfo.announceForAccessibility(message);
    } catch { /* the test environment has no screen reader */ }
};

export const FORMAT_MAP: Record<string, string> = { 'DVD': 'dvd', 'Blu-Ray': 'bluray', '4K UHD': '4k', 'VHS': 'vhs', 'Film Print': 'filmprint' };
export const resolveFormat = (physicalMedia?: string | null): string => FORMAT_MAP[physicalMedia ?? ''] ?? 'digital';

export const sortLogs = (logs: DomainLog[]) => logs.sort((a, b) => {
    const dateA = a.watchedDate || a.createdAt || '1970-01-01T00:00:00Z';
    const dateB = b.watchedDate || b.createdAt || '1970-01-01T00:00:00Z';
    return dateB.localeCompare(dateA);
});
type SetState = StoreApi<FilmState>['setState'];
type GetState = StoreApi<FilmState>['getState'];


/** True when the read was answered (or there was nothing to read); false when it failed. */
export const fetchLogsOp = async (set: SetState, get: GetState, loadMore: boolean = false): Promise<boolean> => {
        const user = useAuthStore.getState().user;
        if (!user) return true;
        const state = get();
        if (state._fetchingLogs) return true;
        if (loadMore && !state.logsHasMore) return true;
        set({ _fetchingLogs: true });

        const PAGE_SIZE = 50;

        let query = supabase
            .from('logs').select(LOG_SELECT_COLUMNS).eq('user_id', user.id)
            .order('watched_date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(PAGE_SIZE);

        const cursor = loadMore ? state._logsCursor : null;
        if (cursor) {
            try {
                const parsed = JSON.parse(cursor);
                // Defense-in-depth: lastId is interpolated into a PostgREST .or() filter
                // string below, so validate it as a uuid first. A corrupted cursor that
                // isn't a uuid degrades to a safe bare-date page instead of a broken query.
                const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(parsed.lastId));
                if (parsed.lastId) {
                    if (parsed.wasDateNull) {
                        // .lt('id', …) is a parameter, not interpolated: safe as it is.
                        query = query.is('watched_date', null).lt('id', parsed.lastId);
                    } else if (parsed.lastDate) {
                        const safeDate = String(parsed.lastDate).replace(/"/g, '""');
                        if (isUuid) {
                            query = query.or(`watched_date.lt."${safeDate}",and(watched_date.eq."${safeDate}",id.lt.${parsed.lastId}),watched_date.is.null`);
                        } else {
                            query = query.lt('watched_date', String(parsed.lastDate));
                        }
                    }
                }
            } catch {
                // Malformed cursor → treat as null (fresh fetch)
            }
        }

        const { data, error } = await query;

        // Left mid-fetch: the reset restored this op's flags, and persisting would copy them.
        if (!stillSignedIn(user.id)) return true;

        if (error || !data) { set({ _fetchingLogs: false }); return false; }
        
        const hasMore = data.length === PAGE_SIZE;

        // Compute next cursor from last row
        const lastRow = data.length > 0 ? data[data.length - 1] : null;
        const nextCursor = hasMore && lastRow ? JSON.stringify({
            lastDate: (lastRow as any).watched_date,
            lastId: (lastRow as any).id,
            wasDateNull: (lastRow as any).watched_date === null
        }) : null;

        // --- Prevent optimistic clobbering ---
        const queue = getOfflineQueue();
        const pendingRemoves = new Set(queue.filter(q => q.type === 'remove_log').map(q => q.payload.log_id));
        const pendingUpdates = queue.filter(q => q.type === 'update_log');
        const pendingAdds = queue.filter(q => (q.type === 'add_log' || q.type === 'mark_watched') && !pendingRemoves.has((q.payload as any).id)).map(q => {
            let finalPayload = { ...(q.payload as any) };
            const upds = pendingUpdates.filter(up => up.payload.id === finalPayload.id);
            for (const up of upds) {
                finalPayload = { ...finalPayload, ...(up.payload.updates as any) };
            }
            return mapLogRow(finalPayload) as DomainLog;
        });
        
        const newLogs = data
            .filter((dbLog: any) => !pendingRemoves.has(dbLog.id))
            .map((dbLog: any) => {
                let finalDbLog = { ...dbLog };
                const upds = pendingUpdates.filter(q => q.payload.id === dbLog.id);
                for (const up of upds) {
                    finalDbLog = { ...finalDbLog, ...(up.payload.updates as any) };
                }
                return mapLogRow(finalDbLog as any) as DomainLog;
            });

        const nextLogs = loadMore ? [...state.logs, ...newLogs] : [...pendingAdds, ...newLogs];
        // ------------------------------------------------
        
        // Deduplicate to prevent React key collisions
        const uniqueLogsMap = new Map<string, DomainLog>();
        nextLogs.forEach(l => uniqueLogsMap.set(l.id, l as DomainLog));
        const deduplicatedLogs = sortLogs(Array.from(uniqueLogsMap.values()));

        const idx: Record<number, DomainLog> = {};
        deduplicatedLogs.forEach(l => { if (l.filmId && !idx[l.filmId]) idx[l.filmId] = l as DomainLog; });

        set({ 
            logs: deduplicatedLogs, 
            _loggedIndex: idx,
            _logsCursor: nextCursor,
            logsHasMore: hasMore,
            _fetchingLogs: false,
        });

        // Background Image Prefetching (Cache Warming) — only prefetch NEW entries
        const newEntries = loadMore ? newLogs : deduplicatedLogs;
        const posterUrls = newEntries
            .filter(l => l.poster)
            .map(l => `https://image.tmdb.org/t/p/w500${l.poster}`);
        if (posterUrls.length > 0) {
            Image.prefetch(posterUrls, 'disk').catch(() => {});
        }
        return true;
    }

/**
 * Merge a new log attempt into an existing row as a rewatch —
 * archives the existing entry into viewing_history and bumps view_count. Shared by
 * the upfront duplicate check AND the 23505 unique-violation recovery in addLogOp,
 * so a concurrent multi-device insert merges the user's review instead of discarding
 * it. Mirrors the offline executor's handleDuplicateLogMerge for online/offline parity.
 */
const applyRewatchMerge = async (set: SetState, get: GetState, existingLog: DomainLog, log: Partial<DomainLog>) => {
    const oldHistory = (Array.isArray(existingLog.viewingHistory) ? existingLog.viewingHistory : []) as any[];
    // What the viewing being left looked like. Built here for the screen only —
    // the SERVER writes the real one, from the row it holds, so the archive never
    // depends on how fresh this device's copy was. It carries no note: a note
    // belongs to its viewing and stays in the Vault, which nobody else can read.
    const archivedEntry = {
        viewingId: existingLog.viewingId ?? undefined,
        date: existingLog.watchedDate ?? existingLog.createdAt ?? localCalendarDate(),
        rating: existingLog.rating,
        review: existingLog.review ?? '',
        isSpoiler: existingLog.isSpoiler ?? false,
        watchedWith: existingLog.watchedWith ?? '',
        physicalMedia: existingLog.physicalMedia ?? 'None',
        status: existingLog.status ?? 'watched',
        abandonedReason: existingLog.abandonedReason ?? null,
        isAutopsied: existingLog.isAutopsied ?? false,
        autopsy: existingLog.autopsy ?? null,
        altPoster: existingLog.altPoster ?? null,
        editorialHeader: existingLog.editorialHeader ?? null,
        dropCap: existingLog.dropCap ?? false,
        pullQuote: existingLog.pullQuote ?? '',
        videoUrl: existingLog.videoUrl ?? null,
        format: existingLog.format ?? 'digital',
    };
    const newHistory = [archivedEntry, ...oldHistory];
    const newViewCount = (existingLog.viewCount ?? 1) + 1;

    const isAware = (log as any)._uiHydrated === true;
    const safeOverride = <T>(newVal: T | null | undefined, oldVal: T | null | undefined, defaultVal: T): T | null => {
        if (isAware) return (newVal !== undefined ? newVal : oldVal) ?? null;
        if (newVal === undefined) return (oldVal ?? defaultVal) as T | null;
        if (newVal === null || newVal === '' || newVal === 'None') return (oldVal ?? defaultVal) as T | null;
        return newVal as T | null;
    };

    // The viewing about to begin, named before the write so a retry is the same rewatch.
    const newViewingId = Crypto.randomUUID();

    // updateLogOp directly, silent: the store action cannot pass opts, and addLogOp
    // announces the truer "Rewatch added" (not "Record amended") itself.
    const merge = await updateLogOp(set, get, existingLog.id, {
        rating: log.rating !== undefined ? log.rating : existingLog.rating,
        review: isAware ? (log.review !== undefined ? log.review : existingLog.review) : (log.review !== undefined && log.review !== '' ? log.review : existingLog.review),
        status: log.status === 'abandoned' ? 'abandoned' : 'rewatched',
        watchedDate: log.watchedDate ?? localCalendarDate(),
        watchedWith: log.watchedWith !== undefined ? log.watchedWith : (existingLog.watchedWith ?? null),
        isSpoiler: (log.isSpoiler !== undefined ? log.isSpoiler : existingLog.isSpoiler) ?? false,
        physicalMedia: log.physicalMedia !== undefined ? log.physicalMedia : (existingLog.physicalMedia ?? 'None'),
        abandonedReason: safeOverride(log.abandonedReason, existingLog.abandonedReason, null),
        isAutopsied: (log.isAutopsied !== undefined ? log.isAutopsied : existingLog.isAutopsied) ?? false,
        autopsy: safeOverride(log.autopsy, existingLog.autopsy, null),
        altPoster: safeOverride(log.altPoster, existingLog.altPoster, null),
        editorialHeader: safeOverride(log.editorialHeader, existingLog.editorialHeader, null),
        dropCap: (log.dropCap !== undefined ? log.dropCap : existingLog.dropCap) ?? false,
        pullQuote: log.pullQuote !== undefined ? log.pullQuote : (existingLog.pullQuote ?? ''),
        videoUrl: log.videoUrl ?? null,
        format: log.physicalMedia !== undefined ? (log.physicalMedia ? resolveFormat(log.physicalMedia) : 'digital') : existingLog.format,
        viewCount: newViewCount,
        viewingHistory: newHistory,
        viewingId: newViewingId,
    } as Partial<DomainLog>, { silentAnnounce: true, viewingOp: { kind: 'add', viewingId: newViewingId } });

    // The note the member wrote in the form belongs to the viewing that has just
    // begun — not to the one now in the history, which keeps its own. Written
    // after the viewing exists, because a note must have a viewing to belong to.
    if (typeof log.privateNotes === 'string' && log.privateNotes.trim()) {
        try {
            await useVaultStore.getState().saveNote(existingLog.id, newViewingId, log.privateNotes);
        } catch (e) {
            // The rewatch is filed; a refused note is reported where notes are written.
            if (!isNetworkError(e)) captureError(e, { scope: 'applyRewatchMerge.saveNote', logId: existingLog.id });
        }
    }

    if (existingLog.filmId) {
        queryClient.invalidateQueries({ queryKey: ['film', Number(existingLog.filmId)] });
    }
    // So the caller never claims the archive holds what is still queued.
    return { queuedOffline: merge?.queuedOffline === true };
};

export const addLogOp = async (set: SetState, get: GetState, log: Partial<DomainLog>) => {
        const user = useAuthStore.getState().user;
        if (!user) return;

        // Single sanitization choke point: clean the review BEFORE the online/
        // offline branch so the DB write, optimistic cache, and offline-queued
        // payload all carry identical, length-capped, control-char-free text.
        if (log.review !== undefined) {
            log.review = sanitizeInput(log.review ?? '', 'review');
        }

        // Anchor date to noon UTC to prevent timezone shifting
        if (log.watchedDate && log.watchedDate.length === 10) {
            log.watchedDate = `${log.watchedDate}T12:00:00Z`;
        }

        if (get()._addLogMutex) {
            // No toast: the screen shows one, and the code tells it "still saving".
            throw Object.assign(new Error('addLog mutex locked'), { code: LOG_BUSY });
        }
        set({ _addLogMutex: true });

        try {
            let existingLog = log.filmId ? get()._loggedIndex[log.filmId] : undefined;
            if (!existingLog && log.filmId) {
                const { data: serverCheck } = await supabase.from('logs')
                    .select(LOG_SELECT_COLUMNS)
                    .eq('user_id', user.id).eq('film_id', log.filmId)
                    .order('created_at', { ascending: false }).limit(1);
                if (serverCheck && serverCheck.length > 0) {
                    existingLog = mapLogRow(serverCheck[0] as any) as unknown as DomainLog;
                }
            }

            if (existingLog) {
                const merged = await applyRewatchMerge(set, get, existingLog, log);
                // A success that returns early, so it announces itself; not when
                // queued (updateLogOp queues without throwing), which is not archived.
                if (!merged?.queuedOffline) announceToScreenReader('Rewatch added to your archive');
                return;
            }

            const newId = Crypto.randomUUID();
            // The first viewing's identity, chosen here rather than left to the
            // database's default. It is what lets a member write a note on a log
            // they filed with no signal: the note names this viewing, and both
            // reach the server in order when the queue flushes.
            const newViewingId = Crypto.randomUUID();
            const payload = {
                id: newId,
                viewing_id: newViewingId,
                user_id: user.id,
                film_id: log.filmId, film_title: log.title,
                poster_path: log.poster ?? null, year: log.year ? (parseInt(String(log.year)) || null) : null,
                rating: log.rating ?? 0, review: log.review ?? '',
                status: log.status ?? 'watched', is_spoiler: log.isSpoiler ?? false,
                watched_date: log.watchedDate ?? localCalendarDate(),
                watched_with: log.watchedWith ?? null,
                // No `private_notes`. A note is written on the VIEWING, right
                // after this row exists — see below.
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

            let finalData = data;
            // A queued write is not an archived one, and the announcement at the
            // end of this block says it is. See the note there.
            let queuedOffline = false;
            if (error) {
                // Use shared network error detection
                if (isNetworkError(error)) {
                    enqueueMutation({ type: 'add_log', payload: payload });
                    reelToast('Archived offline. Will sync when connected.');
                    queuedOffline = true;
                    finalData = { ...payload, created_at: new Date().toISOString(), id: payload.id };
                } else if (isDuplicateKey(error)) {
                    // a concurrent insert (e.g. the same film logged from another
                    // device) won the logs(user_id, film_id) unique race. Mirror the offline
                    // executor's handleDuplicateLogMerge: re-fetch the winning row and merge this
                    // attempt in as a rewatch instead of discarding the user's review/rating.
                    if (log.filmId) {
                        const { data: serverRows } = await supabase.from('logs')
                            .select(LOG_SELECT_COLUMNS)
                            .eq('user_id', user.id).eq('film_id', log.filmId)
                            .order('created_at', { ascending: false }).limit(1);
                        if (serverRows && serverRows.length > 0) {
                            const existing = mapLogRow(serverRows[0] as any) as unknown as DomainLog;
                            const dupMerged = await applyRewatchMerge(set, get, existing, log);
                            // As above: announced, unless the network dropped and it queued.
                            if (!dupMerged?.queuedOffline) announceToScreenReader('Rewatch added to your archive');
                            return;
                        }
                    }
                    throw error; // the caller toasts, once
                } else {
                    throw error; // the caller toasts, once
                }
            }

            // Left mid-write: the row is saved; showing it would show the next member.
            if (!stillSignedIn(user.id)) return;

            // The note the member wrote belongs to the viewing this log just
            // began. It is written separately, because that is where a note
            // lives now — and the log itself is already filed either way, so a
            // note refused for the rank does not take the record down with it.
            if (typeof log.privateNotes === 'string' && log.privateNotes.trim()) {
                try {
                    await useVaultStore.getState().saveNote(newId, newViewingId, log.privateNotes);
                } catch (e) {
                    if (!isNetworkError(e)) captureError(e, { scope: 'addLogOp.saveNote', logId: newId });
                }
            }

            const fullLog = mapLogRow(finalData) as import('@/src/types').DomainLog;
            set((state) => {
                const newLogs = sortLogs([fullLog, ...state.logs]);
                return {
                    logs: newLogs,
                    _loggedIndex: (() => { const n = { ...state._loggedIndex }; if (log.filmId) n[log.filmId] = fullLog; return n; })()
                };
            });

            // Predictive cache update for film/[id].tsx community reviews
            if (log.filmId) {
                queryClient.setQueryData(['film', Number(log.filmId)], (old: any) => {
                    if (!old) return old;
                    const newReview = {
                        id: finalData.id,
                        rating: log.rating ?? 0,
                        review: log.review ?? '',
                        status: log.status ?? 'watched',
                        is_spoiler: log.isSpoiler ?? false,
                        abandoned_reason: log.abandonedReason ?? null,
                        pull_quote: log.pullQuote ?? null,
                        drop_cap: log.dropCap ?? false,
                        is_autopsied: log.isAutopsied ?? false,
                        autopsy: log.autopsy ?? null,
                        watched_date: log.watchedDate ?? localCalendarDate(),
                        watched_with: log.watchedWith ?? null,
                        editorial_header: log.editorialHeader ?? null,
                        alt_poster: log.altPoster ?? null,
                        created_at: finalData.created_at,
                        user_id: user.id,
                        username: user.username,
                        avatar_url: user.avatar_url,
                        display_name: user.display_name,
                        role: resolveTier(user),
                        isLocal: true,
                    };
                    const hasText = (log.review || '').trim() !== '';
                    const filtered = (Array.isArray(old.reviews) ? old.reviews : []).filter((r: any) => r.user_id !== user.id);
                    return {
                        ...old,
                        reviews: hasText ? [newReview, ...filtered] : filtered,
                    };
                });
            }

            if (log.physicalMedia && FORMAT_MAP[log.physicalMedia] && log.filmId !== undefined) {
                const fmt = FORMAT_MAP[log.physicalMedia];
                try {
                    await get().addToPhysicalArchive({ id: log.filmId, title: log.title ?? '', poster_path: log.poster, release_date: log.year?.toString() }, [fmt]);
                } catch (e) {
                    // A contract guard: addToPhysicalArchive never rethrows (today).
                    if (__DEV__) console.error('Failed to auto-sync physical archive', e);

                    if (!isNetworkError(e)) captureError(e, { scope: 'addLogOp.autoSyncPhysicalArchive' });
                }
            }
            // Success only (never in `finally`); a queued log's own toast has spoken.
            if (!queuedOffline) announceToScreenReader('Film logged to your archive');
        } finally {
            set({ _addLogMutex: false });
        }
    }

export const unmarkWatchedOp = async (set: SetState, get: GetState, filmId: number) => {
    const existingLog = get().logs.find(l => l.filmId === filmId);
        if (!existingLog) return;

        // Unmarking deletes the whole record, so the Vault is ASKED for notes; an
        // unreachable Vault means "there may be one", and the record stays.
        const vault = useVaultStore.getState();
        if (!vault.isLoaded(existingLog.id)) await vault.loadForLog(existingLog.id);
        const after = useVaultStore.getState();
        // ANY viewing's note: every one goes with the record.
        const mayHoldANote = after.isUnreachable(existingLog.id)
            || Object.entries(after.notesLog).some(([v, logId]) => logId === existingLog.id && !!after.notes[v]?.trim());

        if (
            existingLog.rating > 0 ||
            !!existingLog.review?.trim() ||
            mayHoldANote ||
            (existingLog.physicalMedia && existingLog.physicalMedia !== 'None') || 
            !!existingLog.autopsy || 
            !!existingLog.watchedWith?.trim() ||
            !!existingLog.abandonedReason?.trim() ||
            !!existingLog.altPoster ||
            !!existingLog.editorialHeader?.trim() ||
            !!existingLog.pullQuote?.trim() ||
            !!existingLog.videoUrl?.trim() ||
            existingLog.dropCap ||
            existingLog.isAutopsied ||
            (existingLog.viewCount && existingLog.viewCount > 1) ||
            (Array.isArray(existingLog.viewingHistory) && existingLog.viewingHistory.length > 0)
        ) return;
        try {
            await get().removeLog(existingLog.id);
        } catch {
            // Error already toasted by removeLog
        }
};

export const getCinephileStatsOp = (set: SetState, get: GetState, overrideCount?: number) => {
    const logs = get().logs;
        const count = overrideCount ?? logs.length;
        const s = standingFor(count); // the one ladder (src/constants/standing.ts)
        return { count, level: s.name, color: s.color, progress: s.progress };
};

export const updateLogOp = async (
    set: SetState,
    get: GetState,
    id: string,
    updates: Partial<DomainLog>,
    opts?: {
        /** Set by callers using this as a STEP, so it does not narrate their work. */
        silentAnnounce?: boolean;
        /** Add or remove a VIEWING (the server moves it); its id makes a repeat a no-op. */
        viewingOp?: { kind: 'add' | 'remove'; viewingId: string };
    },
) => {
        if (get()._updateLogMutex) {
            // Same as addLog: one toast, chosen by the screen from this code.
            throw Object.assign(new Error('updateLog mutex locked'), { code: LOG_BUSY });
        }
        set({ _updateLogMutex: true });

        try {
        const user = useAuthStore.getState().user;
        if (!user) return;
        
        const cleanUpdates = { ...updates };

        // Single sanitization choke point (parity with addLogOp): clean the
        // review on the clone before any online/offline path consumes it.
        if (cleanUpdates.review !== undefined) {
            cleanUpdates.review = sanitizeInput(cleanUpdates.review ?? '', 'review');
        }

        // Anchor date to noon UTC to prevent timezone shifting (strictly on the clone)
        if (cleanUpdates.watchedDate && cleanUpdates.watchedDate.length === 10) {
            cleanUpdates.watchedDate = `${cleanUpdates.watchedDate}T12:00:00Z`;
        }

        const originalLog = get().logs.find(l => l.id === id);
        const originalFilmId = originalLog?.filmId;
        
        let filmIdToUpdate: number | undefined;

        Object.keys(cleanUpdates).forEach(key => {
            if ((cleanUpdates as any)[key] === undefined) {
                delete (cleanUpdates as any)[key];
            }
        });

        set((state) => {
            const nextLogs = sortLogs(state.logs.map((l) => {
                if (l.id === id) {
                    filmIdToUpdate = l.filmId;
                    return { ...l, ...cleanUpdates } as DomainLog;
                }
                return l;
            }));
            const nextIdx = { ...state._loggedIndex };
            if (filmIdToUpdate) {
                const updated = nextLogs.find(l => l.filmId === filmIdToUpdate);
                if (updated) nextIdx[filmIdToUpdate] = updated as DomainLog;
            }
            return { logs: nextLogs, _loggedIndex: nextIdx };
        });

        const dbUpdates = mapLogToDbPayload(cleanUpdates);
        
        let previousFilmData: any;
        if (filmIdToUpdate) {
            const queryKey = ['film', Number(filmIdToUpdate)];
            await queryClient.cancelQueries({ queryKey });
            previousFilmData = queryClient.getQueryData(queryKey);
            queryClient.setQueryData(queryKey, (old: any) => {
                if (!old) return old;
                const reviews = Array.isArray(old.reviews) ? old.reviews : [];
                let updatedReviews = reviews.map((r: any) => r.user_id === user.id ? { ...r, ...dbUpdates } : r);
                
                const userReviewExists = updatedReviews.some((r: any) => r.user_id === user.id);
                if (!userReviewExists && String(dbUpdates.review || '').trim() !== '') {
                    const mergedLog = { ...originalLog, ...cleanUpdates };
                    const newReview = {
                        id: id,
                        rating: mergedLog.rating ?? 0,
                        review: mergedLog.review ?? '',
                        status: mergedLog.status ?? 'watched',
                        is_spoiler: mergedLog.isSpoiler ?? false,
                        abandoned_reason: mergedLog.abandonedReason ?? null,
                        pull_quote: mergedLog.pullQuote ?? null,
                        drop_cap: mergedLog.dropCap ?? false,
                        is_autopsied: mergedLog.isAutopsied ?? false,
                        autopsy: mergedLog.autopsy ?? null,
                        watched_date: mergedLog.watchedDate ?? localCalendarDate(),
                        watched_with: mergedLog.watchedWith ?? null,
                        editorial_header: mergedLog.editorialHeader ?? null,
                        alt_poster: mergedLog.altPoster ?? null,
                        created_at: mergedLog.createdAt ?? new Date().toISOString(),
                        user_id: user.id,
                        username: user.username,
                        avatar_url: user.avatar_url,
                        display_name: user.display_name,
                        role: resolveTier(user),
                        isLocal: true,
                    };
                    updatedReviews = [newReview, ...updatedReviews];
                }
                
                updatedReviews = updatedReviews.filter((r: any) => (r.review || '').trim() !== '');
                return {
                    ...old,
                    reviews: updatedReviews
                };
            });
        }

        const queryKeyLog = ['log', id];
        await queryClient.cancelQueries({ queryKey: queryKeyLog });
        const previousLogData = queryClient.getQueryData(queryKeyLog);
        queryClient.setQueryData(queryKeyLog, (old: any) => {
            if (!old || !old.log) return old;
            return {
                ...old,
                log: { ...old.log, ...dbUpdates }
            };
        });

        try {
            // An edit carries the ownership filter, as every write here does (RLS
            // guards; a refused row would answer 200). A viewing operation goes
            // through its RPC, the only way to move a log between viewings, which
            // checks the owner itself.
            let error: unknown = null;
            if (opts?.viewingOp) {
                try {
                    if (opts.viewingOp.kind === 'add') {
                        await VaultService.addViewing(id, opts.viewingOp.viewingId, viewingFieldsOf(dbUpdates));
                    } else {
                        await VaultService.removeViewing(id, opts.viewingOp.viewingId);
                    }
                } catch (e) {
                    error = e;
                }
            } else {
                ({ error } = await supabase.from('logs')
                    .update(dbUpdates)
                    .eq('id', id)
                    .eq('user_id', user.id));
            }
            // A queued edit is not a saved one (it falls through to the announcement).
            let queuedOffline = false;
            if (error) {
                if (isNetworkError(error)) {
                    enqueueMutation(opts?.viewingOp
                        ? (opts.viewingOp.kind === 'add'
                            ? { type: 'add_viewing', payload: { log_id: id, viewing_id: opts.viewingOp.viewingId, fields: viewingFieldsOf(dbUpdates) } }
                            : { type: 'remove_viewing', payload: { log_id: id, viewing_id: opts.viewingOp.viewingId } })
                        : { type: 'update_log', payload: { id, updates: dbUpdates } });
                    // A STEP shows no toast either: its caller is told it queued, and
                    // says one true thing in its own verb.
                    if (!opts?.silentAnnounce) reelToast('Saved offline. Will sync when connected.');
                    queuedOffline = true;
                } else {
                    throw error;
                }
            }
            
            // The note, if this edit carried one: undefined is untouched, '' is the
            // member clearing it (never gated). A viewing operation writes its own note.
            if (!opts?.viewingOp && updates.privateNotes !== undefined) {
                const viewingId = (get().logs.find(l => l.id === id)?.viewingId) ?? originalLog?.viewingId ?? null;
                if (viewingId) {
                    try {
                        await useVaultStore.getState().saveNote(id, viewingId, updates.privateNotes ?? '');
                    } catch (e) {
                        // The record is saved; the screen that asked reports the note.
                        if (!isNetworkError(e)) captureError(e, { scope: 'updateLogOp.saveNote', logId: id });
                    }
                }
            }

            if (updates.physicalMedia && FORMAT_MAP[updates.physicalMedia]) {
                const fmt = FORMAT_MAP[updates.physicalMedia];
                const logToUpdate = get().logs.find(l => l.id === id);
                if (logToUpdate && logToUpdate.filmId !== undefined) {
                    try {
                        await get().addToPhysicalArchive({ id: logToUpdate.filmId, title: logToUpdate.title ?? '', poster_path: logToUpdate.poster, release_date: logToUpdate.year?.toString() }, [fmt]);
                    } catch (e) {
                        // A contract guard, as in addLogOp.
                        if (__DEV__) console.error('Failed to auto-sync physical archive on update', e);

                        if (!isNetworkError(e)) captureError(e, { scope: 'updateLogOp.autoSyncPhysicalArchive' });
                    }
                }
            }

            // Spoken, as "RECORD SEALED" is shown; not for a step, whose caller says
            // the truer thing, nor when queued, whose toast already spoke.
            if (!opts?.silentAnnounce && !queuedOffline) announceToScreenReader('Record amended');
            return { queuedOffline }; // so a caller using this as a step can say the truth
        } catch (e: unknown) {
            if (!isNetworkError(e)) captureError(e, { scope: 'updateLogOp', logId: id });
            // Roll back only while they are still here: after a logout it would hand
            // the next member a record.
            if (originalLog && stillSignedIn(user.id)) {
                set((state) => {
                    const revertedLogs = sortLogs(state.logs.map(l => l.id === id ? originalLog : l));
                    const nextIdx = { ...state._loggedIndex };
                    if (originalFilmId) {
                        const updated = revertedLogs.find(l => l.filmId === originalFilmId);
                        if (updated) nextIdx[originalFilmId] = updated as DomainLog;
                    }
                    return { logs: revertedLogs, _loggedIndex: nextIdx };
                });
            }
            if (filmIdToUpdate && previousFilmData !== undefined) {
                queryClient.setQueryData(['film', Number(filmIdToUpdate)], previousFilmData);
            }
            if (previousLogData !== undefined) {
                queryClient.setQueryData(['log', id], previousLogData);
            }
            // The caller toasts — one message per failure.
            throw e;
        } finally {
            queryClient.invalidateQueries({ queryKey: ['log', id] });
            if (filmIdToUpdate) {
                queryClient.invalidateQueries({ queryKey: ['film', Number(filmIdToUpdate)] });
            }
        }
        } finally {
            set({ _updateLogMutex: false });
        }
    }

export const removeLogOp = async (set: SetState, get: GetState, id: string, forceDeleteAll: boolean = false) => {
        // Captured before any await, so the rollback can tell whether it is still them.
        const startedAs = useAuthStore.getState().user?.id ?? null;
        const logToRemove = get().logs.find((l) => l.id === id);
        if (!logToRemove) return;
        
        // Pop history instead of a hard delete
        const history = Array.isArray(logToRemove.viewingHistory) ? logToRemove.viewingHistory : [];
        if (!forceDeleteAll && history.length > 0) {
            const poppedEntry = history[0] as { viewingId?: string } & Record<string, any>;
            const remainingHistory = history.slice(1);

            // The viewing removed is the one the log is ON; naming it makes a retry do
            // nothing. A log cached without viewing ids asks the server for it.
            let leavingViewingId = logToRemove.viewingId ?? null;
            if (!leavingViewingId) {
                try {
                    const { data } = await supabase.from('logs').select('viewing_id').eq('id', id).maybeSingle();
                    leavingViewingId = (data as { viewing_id?: string } | null)?.viewing_id ?? null;
                } catch { /* offline — handled immediately below */ }
            }
            if (!leavingViewingId) {
                // Nothing to name, nothing honest to queue (the database refuses it).
                reelToast('Removing a rewatch needs a connection.');
                return;
            }

            const updates: Partial<DomainLog> = {
                watchedDate: poppedEntry.date ?? logToRemove.createdAt ?? localCalendarDate(),
                rating: poppedEntry.rating ?? 0,
                review: poppedEntry.review ?? '',
                status: poppedEntry.status ?? 'watched',
                isSpoiler: poppedEntry.isSpoiler ?? false,
                watchedWith: poppedEntry.watchedWith ?? null,
                physicalMedia: poppedEntry.physicalMedia ?? 'None',
                abandonedReason: poppedEntry.abandonedReason ?? null,
                isAutopsied: poppedEntry.isAutopsied ?? false,
                autopsy: poppedEntry.autopsy ?? null,
                altPoster: poppedEntry.altPoster ?? null,
                editorialHeader: poppedEntry.editorialHeader ?? null,
                dropCap: poppedEntry.dropCap ?? false,
                pullQuote: poppedEntry.pullQuote ?? null,
                videoUrl: poppedEntry.videoUrl ?? null,
                format: poppedEntry.format ?? 'digital',
                viewingHistory: remainingHistory,
                viewCount: Math.max(1, (logToRemove.viewCount ?? 1) - 1),
                viewingId: poppedEntry.viewingId ?? null,
            };

            try {
                // A silent STEP: the toast below says what the member did.
                const undone = await updateLogOp(set, get, id, updates, {
                    silentAnnounce: true,
                    viewingOp: { kind: 'remove', viewingId: leavingViewingId },
                });
                // The server removed its note; the local Vault forgets it too.
                useVaultStore.getState().forgetNote(leavingViewingId);
                reelToast(undone?.queuedOffline
                    ? 'Rewatch removed offline. Will sync when connected.'
                    : 'Rewatch removed. Reverted to previous viewing.');
            } catch (e) {
                throw e; // the caller toasts, once
            }
            return;
        }

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
                // Use shared network error detection
                if (isNetworkError(error)) {
                    enqueueMutation({ type: 'remove_log', payload: { log_id: id, user_id: user.id } });
                    reelToast('Removed offline. Will sync when connected.');
                    return;
                }
                throw error;
            }
            reelToast(`"${logToRemove.title}" removed.`);
        } catch (e: unknown) {
            if (__DEV__) console.warn(`[removeLog] Failed for log ${id}:`, e);

            if (!isNetworkError(e)) captureError(e, { scope: 'removeLogOp', logId: id });
            // Restored only while they are still here: after a logout it would hand
            // the next member one of theirs.
            if (stillSignedIn(startedAs)) {
                set((state) => {
                    const newLogs = sortLogs([logToRemove, ...state.logs]);
                    const nextIdx = { ...state._loggedIndex };
                    if (logToRemove.filmId) {
                        const updated = newLogs.find(l => l.filmId === logToRemove.filmId);
                        if (updated) nextIdx[logToRemove.filmId] = updated as DomainLog;
                    }
                    return { logs: newLogs, _loggedIndex: nextIdx };
                });
            }
            if (logToRemove.filmId && previousFilmData !== undefined) {
                queryClient.setQueryData(['film', Number(logToRemove.filmId)], previousFilmData);
            }
            // The caller toasts — one message per failure.
            throw e;
        } finally {
            queryClient.invalidateQueries({ queryKey: ['log', id] });
            if (logToRemove.filmId) {
                queryClient.invalidateQueries({ queryKey: ['film', Number(logToRemove.filmId)] });
            }
        }
    }
