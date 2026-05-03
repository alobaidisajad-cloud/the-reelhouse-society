// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { InteractionManager } from 'react-native';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { storage } from '../stores/mmkv-storage';
import * as Haptics from 'expo-haptics';
import { tmdb } from '@/src/lib/tmdb';
import reelToast from '@/src/utils/reelToast';
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
export const AUTOPSY_INIT: Record<string, number> = { story: 0, script: 0, acting: 0, cinematography: 0, editing: 0, sound: 0 };
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

export function useLogFlow() {
    const router = useRouter();
    const params = useLocalSearchParams<{
        filmId?: string; editLogId?: string; filmTitle?: string; filmPoster?: string; filmYear?: string;
    }>();
    const { user, isAuthenticated } = useAuthStore();
    const { logs, lists, addLog, updateLog, removeLog, addFilmToList, removeFilmFromList, _loggedIndex } = useFilmStore();

    // ── Tier gating ──
    const isAuteur = user?.role === 'auteur';
    const isPremium = user?.role === 'archivist' || isAuteur;

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
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [watchedWith, setWatchedWith] = useState('');
    const [privateNotes, setPrivateNotes] = useState('');
    const [physicalMedia, setPhysicalMedia] = useState('None');
    const [autopsy, setAutopsy] = useState<Record<string, number>>({ ...AUTOPSY_INIT });
    const [altPoster, setAltPoster] = useState<string | null>(null);
    const [editorialHeader, setEditorialHeader] = useState<string | null>(null);
    const [dropCap, setDropCap] = useState(false);
    const [pullQuote, setPullQuote] = useState('');
    const [autopsyOpen, setAutopsyOpen] = useState(false);
    const [isAutopsied, setIsAutopsied] = useState(false);
    const [moreOpen, setMoreOpen] = useState(true);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [submitting, setSubmitting] = useState(false);

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
        // #5 AUDIT FIX: Reset all form state first to prevent stale data flash
        // when editLogId changes without unmounting (e.g. edit log A → edit log B)
        setRating(0);
        setReview('');
        setStatus('watched');
        setIsSpoiler(false);
        setAbandonedReason('');
        setDate(new Date().toISOString().slice(0, 10));
        setWatchedWith('');
        setPrivateNotes('');
        setPhysicalMedia('None');
        setAutopsy({ ...AUTOPSY_INIT });
        setAltPoster(null);
        setEditorialHeader(null);
        setDropCap(false);
        setPullQuote('');
        setIsAutopsied(false);
        setAutopsyOpen(false);

        if (!editLogId) return;
        const log = logs.find(l => l.id === editLogId);
        if (!log) return;
        setStatus((log.status ?? 'watched') as 'watched' | 'rewatched' | 'abandoned');
        setRating(log.rating ?? 0);
        setReview(log.review ?? '');
        setIsSpoiler(log.isSpoiler ?? false);
        setDate(log.watchedDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
        setWatchedWith(log.watchedWith ?? '');
        setPrivateNotes(log.privateNotes ?? '');
        setPhysicalMedia(log.physicalMedia ?? 'None');
        setAbandonedReason(log.abandonedReason ?? '');
        if (log.autopsy) {
            try { setAutopsy(typeof log.autopsy === 'string' ? JSON.parse(log.autopsy) : log.autopsy); }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            catch (err: unknown) { setAutopsy({ ...AUTOPSY_INIT }); }
        }
        setAltPoster(log.altPoster ?? null);
        setEditorialHeader(log.editorialHeader ?? null);
        setDropCap(log.dropCap ?? false);
        setPullQuote(log.pullQuote ?? '');
        setIsAutopsied(log.isAutopsied ?? false);
        setAutopsyOpen(log.isAutopsied ?? false);
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
    // S3-04 FIX: Depend on stable scalar fields, not the entire `film` object reference.
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
        Haptics.selectionAsync();
    };

    // ── SUBMIT LOG ──
    const handleLog = async () => {
        if (!user) { reelToast('Identification required to file a record.'); return; }
        if (!film) { reelToast('No film selected.'); return; }
        if (status !== 'abandoned' && rating === 0 && !review.trim()) {
            reelToast('A rating or critique is required to seal the record.');
            return;
        }
        if (status === 'abandoned' && !abandonedReason) {
            reelToast('Please specify a reason for abandoning this film.');
            return;
        }
        setSubmitting(true);
        try {
            const logData: Partial<import('@/src/types').FilmLog> = {
                filmId: film.id, title: film.title ?? film.name ?? 'Untitled',
                poster: altPoster ?? film.poster_path ?? null,
                year: film.release_date ? parseInt(film.release_date.slice(0, 4)) : undefined,
                rating: status === 'abandoned' ? 0 : rating, review: review.trim(), status, isSpoiler,
                watchedDate: date, watchedWith: watchedWith.trim() || null,  // intentional || — empty string should be null
                privateNotes: isPremium ? (privateNotes.trim() || null) : null,
                abandonedReason: status === 'abandoned' ? abandonedReason : null,
                physicalMedia: isPremium && physicalMedia !== 'None' ? physicalMedia : null,
                isAutopsied: isAuteur && isAutopsied,
                autopsy: isAuteur && isAutopsied ? JSON.stringify(autopsy) : null,
                altPoster: isAuteur ? altPoster : null,
                editorialHeader: isPremium ? editorialHeader : null,
                dropCap: isPremium ? dropCap : false,
                pullQuote: isPremium ? pullQuote.trim() : '',
            };
            if (isEditing && editLogId) { await updateLog(editLogId, logData); }
            else { await addLog(logData); }
            storage.delete(DRAFT_KEY);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            InteractionManager.runAfterInteractions(() => {
                router.back();
            });
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (err: unknown) { reelToast.error('The record could not be sealed. Try again.'); }
        setSubmitting(false);
    };

    const handleDelete = async () => {
        if (!editLogId) return;
        try {
            await removeLog(editLogId);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            InteractionManager.runAfterInteractions(() => {
                router.back();
            });
        } catch {
            reelToast.error('Failed to delete log.');
        }
    };

    // #4 AUDIT FIX: Explicit draft discard — clears MMKV and resets form state
    const discardDraft = useCallback(() => {
        storage.delete(DRAFT_KEY);
        setRating(0);
        setReview('');
        setStatus('watched');
        setIsSpoiler(false);
        setAbandonedReason('');
        setDate(new Date().toISOString().slice(0, 10));
        setWatchedWith('');
        setPrivateNotes('');
        setPhysicalMedia('None');
        setAutopsy({ ...AUTOPSY_INIT });
        setAltPoster(null);
        setEditorialHeader(null);
        setDropCap(false);
        setPullQuote('');
        setIsAutopsied(false);
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
        Haptics.selectionAsync();
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
        isAutopsied, setIsAutopsied,
        moreOpen, setMoreOpen,
        calendarOpen, setCalendarOpen,
        showDeleteConfirm, setShowDeleteConfirm,
        submitting,
        availablePosters, availableBackdrops,
        isEditing,
        selectFilm,
        handleLog,
        handleDelete,
        discardDraft,
        toggleList,
        lists
    };
}
