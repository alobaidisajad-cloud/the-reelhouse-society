 
import { tmdb } from '@/src/lib/tmdb';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { captureError } from '@/src/lib/sentry';
import reelToast from '@/src/utils/reelToast';
import { isNetworkError } from '@/src/utils/networkError';
import { maybeRequestReview } from '@/src/utils/requestReview';
import { isArchivistPlusTier, isAuteurPlusTier } from '@/src/utils/tier';
import TactileEngine from '@/src/utils/TactileEngine';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import { storage } from '../stores/mmkv-storage';
import { localCalendarDate } from '@/src/utils/timeAgo';
export interface LogSearchResult {
    id: number;
    title?: string;
    name?: string;
    poster_path?: string | null;
    release_date?: string;
    media_type?: string;
    vote_average?: number;
}

export interface SelectedFilm {
    id: number;
    title?: string;
    name?: string;
    poster_path?: string | null;
    release_date?: string;
}

export const DRAFT_KEY = 'reelhouse_log_draft';
// AUTOPSY LAW: `null` means UNRATED; a number — including a deliberate 0 —
// means the user filed that score. The saved JSONB carries only rated axes
// plus a `_v: 2` marker so genuine zeros are forever distinguishable from
// legacy phantom rows (the old editor wrote 0 for untouched axes).
export const AUTOPSY_INIT: Record<string, number | null> = { story: null, script: null, acting: null, cinematography: null, editing: null, sound: null };

/** Normalize a stored autopsy JSONB into editor state. Legacy rows (no _v)
 *  treat 0 as unrated — the old editor could not express a deliberate zero. */
export function loadAutopsyForEdit(raw: unknown): Record<string, number | null> {
    const out: Record<string, number | null> = { ...AUTOPSY_INIT };
    if (!raw || typeof raw !== 'object') return out;
    const obj = raw as Record<string, unknown>;
    const isV2 = typeof obj._v === 'number' && obj._v >= 2;
    for (const key of Object.keys(AUTOPSY_INIT)) {
        const v = obj[key];
        if (typeof v === 'number' && (isV2 || v > 0)) out[key] = v;
    }
    return out;
}
export const ABANDONED_REASONS = ['Too Slow', 'Too Upsetting', 'Life Got in the Way', "I'll Return Someday", 'Lost the Plot', 'Wrong Mood'];
export const AUTOPSY_LABELS: Record<string, string> = {
    story: 'STORY', script: 'SCRIPT/DIALOGUE', acting: 'ACTING/CHAR',
    cinematography: 'CINEMATOGRAPHY', editing: 'EDITING/PACING', sound: 'SOUND DESIGN',
};
export const PHYSICAL_OPTIONS = ['None', 'DVD', 'Blu-Ray', '4K UHD', 'VHS', 'Film Print'];
export const RATING_LABELS: Record<number, string> = {
    0.5: 'Unwatchable', 1: 'Unwatchable', 1.5: 'Not Great', 2: 'Not Great',
    2.5: 'Fine', 3: 'Fine', 3.5: 'Really Good', 4: 'Really Good',
    4.5: 'Masterpiece', 5: 'Masterpiece',
};

/**
 * Today (or an offset day) on the MEMBER's calendar.
 *
 * Now a re-export of the shared implementation so the store layer, the importer and
 * this hook cannot drift apart — they were already answering "what day is it?"
 * three different ways. LogForm imports this name for the TODAY/YESTERDAY chips.
 */
export { localCalendarDate as getLocalDateString };

// Returns a user-facing block message, or null if the log can be submitted.
export function validateLogSubmission(
    status: 'watched' | 'rewatched' | 'abandoned',
    rating: number,
    review: string,
    abandonedReason: string,
): string | null {
    if (status !== 'abandoned' && rating === 0 && !review.trim()) {
        return 'A rating or critique is required to seal the record.';
    }
    if (status === 'abandoned' && !abandonedReason) {
        return 'Please specify a reason for abandoning this film.';
    }
    return null;
}

export interface LogPayloadInput {
    film: SelectedFilm;
    status: 'watched' | 'rewatched' | 'abandoned';
    rating: number;
    review: string;
    isSpoiler: boolean;
    date: string;
    watchedWith: string;
    privateNotes: string;
    physicalMedia: string;
    abandonedReason: string;
    isAuteur: boolean;
    isPremium: boolean;
    autopsy: Record<string, number | null>;
    altPoster: string | null;
    editorialHeader: string | null;
    dropCap: boolean;
    pullQuote: string;
}

// Pure transform from form state -> the log record sent to the store.
// Extracted from handleLog so tier-gating and field-stripping rules are
// directly testable without rendering the hook.
export function buildLogPayload(input: LogPayloadInput): Record<string, any> {
    const {
        film, status, rating, review, isSpoiler, date, watchedWith, privateNotes,
        physicalMedia, abandonedReason, isAuteur, isPremium, autopsy,
        altPoster, editorialHeader, dropCap, pullQuote,
    } = input;
    // An autopsy exists if and only if the user filed at least one score.
    // Derived purely from data — no UI open/close state can phantom-save an
    // untouched autopsy or silently discard a filled one. A deliberate 0 is a
    // rated axis; null (untouched) axes are simply absent from the payload.
    const ratedAxes = Object.fromEntries(
        Object.entries(autopsy ?? {}).filter(([key, v]) => key !== '_v' && typeof v === 'number')
    ) as Record<string, number>;
    const hasAutopsy = isAuteur && Object.keys(ratedAxes).length > 0;
    // ── Tier-gated fields: OMITTED on edit, never nulled ──────────────────────
    //
    // This payload feeds BOTH addLog and updateLog (:351-352), and updateLogOp
    // strips only `undefined` (logOperations.ts:574-577) — so a `null` here was
    // written straight through to the row. The edit form pre-loads the real
    // values first (:248-258). The result: a member whose tier resolves below the
    // gate — the admin, or anyone whose subscription lapsed — silently ERASED
    // their own private notes, physical media, editorial header, drop cap, pull
    // quote, alt poster and autopsy every time they edited an existing log.
    // Not hidden. Destroyed.
    //
    // The rule is CAPABILITY, on every path:
    //   • can edit    -> key present. A premium member clearing a field still
    //                    writes the clear (null), exactly as before.
    //   • cannot edit -> key OMITTED, so nothing can be overwritten.
    //
    // Omitting on CREATE is safe, and that is a live-schema fact rather than an
    // assumption: drop_cap and is_autopsied are nullable with DEFAULT false, and
    // private_notes / editorial_header / pull_quote / alt_poster / physical_media
    // are all nullable. An omitted key therefore lands on exactly the value the old
    // code wrote explicitly. (pull_quote becomes NULL instead of '', which mapLogRow
    // already normalises back to '' on read.)
    //
    // Omitting is also what makes the REWATCH path safe, which an edit-only rule
    // missed entirely. applyRewatchMerge guards every field with `!== undefined`
    // (logOperations.ts:179-205) — but a non-premium payload sent null/false/''
    // for physicalMedia, dropCap and pullQuote, and those three are NOT wrapped in
    // safeOverride, so they overwrote the stored values. Sending nothing at all is
    // the only signal that path reads as "leave it alone".
    const keep = (canEdit: boolean) => canEdit;

    return {
        filmId: film.id, title: film.title ?? film.name ?? 'Untitled',
        poster: altPoster ?? film.poster_path ?? null,
        year: film.release_date ? parseInt(film.release_date.slice(0, 4)) : undefined,
        rating: status === 'abandoned' ? 0 : rating, review: review.trim(), status, isSpoiler,
        watchedDate: date, watchedWith: watchedWith.trim() || null,  // intentional || — empty string should be null
        abandonedReason: status === 'abandoned' ? abandonedReason : null,

        ...(keep(isPremium) ? {
            privateNotes: isPremium ? (privateNotes.trim() || null) : null,
            physicalMedia: isPremium && physicalMedia !== 'None' ? physicalMedia : null,
            editorialHeader: isPremium ? editorialHeader : null,
            dropCap: isPremium ? dropCap : false,
            pullQuote: isPremium ? pullQuote.trim() : '',
        } : {}),

        ...(keep(isAuteur) ? {
            isAutopsied: hasAutopsy,
            autopsy: hasAutopsy ? { _v: 2, ...ratedAxes } : null,
            altPoster: isAuteur ? altPoster : null,
        } : {}),
    };
}

export function useLogFlow() {
    const router = useRouter();
    const params = useLocalSearchParams<{
        filmId?: string; editLogId?: string; filmTitle?: string; filmPoster?: string; filmYear?: string;
    }>();
    const { user, isAuthenticated } = useAuthStore();
    const { logs, lists, addLog, updateLog, removeLog, addFilmToList, removeFilmFromList, _loggedIndex } = useFilmStore();

    // ── Tier gating ──
    const isAuteur = isAuteurPlusTier(user);
    const isPremium = isArchivistPlusTier(user);

    // ── Step state ──
    const [step, setStep] = useState(params.filmId ? 1 : 0);

    // ── Film state ──
    const [film, setFilm] = useState<SelectedFilm | null>(params.filmId ? {
        id: parseInt(params.filmId), title: params.filmTitle ?? '',
        poster_path: params.filmPoster ?? null, release_date: params.filmYear ?? '',
    } : null);

    // ── Detect rewatch mode: film already logged and NOT editing ──
    const previousLog = useMemo(() => {
        if (params.editLogId || !film?.id) return null;
        return _loggedIndex[film.id] ?? null;
    }, [film?.id, params.editLogId, _loggedIndex]);
    const isRewatchMode = !!previousLog;

    // ── Form state (matches web LogForm.tsx L37-60) ──
    const [status, setStatus] = useState<'watched' | 'rewatched' | 'abandoned'>(isRewatchMode ? 'rewatched' : 'watched');
    const [rating, setRating] = useState(0);
    const [review, setReview] = useState('');
    const [isSpoiler, setIsSpoiler] = useState(false);
    const [abandonedReason, setAbandonedReason] = useState('');
    const [date, setDate] = useState(localCalendarDate());
    const [watchedWith, setWatchedWith] = useState('');
    const [privateNotes, setPrivateNotes] = useState('');
    const [physicalMedia, setPhysicalMedia] = useState('None');
    const [autopsy, setAutopsy] = useState<Record<string, number | null>>({ ...AUTOPSY_INIT });
    const [altPoster, setAltPoster] = useState<string | null>(null);
    const [editorialHeader, setEditorialHeader] = useState<string | null>(null);
    const [dropCap, setDropCap] = useState(false);
    const [pullQuote, setPullQuote] = useState('');
    const [autopsyOpen, setAutopsyOpen] = useState(false);
    // The LOGISTICS drawer starts closed so a fresh log's fast path is
    // pick → status → rate → write → seal. Edit mode re-opens it below
    // whenever there's already logistics content to reveal.
    const [moreOpen, setMoreOpen] = useState(false);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    // One-beat "RECORD SEALED" confirmation before the modal dismisses.
    const [sealed, setSealed] = useState(false);

    // ── Premium image data ──
    const [availablePosters, setAvailablePosters] = useState<{ file_path: string }[]>([]);
    const [availableBackdrops, setAvailableBackdrops] = useState<{ file_path: string }[]>([]);

    const editLogId = params.editLogId || null;
    const isEditing = !!editLogId;

    // ── Fetch images for premium features ──
    useEffect(() => {
        if (!film?.id) return;
        if (isAuteur || isPremium) {
            tmdb.movieImages(film.id).then((imgs: any) => {
                if (!imgs) return;
                if (imgs.posters) setAvailablePosters(imgs.posters.slice(0, 20));
                if (imgs.backdrops) setAvailableBackdrops(imgs.backdrops.slice(0, 10));
            }).catch((err: unknown) => { if (__DEV__) console.warn('[LogModal] image prefetch failed:', err); });
        }
    }, [film?.id, isAuteur, isPremium]);

    // ── Populate form from existing log in edit mode ──
    useEffect(() => {
        // Reset all form state first to prevent stale data flash
        // when editLogId changes without unmounting (e.g. edit log A → edit log B)
        setRating(0);
        setReview('');
        setStatus('watched');
        setIsSpoiler(false);
        setAbandonedReason('');
        setDate(localCalendarDate());
        setWatchedWith('');
        setPrivateNotes('');
        setPhysicalMedia('None');
        setAutopsy({ ...AUTOPSY_INIT });
        setAltPoster(null);
        setEditorialHeader(null);
        setDropCap(false);
        setPullQuote('');
        setAutopsyOpen(false);
        setMoreOpen(false);

        if (!editLogId) return;
        const log = logs.find(l => l.id === editLogId);
        if (!log) return;
        setStatus((log.status ?? 'watched') as 'watched' | 'rewatched' | 'abandoned');
        setRating(log.rating ?? 0);
        setReview(log.review ?? '');
        setIsSpoiler(log.isSpoiler ?? false);
        setDate(log.watchedDate?.slice(0, 10) ?? localCalendarDate());
        setWatchedWith(log.watchedWith ?? '');
        setPrivateNotes(log.privateNotes ?? '');
        setPhysicalMedia(log.physicalMedia ?? 'None');
        setAbandonedReason(log.abandonedReason ?? '');
        let loadedAutopsy: Record<string, number | null> = { ...AUTOPSY_INIT };
        if (log.autopsy) {
            try { loadedAutopsy = loadAutopsyForEdit(typeof log.autopsy === 'string' ? JSON.parse(log.autopsy) : log.autopsy); }
            catch (err: unknown) { loadedAutopsy = { ...AUTOPSY_INIT }; }
        }
        setAutopsy(loadedAutopsy);
        setAltPoster(log.altPoster ?? null);
        setEditorialHeader(log.editorialHeader ?? null);
        setDropCap(log.dropCap ?? false);
        setPullQuote(log.pullQuote ?? '');
        // Open the autopsy section when the log actually carries rated scores.
        setAutopsyOpen(Object.values(loadedAutopsy).some(v => typeof v === 'number'));
        // Never hide populated data: open the LOGISTICS drawer when the log
        // already carries a companion, private notes, or physical media.
        setMoreOpen(!!(log.watchedWith || log.privateNotes || (log.physicalMedia && log.physicalMedia !== 'None')));
        setFilm({ id: log.filmId, title: log.title, poster_path: log.poster, release_date: log.year?.toString() });
        setStep(1);
    }, [editLogId, logs]);

    // ── Draft restore ──
    useEffect(() => {
        if (editLogId) return;
        const raw = storage.getString(DRAFT_KEY);
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                // If opening modal fresh, auto-restore the film and draft state
                if (!film?.id && parsed.filmId) {
                    setFilm({
                        id: parsed.filmId,
                        title: parsed.filmTitle,
                        name: parsed.filmName,
                        poster_path: parsed.filmPoster,
                        release_date: parsed.filmYear
                    });
                    setStep(1);
                    if (parsed.review) setReview(parsed.review);
                    if (parsed.rating) setRating(parsed.rating);
                    if (parsed.privateNotes) setPrivateNotes(parsed.privateNotes);
                } 
                // If already on the film, just hydrate the fields
                else if (parsed.filmId === film?.id) {
                    if (parsed.review) setReview(parsed.review);
                    if (parsed.rating) setRating(parsed.rating);
                    if (parsed.privateNotes) setPrivateNotes(parsed.privateNotes);
                }
            } catch (err: unknown) { if (__DEV__) console.warn('[LogModal] draft restore failed:', err); }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Draft auto-save ──
    // Depend on stable scalar fields, not the entire `film` object reference.
    // The film object changes identity on every setFilm() call, which would reset the
    // 1-second debounce timer. Extracting scalars ensures the timer only resets when
    // actual content changes (review, rating, privateNotes, or the selected film).
    const filmId = film?.id;
    const filmTitle = film?.title;
    const filmName = film?.name;
    const filmPoster = film?.poster_path;
    const filmYear = film?.release_date;
    const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (editLogId || !filmId) return;
        if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
        draftTimerRef.current = setTimeout(() => {
            if (review.trim() || rating > 0 || privateNotes.trim()) {
                storage.set(DRAFT_KEY, JSON.stringify({ 
                    filmId, review, rating, privateNotes,
                    filmTitle, filmName, 
                    filmPoster, filmYear
                }));
            } else {
                storage.delete(DRAFT_KEY);
            }
        }, 1000);
        return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
    }, [review, rating, privateNotes, filmId, filmTitle, filmName, filmPoster, filmYear, editLogId]);

    // ── DRAFT HANDLERS ──
    const selectFilm = (f: LogSearchResult) => {
        setFilm({ id: f.id, title: f.title, name: f.name, poster_path: f.poster_path, release_date: f.release_date }); 
        setStep(1);
        TactileEngine.selection();
    };

    // ── SUBMIT LOG ──
    const handleLog = async () => {
        if (!user) { reelToast.error('Identification required to file a record.'); return; }
        if (!film) { reelToast.error('No film selected.'); return; }
        const blockReason = validateLogSubmission(status, rating, review, abandonedReason);
        if (blockReason) { reelToast.error(blockReason); return; }
        setSubmitting(true);
        try {
            const logData = buildLogPayload({
                film, status, rating, review, isSpoiler, date, watchedWith, privateNotes,
                physicalMedia, abandonedReason, isAuteur, isPremium, autopsy,
                altPoster, editorialHeader, dropCap, pullQuote,
            });
            const isNewEntry = !(isEditing && editLogId);
            if (isEditing && editLogId) { await updateLog(editLogId, logData); }
            else { await addLog(logData); }
            storage.delete(DRAFT_KEY);
            TactileEngine.success();
            // Hold on a single brass beat — "RECORD SEALED" — then dismiss.
            setSealed(true);
            setTimeout(() => {
                InteractionManager.runAfterInteractions(() => {
                    router.back();
                    // Only a NEW entry counts — an edit adds no film. The nested wait
                    // lets the dismissal finish before an OS modal can appear over it;
                    // router.back() isn't awaitable, so the outer pass isn't enough.
                    // `logs` is the pre-await snapshot, hence +1. maybeRequestReview
                    // gates itself (>=5 logs, 90-day cooldown, 6 lifetime) and never throws.
                    if (isNewEntry) {
                        InteractionManager.runAfterInteractions(() => {
                            void maybeRequestReview(logs.length + 1);
                        });
                    }
                });
            }, 650);
            return;
        } catch (err: unknown) {
            // #88 — filing a log is the app's core write and had zero telemetry.
            // addLogOp/updateLogOp have no top-level catch, so this is where a
            // failed write actually surfaces. Network failures are expected and
            // already queued offline, so only genuine defects are reported.
            if (!isNetworkError(err)) {
                captureError(err, { scope: 'useLogFlow.handleLog', isEditing, filmId: film?.id });
            }
            reelToast.error('The record could not be sealed. Try again.');
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!editLogId) return;
        try {
            await removeLog(editLogId);
            TactileEngine.warn();
            InteractionManager.runAfterInteractions(() => {
                router.back();
            });
        } catch {
            reelToast.error('Failed to delete log.');
        }
    };

    // Explicit draft discard — clears MMKV and resets form state
    const discardDraft = useCallback(() => {
        storage.delete(DRAFT_KEY);
        setRating(0);
        setReview('');
        setStatus('watched');
        setIsSpoiler(false);
        setAbandonedReason('');
        setDate(localCalendarDate());
        setWatchedWith('');
        setPrivateNotes('');
        setPhysicalMedia('None');
        setAutopsy({ ...AUTOPSY_INIT });
        setAltPoster(null);
        setEditorialHeader(null);
        setDropCap(false);
        setPullQuote('');
        setAutopsyOpen(false);
        setFilm(null);
        setStep(0);
    }, []);

    const toggleList = (listId: string) => {
        if (!film?.id) return;
        const list = lists.find(l => l.id === listId);
        if (!list) return;
        const isIn = list.films.some(f => f.id === film.id);
        if (isIn) removeFilmFromList(listId, film.id);
        else addFilmToList(listId, { id: film.id, title: film.title || '', poster_path: film.poster_path });
        TactileEngine.selection();
    };

    return {
        isAuthenticated,
        isAuteur,
        isPremium,
        step, setStep,
        film, setFilm,
        isRewatchMode, previousLog,
        status, setStatus,
        rating, setRating,
        review, setReview,
        isSpoiler, setIsSpoiler,
        abandonedReason, setAbandonedReason,
        date, setDate,
        watchedWith, setWatchedWith,
        privateNotes, setPrivateNotes,
        physicalMedia, setPhysicalMedia,
        autopsy, setAutopsy,
        altPoster, setAltPoster,
        editorialHeader, setEditorialHeader,
        dropCap, setDropCap,
        pullQuote, setPullQuote,
        autopsyOpen, setAutopsyOpen,
        moreOpen, setMoreOpen,
        calendarOpen, setCalendarOpen,
        showDeleteConfirm, setShowDeleteConfirm,
        submitting,
        sealed,
        availablePosters, availableBackdrops,
        isEditing,
        selectFilm,
        handleLog,
        handleDelete,
        discardDraft,
        toggleList,
        lists,
        hasUnsavedChanges: review.trim().length > 0 || rating > 0 || privateNotes.trim().length > 0,
    };
}
