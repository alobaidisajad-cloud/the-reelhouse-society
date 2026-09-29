 
import { tmdb } from '@/src/lib/tmdb';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { useVaultStore } from '@/src/stores/vaultStore';
import { supabase } from '@/src/lib/supabase';
import { captureError } from '@/src/lib/sentry';
import reelToast from '@/src/utils/reelToast';
import { LOG_BUSY } from '@/src/stores/domain/logSlice/helpers/logOperations';
import { isNetworkError } from '@/src/utils/networkError';
import { maybeRequestReview } from '@/src/utils/requestReview';
import { isArchivistPlusTier, isAuteurPlusTier } from '@/src/utils/tier';
import TactileEngine from '@/src/utils/TactileEngine';
import {
  adoptLegacyDrafts, clearDraft, readDraft, writeDraft,
} from '@/src/utils/memberDrafts';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import { localCalendarDate } from '@/src/utils/timeAgo';
import { nav } from '@/src/utils/typedRouter';
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

/** A key with no member in it, never written; read once by `adoptLegacyDrafts`. */
export const DRAFT_KEY = 'reelhouse_log_draft';
/** `null` is UNRATED; a number, 0 included, was filed. Saved with `_v: 2` (see below). */
export const AUTOPSY_INIT: Record<string, number | null> = { story: null, script: null, acting: null, cinematography: null, editing: null, sound: null };

/** A stored autopsy, for the editor. Without `_v` a 0 is unrated: such rows could not file one. */
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

/** Today on the MEMBER's calendar: the shared one, under LogForm's name for it. */
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
    /** Untouched, the note is OMITTED, so a rating edit never carries it away. */
    noteTouched: boolean;
    autopsy: Record<string, number | null>;
    altPoster: string | null;
    editorialHeader: string | null;
    dropCap: boolean;
    pullQuote: string;
}

/** The form, as the record the store is sent: pure, so its rank rules are tested directly. */
export function buildLogPayload(input: LogPayloadInput): Record<string, any> {
    const {
        film, status, rating, review, isSpoiler, date, watchedWith, privateNotes,
        physicalMedia, abandonedReason, isAuteur, isPremium, noteTouched, autopsy,
        altPoster, editorialHeader, dropCap, pullQuote,
    } = input;
    // An autopsy exists iff one score was filed (a 0 counts), from the data
    // alone, never from whether its section is open.
    const ratedAxes = Object.fromEntries(
        Object.entries(autopsy ?? {}).filter(([key, v]) => key !== '_v' && typeof v === 'number')
    ) as Record<string, number>;
    const hasAutopsy = isAuteur && Object.keys(ratedAxes).length > 0;
    // ── Ranked fields: OMITTED when the member cannot edit them, never nulled ──
    // This one payload feeds addLog, updateLog and the rewatch merge, which all
    // write any key that is present, null included: a null would ERASE a lapsed
    // member's own notes, header or autopsy on every edit. Omission is the one
    // "leave it alone". On create it is safe too: every one of these columns is
    // nullable or defaults to false.
    const keep = (canEdit: boolean) => canEdit;
    return {
        filmId: film.id, title: film.title ?? film.name ?? 'Untitled',
        poster: altPoster ?? film.poster_path ?? null,
        year: film.release_date ? parseInt(film.release_date.slice(0, 4)) : undefined,
        rating: status === 'abandoned' ? 0 : rating, review: review.trim(), status, isSpoiler,
        // `||`, not `??`: an empty companion is no companion.
        watchedDate: date, watchedWith: watchedWith.trim() || null,
        abandonedReason: status === 'abandoned' ? abandonedReason : null,

        // Touched only; outside the rank group, as clearing your own is never gated.
        ...(noteTouched ? { privateNotes: privateNotes.trim() } : {}),

        ...(keep(isPremium) ? {
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

    // ── Form state (the web's LogForm has the same fields) ──
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

    // The ranked tools' pictures: up front with the rank, on opening a tool without.
    // `imagesLoaded` lets "none found" speak only once it is true; `imagesFailed`
    // says the pictures could not be asked for, and the tools offer to ask again.
    const [imagesLoaded, setImagesLoaded] = useState(false);
    const [imagesFailed, setImagesFailed] = useState(false);
    const imagesFor = useRef<number | string | null>(null);

    const loadImages = useCallback(() => {
        const id = film?.id;
        if (!id || imagesFor.current === id) return;
        imagesFor.current = id;
        setImagesLoaded(false);
        setImagesFailed(false);
        // Clear the last film's pictures first: the flow outlives the form.
        setAvailablePosters([]);
        setAvailableBackdrops([]);
        tmdb.movieImages(id).then((imgs: any) => {
            // A different film arrived while this one was in flight.
            if (imagesFor.current !== id) return;
            if (imgs?.posters) setAvailablePosters(imgs.posters.slice(0, 20));
            if (imgs?.backdrops) setAvailableBackdrops(imgs.backdrops.slice(0, 10));
            setImagesLoaded(true); // an ANSWER, not a failure, lets "none found" speak
        }).catch((err: unknown) => {
            if (__DEV__) console.warn('[LogModal] image prefetch failed:', err);
            // Allow a later open to try again, rather than a failure being final.
            if (imagesFor.current === id) {
                imagesFor.current = null;
                setImagesFailed(true);
            }
        });
    }, [film?.id]);

    useEffect(() => {
        if (!film?.id) return;
        if (isAuteur || isPremium) loadImages();
    }, [film?.id, isAuteur, isPremium, loadImages]);

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
        // The note is NOT taken from the log: it belongs to the viewing, and it
        // arrives from the Vault in its own effect below — which is also what
        // keeps the field shut until the real note is in hand.
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
        // already carries a companion or physical media. A note opens it too,
        // once the Vault answers — see the effect below.
        setMoreOpen(!!(log.watchedWith || (log.physicalMedia && log.physicalMedia !== 'None')));
        setFilm({ id: log.filmId, title: log.title, poster_path: log.poster, release_date: log.year?.toString() });
        setStep(1);
    }, [editLogId, logs]);

    // The note is the VIEWING's: read from the Vault by the viewing's id, not the log.
    const storeViewingId = editLogId ? (logs.find(l => l.id === editLogId)?.viewingId ?? null) : null;

    // A log cached without its viewing's id asks for it once and stores it, or
    // the form would open EMPTY over a note that exists.
    const [fetchedViewingId, setFetchedViewingId] = useState<string | null>(null);
    const [viewingLookupFailed, setViewingLookupFailed] = useState(false);
    useEffect(() => {
        setFetchedViewingId(null);
        setViewingLookupFailed(false);
        if (!editLogId || storeViewingId) return;
        let live = true;
        (async () => {
            try {
                const { data, error } = await supabase.from('logs').select('viewing_id').eq('id', editLogId).maybeSingle();
                if (!live) return;
                const found = (data as { viewing_id?: string } | null)?.viewing_id ?? null;
                if (error || !found) { setViewingLookupFailed(true); return; }
                setFetchedViewingId(found);
                useFilmStore.setState((s) => {
                    const logs = s.logs.map(l => (l.id === editLogId ? { ...l, viewingId: found } : l));
                    const idx = { ...s._loggedIndex };
                    for (const k of Object.keys(idx)) {
                        if (idx[k as unknown as number]?.id === editLogId) idx[k as unknown as number] = { ...idx[k as unknown as number], viewingId: found };
                    }
                    return { logs, _loggedIndex: idx };
                });
            } catch {
                if (live) setViewingLookupFailed(true);
            }
        })();
        return () => { live = false; };
    }, [editLogId, storeViewingId]);

    const editViewingId = storeViewingId ?? fetchedViewingId;
    const vaultLoaded = useVaultStore(s => (editLogId ? s.loaded[editLogId] === true : false));
    const vaultUnreachable = useVaultStore(s => (editLogId ? s.unreachable[editLogId] === true : false));
    const storedNote = useVaultStore(s => (editViewingId ? (s.notes[editViewingId] ?? '') : ''));
    const loadVault = useVaultStore(s => s.loadForLog);
    const [noteHydratedFor, setNoteHydratedFor] = useState<string | null>(null);
    const [noteTouched, setNoteTouched] = useState(false);

    useEffect(() => {
        if (!editLogId) return;
        void loadVault(editLogId);
    }, [editLogId, loadVault]);

    useEffect(() => {
        // Both are needed: the Vault's answer, and the name of the viewing to
        // read it by. Either missing, and the field stays shut.
        if (!editLogId || !vaultLoaded || !editViewingId) return;
        if (noteHydratedFor === editLogId) return;
        setPrivateNotes(storedNote);
        setNoteHydratedFor(editLogId);
        setNoteTouched(false);
        if (storedNote) setMoreOpen(true);
    }, [editLogId, vaultLoaded, editViewingId, storedNote, noteHydratedFor]);

    // A new log, or a rewatch, begins with an empty note — and an empty note
    // that has not been touched is never sent, so nothing is cleared by it.
    useEffect(() => {
        if (editLogId) return;
        setNoteHydratedFor(null);
        setNoteTouched(false);
    }, [editLogId, film?.id]);

    /**
     * Take the note back from inside the form — for a member whose rank has
     * ended, who can no longer edit it but may always remove it. Answers
     * whether it was only queued, so the screen can say the true thing.
     */
    const removeVaultNote = useCallback(async (): Promise<{ queuedOffline: boolean } | null> => {
        if (!editLogId || !editViewingId) return null;
        const res = await useVaultStore.getState().dropNote(editLogId, editViewingId);
        setPrivateNotes('');
        setNoteTouched(false);
        return res;
    }, [editLogId, editViewingId]);

    /** The note field opens for a new log or rewatch, or once an edit's note has arrived. */
    const noteReady = !editLogId || noteHydratedFor === editLogId;

    // Restore this member's draft (it holds PRIVATE notes, so it is keyed by
    // member in `memberDrafts`, never shared by whoever holds the phone).
    useEffect(() => {
        if (editLogId) return;
        adoptLegacyDrafts(user?.id);
        const held = readDraft<Record<string, unknown>>(user?.id, 'log');
        if (held) {
            try {
                const parsed = held.data as any;
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
    }, [user?.id]);

    // ── Draft auto-save ── on the film's fields, not the object (a new object
    // on every setFilm would restart the debounce).
    const filmId = film?.id;
    const filmTitle = film?.title;
    const filmName = film?.name;
    const filmPoster = film?.poster_path;
    const filmYear = film?.release_date;
    const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** The beat after a seal; cleared on unmount, as it navigates. */
    const sealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    /** Work deferred until animations settle, kept so unmount can `.cancel()` it. */
    const pendingTasks = useRef<{ cancel: () => void }[]>([]);
    const deferUntilIdle = useCallback((fn: () => void, opts?: { cancelOnUnmount?: boolean }) => {
        const task = InteractionManager.runAfterInteractions(fn);
        // The review prompt opts out: it is meant to run after this screen is gone.
        if (opts?.cancelOnUnmount !== false) pendingTasks.current.push(task);
        return task;
    }, []);

    useEffect(() => () => {
        if (sealTimerRef.current) clearTimeout(sealTimerRef.current);
        pendingTasks.current.forEach(t => t.cancel());
        pendingTasks.current = [];
    }, []);

    useEffect(() => {
        if (editLogId || !filmId) return;
        if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
        draftTimerRef.current = setTimeout(() => {
            if (review.trim() || rating > 0 || privateNotes.trim()) {
                writeDraft(user?.id, 'log', ({
                    filmId, review, rating, privateNotes,
                    filmTitle, filmName, 
                    filmPoster, filmYear
                }));
            } else {
                clearDraft(user?.id, 'log');
            }
        }, 1000);
        return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
    }, [review, rating, privateNotes, filmId, filmTitle, filmName, filmPoster, filmYear, editLogId, user?.id]);

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
                physicalMedia, abandonedReason, isAuteur, isPremium, noteTouched, autopsy,
                altPoster, editorialHeader, dropCap, pullQuote,
            });
            const isNewEntry = !(isEditing && editLogId);
            if (isEditing && editLogId) { await updateLog(editLogId, logData); }
            else { await addLog(logData); }
            clearDraft(user?.id, 'log');
            TactileEngine.success();
            // One brass beat, "RECORD SEALED", then dismiss (never after unmount).
            setSealed(true);
            if (sealTimerRef.current) clearTimeout(sealTimerRef.current);
            sealTimerRef.current = setTimeout(() => {
                deferUntilIdle(() => {
                    nav.back();
                    // A NEW entry only (an edit adds no film). Nested, so the
                    // dismissal ends before an OS modal can rise; `logs` is the
                    // snapshot before the save, hence +1. It gates itself.
                    if (isNewEntry) {
                        // Not cancelled on unmount: it runs after this screen is gone.
                        deferUntilIdle(() => {
                            void maybeRequestReview(logs.length + 1);
                        }, { cancelOnUnmount: false });
                    }
                });
            }, 650);
            return;
        } catch (err: unknown) {
            // The core write's failures surface here; a network one is queued, not a defect.
            if (!isNetworkError(err)) {
                captureError(err, { scope: 'useLogFlow.handleLog', isEditing, filmId: film?.id });
            }
            // ONE toast, chosen here; the reason travels as a CODE, never matched prose.
            reelToast.error(
                (err as { code?: string })?.code === LOG_BUSY
                    ? 'Still sealing the previous record — one moment.'
                    : 'The record could not be sealed. Try again.'
            );
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!editLogId) return;
        try {
            await removeLog(editLogId);
            TactileEngine.warn();
            deferUntilIdle(() => {
                nav.back();
            });
        } catch {
            reelToast.error('Failed to delete log.');
        }
    };

    // Explicit draft discard — clears MMKV and resets form state
    const discardDraft = useCallback(() => {
        // The draft is the one unsent NEW record: an edit has none to discard.
        if (!editLogId) clearDraft(user?.id, 'log');
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
        // `user?.id` is the draft's KEY: without it, after a change of member,
        // the wrong member's draft would be discarded. (Setters are stable.)
    }, [user?.id, editLogId]);

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
        privateNotes,
        // Every change is a touch, which is what makes the note travel.
        setPrivateNotes: useCallback((next: string) => {
            setNoteTouched(true);
            setPrivateNotes(next);
        }, []),
        /** The Vault has answered for this log; the note field may open. */
        noteReady,
        /** Take the note back — never gated. */
        removeVaultNote,
        /** The Vault, or this log's viewing id, cannot be had: said, not waited on. */
        noteUnreachable: !!editLogId && noteHydratedFor !== editLogId
            && ((vaultUnreachable && !vaultLoaded) || (viewingLookupFailed && !editViewingId)),
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
        imagesLoaded, imagesFailed, loadImages,
        isEditing,
        editLogId, // a rope's way back from an edit: the log, not an empty form
        selectFilm,
        handleLog,
        handleDelete,
        discardDraft,
        toggleList,
        lists,
        hasUnsavedChanges: review.trim().length > 0 || rating > 0 || privateNotes.trim().length > 0,
    };
}
