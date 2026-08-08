import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import { queryClient } from '../../../../lib/queryClient';
import { supabase } from '../../../../lib/supabase';
import { colors } from '../../../../theme/theme';
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
import type { FilmState } from '../../../films';

import { StoreApi } from 'zustand';

/**
 * Is this error a genuine duplicate-key violation?
 *
 * SQLSTATE first, and the prose fallback narrowed to PostgreSQL's actual
 * duplicate wording — because the test here used to be
 * `/duplicate|unique|23505/i` against the message, and `42P10` reads
 * "there is no UNIQUE or exclusion constraint matching…". That substring made a
 * broken statement look like a duplicate.
 *
 * Batch 16 found and fixed exactly this in the offline queue. The same loose test
 * survived here, in a different file, which is the whole reason that batch's
 * lesson was "fix the CLASS, not the instance in front of you".
 */
const DUPLICATE_KEY_MESSAGE = /duplicate key value violates unique constraint/i;
const isDuplicateKey = (error: unknown): boolean => {
    const e = error as { code?: string; message?: string } | null;
    return e?.code === '23505' || DUPLICATE_KEY_MESSAGE.test(String(e?.message ?? ''));
};

/**
 * "A write of this kind is already in flight."
 *
 * Carried as a CODE on the error, not as prose. The screen needs to tell "still
 * working" apart from "it failed" so it can say the right thing, and matching on
 * an error's MESSAGE is exactly what batch 16 proved fragile — a substring test
 * read `42P10` as a duplicate and filed a broken statement as a success.
 */
export const LOG_BUSY = 'LOG_BUSY' as const;

/**
 * Speak a SUCCESS to a screen reader.
 *
 * Successes here are announced explicitly because they have no toast — the log
 * flow confirms visually with "RECORD SEALED", which VoiceOver cannot read.
 * FAILURES are deliberately NOT announced from this file: they carry an error
 * toast, and the toast is now spoken on both platforms. Announcing here as well
 * would make Android say it twice.
 *
 * `require` rather than a top-level import, and wrapped, to match the existing
 * call sites — it keeps this file loadable in the test environment.
 */
const announceToScreenReader = (message: string): void => {
    try { require('react-native').AccessibilityInfo.announceForAccessibility(message); } catch { /* test env */ }
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


export const fetchLogsOp = async (set: SetState, get: GetState, loadMore: boolean = false) => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        const state = get();
        if (state._fetchingLogs) return;
        if (loadMore && !state.logsHasMore) return;
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
                        // .lt('id', …) is parameterized (not string-interpolated), so it's safe as-is.
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
        
        if (error || !data) { set({ _fetchingLogs: false }); return; }
        
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
    const archivedEntry = {
        date: existingLog.watchedDate ?? existingLog.createdAt ?? localCalendarDate(),
        rating: existingLog.rating,
        review: existingLog.review ?? '',
        isSpoiler: existingLog.isSpoiler ?? false,
        watchedWith: existingLog.watchedWith ?? '',
        privateNotes: existingLog.privateNotes ?? '',
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

    // Direct, not through get().updateLog — the store action does not forward
    // opts, so it can never be silent. A merge is a STEP inside addLogOp, which
    // says its own truer thing ("Rewatch added to your archive") right after;
    // without this a member logging a film they had already seen heard "Record
    // amended" first, which is not what they did. Same defect as removeLogOp's,
    // at the caller I did not sweep for when I fixed that one.
    const merge = await updateLogOp(set, get, existingLog.id, {
        rating: log.rating !== undefined ? log.rating : existingLog.rating,
        review: isAware ? (log.review !== undefined ? log.review : existingLog.review) : (log.review !== undefined && log.review !== '' ? log.review : existingLog.review),
        status: log.status === 'abandoned' ? 'abandoned' : 'rewatched',
        watchedDate: log.watchedDate ?? localCalendarDate(),
        watchedWith: log.watchedWith !== undefined ? log.watchedWith : (existingLog.watchedWith ?? null),
        isSpoiler: (log.isSpoiler !== undefined ? log.isSpoiler : existingLog.isSpoiler) ?? false,
        privateNotes: safeOverride(log.privateNotes, existingLog.privateNotes, null),
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
    } as Partial<DomainLog>, { silentAnnounce: true });

    if (existingLog.filmId) {
        queryClient.invalidateQueries({ queryKey: ['film', Number(existingLog.filmId)] });
    }
    // Passed up so the caller does not claim the archive holds something that is
    // still sitting in the offline queue.
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
            // No toast here — the screen shows exactly one, and it needs to say
            // "still saving", not "it failed". The code below tells it which.
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
                // Another success that returns early — this is the "you have
                // already logged this film" merge, distinct from the duplicate-key
                // collision below. Both were covered by the old `finally`, which
                // is exactly how moving that announcement can silence a path
                // nobody was looking at.
                //
                // Offline this stays silent for the same reason the two paths
                // below do: the write is queued, not archived. This merge reaches
                // the offline branch through updateLogOp, which does NOT throw
                // when it queues — so without the flag the member was told the
                // rewatch was in their archive while it sat in the queue.
                if (!merged?.queuedOffline) announceToScreenReader('Rewatch added to your archive');
                return;
            }

            const newId = Crypto.randomUUID();
            const payload = {
                id: newId,
                user_id: user.id,
                film_id: log.filmId, film_title: log.title,
                poster_path: log.poster ?? null, year: log.year ? (parseInt(String(log.year)) || null) : null,
                rating: log.rating ?? 0, review: log.review ?? '',
                status: log.status ?? 'watched', is_spoiler: log.isSpoiler ?? false,
                watched_date: log.watchedDate ?? localCalendarDate(),
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
                            // A merge IS a success, and it returns early — so it
                            // needs its own announcement. It used to get one from
                            // the `finally`, which is precisely why that placement
                            // looked harmless: it covered the success paths by
                            // accident while also firing on the failures.
                            //
                            // Gated for the same reason as the merge above: the
                            // network can drop between the duplicate-key response
                            // and this write, and a queued write is not an
                            // archived one.
                            if (!dupMerged?.queuedOffline) announceToScreenReader('Rewatch added to your archive');
                            return;
                        }
                    }
                    // The caller toasts. Doing it here as well produced two
                    // stacked messages for one failure.
                    throw error;
                } else {
                    // The caller toasts. Doing it here as well produced two
                    // stacked messages for one failure.
                    throw error;
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
                    // CONTRACT GUARD, not a live path: addToPhysicalArchive handles
                    // every error itself and never rethrows, so this cannot fire
                    // today and is deliberately untested. It exists so that if that
                    // contract is ever broken, the breakage is reported instead of
                    // silently swallowed here. Do not count it as covered.
                    if (__DEV__) console.error('Failed to auto-sync physical archive', e);

                    if (!isNetworkError(e)) captureError(e, { scope: 'addLogOp.autoSyncPhysicalArchive' });
                }
            }
            // Success, and only here. This announcement used to sit in the
            // `finally` below, which runs on the throw paths too — so a VoiceOver
            // member was told "Film logged to your archive" at the exact moment
            // the log had FAILED, while the screen showed an error.
            //
            // Failure needs no announcement of its own: the error toast is now
            // spoken on both platforms (ToastOverlay announces on iOS, where the
            // live region does not fire). Adding one here would make Android say
            // it twice.
            //
            // The offline branch above does NOT return — it fabricates finalData
            // and falls through to here — so without this guard a member with no
            // signal heard "Archived offline. Will sync when connected." and then
            // "Film logged to your archive", the second contradicting the first
            // and describing something that had not happened. Making the toast
            // speak on iOS is what turned that into two spoken sentences. The
            // toast already tells the truth on both platforms, so this stays
            // silent and lets it.
            if (!queuedOffline) announceToScreenReader('Film logged to your archive');
        } finally {
            set({ _addLogMutex: false });
        }
    }

export const markAsWatchedOp = async (set: SetState, get: GetState, film: any, status: 'watched' | 'rewatched' | 'abandoned' = 'watched') => {
        if (get()._markWatchedMutexes[film.id]) return;
        set(state => ({ _markWatchedMutexes: { ...state._markWatchedMutexes, [film.id]: true } }));

        try {
        const user = useAuthStore.getState().user;
        if (!user) return;
        
        let existingLog = get()._loggedIndex[film.id];
        if (!existingLog) {
            const { data: serverCheck } = await supabase.from('logs').select(LOG_SELECT_COLUMNS).eq('user_id', user.id).eq('film_id', film.id).order('created_at', { ascending: false }).limit(1);
            if (serverCheck && serverCheck.length > 0) existingLog = mapLogRow(serverCheck[0] as any) as unknown as DomainLog;
        }

        if (existingLog) {
            if (existingLog.status === status) return;
            // A step, not the member amending a record — "Record amended" would be
            // the wrong sentence for marking a film watched. Currently unreachable
            // (this op has no callers), fixed anyway so reviving it cannot revive
            // the defect alongside its corrected twin.
            await updateLogOp(set, get, existingLog.id, { status } as Partial<DomainLog>, { silentAnnounce: true });
            return;
        }
        const newLogId = Crypto.randomUUID();
        const payload = {
            id: newLogId,
            user_id: user.id,
            film_id: film.id,
            film_title: film.title ?? film.name ?? 'Untitled',
            poster_path: film.poster_path ?? null,
            year: film.release_date ? (parseInt(film.release_date.slice(0, 4)) || null) : null,
            rating: 0,
            review: '',
            status,
            is_spoiler: false,
            watched_date: localCalendarDate(),
            watched_with: null,
            private_notes: null,
            abandoned_reason: null,
            physical_media: null,
            is_autopsied: false,
            autopsy: null,
            alt_poster: null,
            editorial_header: null,
            drop_cap: false,
            pull_quote: '',
            video_url: null,
            format: 'digital',
            view_count: 1,
            viewing_history: [],
        };
        const { data, error } = await supabase.from('logs').insert([payload]).select().single();
        
        let finalLogId = newLogId;
        let createdAt = new Date().toISOString();

        if (error) {
            // Use shared network error detection
            if (isNetworkError(error)) {
                enqueueMutation({ type: 'mark_watched', payload });
                reelToast('Marked watched offline. Will sync when connected.');
            // Same narrowed test as the add path. This operation currently has no
            // callers, so the loose version could not fire — but a defect left
            // beside its own corrected twin is how the fix gets undone later.
            } else if (isDuplicateKey(error)) {
                // the row already exists (concurrent insert won the
                // logs(user_id, film_id) unique race). Treat as existing — update the
                // status if it differs — instead of throwing and dropping the action.
                const { data: serverRows } = await supabase.from('logs')
                    .select(LOG_SELECT_COLUMNS)
                    .eq('user_id', user.id).eq('film_id', film.id)
                    .order('created_at', { ascending: false }).limit(1);
                if (serverRows && serverRows.length > 0) {
                    const existing = mapLogRow(serverRows[0] as any) as unknown as DomainLog;
                    if (existing.status !== status) {
                        // Same as above: a step, and unreachable today.
                        await updateLogOp(set, get, existing.id, { status } as Partial<DomainLog>, { silentAnnounce: true });
                    }
                    return;
                }
                reelToast.error('Failed to mark as watched — please try again.');
                throw error;
            } else {
                reelToast.error('Failed to mark as watched — please try again.');
                throw error;
            }
        } else {
            finalLogId = data.id;
            createdAt = data.created_at;
        }

        const newLog: DomainLog = {
            id: finalLogId,
            filmId: film.id,
            title: film.title ?? film.name ?? 'Untitled',
            poster: film.poster_path,
            year: film.release_date ? (parseInt(film.release_date.slice(0, 4)) || undefined) : undefined,
            rating: 0,
            review: '',
            status,
            createdAt,
            watchedDate: localCalendarDate(),
            watchedWith: null,
            privateNotes: null,
            abandonedReason: null,
            physicalMedia: null,
            isSpoiler: false,
            isAutopsied: false,
            autopsy: null,
            altPoster: null,
            editorialHeader: null,
            dropCap: false,
            pullQuote: '',
            videoUrl: null,
            format: 'digital',
            viewCount: 1,
            viewingHistory: [],
        };
        set(state => {
            const newLogs = sortLogs([newLog, ...state.logs]);
            const nextIdx = { ...state._loggedIndex };
            nextIdx[film.id] = newLog;
            return { logs: newLogs, _loggedIndex: nextIdx };
        });
        const inWatchlist = get().watchlist.some(w => w.id === film.id);
        if (inWatchlist) get().removeFromWatchlist(film.id);
        
        queryClient.invalidateQueries({ queryKey: ['film', Number(film.id)] });
        } finally {
            set(state => {
                const nextMutexes = { ...state._markWatchedMutexes };
                delete nextMutexes[film.id];
                return { _markWatchedMutexes: nextMutexes };
            });
        }
    }

export const unmarkWatchedOp = async (set: SetState, get: GetState, filmId: number) => {
    const existingLog = get().logs.find(l => l.filmId === filmId);
        if (!existingLog) return;
        if (
            existingLog.rating > 0 || 
            !!existingLog.review?.trim() || 
            !!existingLog.privateNotes?.trim() || 
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
};

export const updateLogOp = async (
    set: SetState,
    get: GetState,
    id: string,
    updates: Partial<DomainLog>,
    /** Set by callers using this as a STEP, so it does not narrate their work. */
    opts?: { silentAnnounce?: boolean },
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
            const { error } = await supabase.from('logs').update(dbUpdates).eq('id', id);
            // Same as addLogOp: a queued edit is not a saved one, and this branch
            // falls through to the announcement below.
            let queuedOffline = false;
            if (error) {
                // Use shared network error detection
                if (isNetworkError(error)) {
                    enqueueMutation({ type: 'update_log', payload: { id, updates: dbUpdates } });
                    // A STEP does not narrate itself, and that includes this
                    // toast — not just the announcement below. Removing a rewatch
                    // offline showed "Saved offline. Will sync when connected."
                    // and then "Rewatch removed…": two messages for one action,
                    // the first using the wrong verb, since the member removed
                    // something rather than saving it. The caller is told it was
                    // queued (below) and says one true, offline-aware thing.
                    if (!opts?.silentAnnounce) reelToast('Saved offline. Will sync when connected.');
                    queuedOffline = true;
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
                        // CONTRACT GUARD — see the identical note in addLogOp above.
                        if (__DEV__) console.error('Failed to auto-sync physical archive on update', e);

                        if (!isNetworkError(e)) captureError(e, { scope: 'updateLogOp.autoSyncPhysicalArchive' });
                    }
                }
            }

            // Editing had NO announcement at all, while filing a new log did —
            // and both end in the same visual "RECORD SEALED" through the same
            // handler. So a VoiceOver member was told when they filed a record and
            // told nothing when they amended one. Same class as the announcement
            // that used to fire on failure: the spoken account of what happened
            // has to match what the screen says.
            //
            // Suppressed when another operation is using this as a step rather
            // than as the member's own edit. removeLogOp undoes a rewatch by
            // calling this, and it says its own, truer thing afterwards — without
            // this flag a member removing a rewatch heard "Record amended" and
            // then "Rewatch removed", the first of which is not what they did.
            // Silent offline too: "Saved offline. Will sync when connected." is
            // already spoken, and "Record amended" would contradict it.
            if (!opts?.silentAnnounce && !queuedOffline) announceToScreenReader('Record amended');
            // Reported so a caller using this as a step can say the true thing.
            // Without it, addLogOp's merge announced "Rewatch added to your
            // archive" while the write was only queued — the same contradiction
            // that was closed for the two non-merge paths and missed here.
            return { queuedOffline };
        } catch (e: unknown) {
            if (!isNetworkError(e)) captureError(e, { scope: 'updateLogOp', logId: id });
            if (originalLog) {
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
        const logToRemove = get().logs.find((l) => l.id === id);
        if (!logToRemove) return;
        
        // Pop history instead of a hard delete
        const history = Array.isArray(logToRemove.viewingHistory) ? logToRemove.viewingHistory : [];
        if (!forceDeleteAll && history.length > 0) {
            const poppedEntry = history[0];
            const remainingHistory = history.slice(1);
            
            const updates: Partial<DomainLog> = {
                watchedDate: poppedEntry.date ?? logToRemove.createdAt ?? localCalendarDate(),
                rating: poppedEntry.rating ?? 0,
                review: poppedEntry.review ?? '',
                status: poppedEntry.status ?? 'watched',
                isSpoiler: poppedEntry.isSpoiler ?? false,
                watchedWith: poppedEntry.watchedWith ?? null,
                privateNotes: poppedEntry.privateNotes ?? null,
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
            };

            try {
                // Silent: this is a STEP in removing a rewatch, not the member
                // amending a record. The toast below says the true thing, and it
                // is now spoken on both platforms.
                const undone = await updateLogOp(set, get, id, updates, { silentAnnounce: true });
                // One message, with the member's own verb. The step no longer
                // says "Saved offline…" over the top of this — they removed a
                // rewatch, they did not save one — but the queued state still has
                // to reach them, so it is said here instead.
                reelToast(undone?.queuedOffline
                    ? 'Rewatch removed. Will sync when connected.'
                    : 'Rewatch removed. Reverted to previous viewing.');
            } catch (e) {
                // Rethrown for the caller to report. updateLog USED to toast its
                // own failures here — this batch removed that, because it and the
                // caller both toasted and the member saw two messages for one
                // failure. handleDelete shows the single one.
                throw e;
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
            set((state) => {
                const newLogs = sortLogs([logToRemove, ...state.logs]);
                const nextIdx = { ...state._loggedIndex };
                if (logToRemove.filmId) {
                    const updated = newLogs.find(l => l.filmId === logToRemove.filmId);
                    if (updated) nextIdx[logToRemove.filmId] = updated as DomainLog;
                }
                return { logs: newLogs, _loggedIndex: nextIdx };
            });
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
