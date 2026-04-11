/**
 * Log Modal — Full-screen logging flow.
 *
 * Pixel-perfect native port of web LogModal.tsx (194 lines) + LogForm.tsx (590 lines)
 * + LogModalSearch.tsx + LogDateSelector.tsx + LogReviewEditor.tsx
 * + EditorialDesk.tsx + AuteurToolkit.tsx + LogActionRow.tsx
 *
 * Route: /log-modal?filmId=123&editLogId=xxx&filmTitle=xxx&filmPoster=xxx&filmYear=xxx
 *
 * Two steps:
 *   Step 0 — Search (if no filmId param)
 *   Step 1 — Log form (rating, review, date, premium features)
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
    Image, Dimensions, Platform, KeyboardAvoidingView, Alert, FlatList,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { tmdb } from '@/src/lib/tmdb';
import { useFilmStore } from '@/src/stores/films';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts } from '@/src/theme/theme';
import { ReelRating } from '@/src/components/Decorative';
import NitrateCalendar from '@/src/components/NitrateCalendar';
import AutopsyGauge from '@/src/components/AutopsyGauge';
import {
    Search, X, Clock, Eye, History, Lock, Archive,
    ChevronDown, ChevronUp, Trash2, Check, Sparkles, Star,
} from 'lucide-react-native';

const DRAFT_KEY = 'reelhouse_log_draft';
const AUTOPSY_INIT: Record<string, number> = { story: 0, script: 0, acting: 0, cinematography: 0, editing: 0, sound: 0 };
const ABANDONED_REASONS = ['Too Slow', 'Too Upsetting', 'Life Got in the Way', "I'll Return Someday", 'Lost the Plot', 'Wrong Mood'];
const AUTOPSY_LABELS: Record<string, string> = {
    story: 'STORY', script: 'SCRIPT/DIALOGUE', acting: 'ACTING/CHAR',
    cinematography: 'CINEMATOGRAPHY', editing: 'EDITING/PACING', sound: 'SOUND DESIGN',
};
const PHYSICAL_OPTIONS = ['None', 'DVD', 'Blu-Ray', '4K UHD', 'VHS', 'Film Print'];
const RATING_LABELS: Record<number, string> = {
    0.5: 'Unwatchable', 1: 'Unwatchable', 1.5: 'Not Great', 2: 'Not Great',
    2.5: 'Fine', 3: 'Fine', 3.5: 'Really Good', 4: 'Really Good',
    4.5: 'Masterpiece', 5: 'Masterpiece',
};

export default function LogModalScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{
        filmId?: string; editLogId?: string; filmTitle?: string; filmPoster?: string; filmYear?: string;
    }>();
    const { user, isAuthenticated } = useAuthStore();
    const { logs, lists, addLog, updateLog, removeLog, addFilmToList, removeFilmFromList } = useFilmStore();

    // ── Tier gating ──
    const isPremium = user?.role === 'archivist' || user?.role === 'auteur';
    const isAuteur = user?.role === 'auteur';

    // ── Step state ──
    const [step, setStep] = useState(params.filmId ? 1 : 0);

    // ── Search state (Step 0) ──
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);
    const [searchType, setSearchType] = useState('');
    const [searchContext, setSearchContext] = useState('');
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Film state ──
    const [film, setFilm] = useState<any>(params.filmId ? {
        id: parseInt(params.filmId), title: params.filmTitle || '',
        poster_path: params.filmPoster || null, release_date: params.filmYear || '',
    } : null);

    // ── Form state (matches web LogForm.tsx L37-60) ──
    const [status, setStatus] = useState<'watched' | 'rewatched' | 'abandoned'>('watched');
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
    const [availablePosters, setAvailablePosters] = useState<Array<{ file_path: string }>>([]);
    const [availableBackdrops, setAvailableBackdrops] = useState<Array<{ file_path: string }>>([]);

    const editLogId = params.editLogId || null;
    const isEditing = !!editLogId;

    // ── Fetch images for premium features ──
    useEffect(() => {
        if (!film?.id) return;
        if (isAuteur || isPremium) {
            tmdb.movieImages(film.id).then((imgs: any) => {
                if (imgs?.posters) setAvailablePosters(imgs.posters.slice(0, 20));
                if (imgs?.backdrops) setAvailableBackdrops(imgs.backdrops.slice(0, 10));
            }).catch(() => {});
        }
    }, [film?.id, isAuteur, isPremium]);

    // ── Populate form from existing log in edit mode ──
    useEffect(() => {
        if (!editLogId) return;
        const log = logs.find(l => l.id === editLogId);
        if (!log) return;
        setStatus(log.status || 'watched');
        setRating(log.rating || 0);
        setReview(log.review || '');
        setIsSpoiler(log.isSpoiler || false);
        setDate(log.watchedDate?.slice(0, 10) || new Date().toISOString().slice(0, 10));
        setWatchedWith(log.watchedWith || '');
        setPrivateNotes(log.privateNotes || '');
        setPhysicalMedia(log.physicalMedia || 'None');
        setAbandonedReason(log.abandonedReason || '');
        if (log.autopsy) {
            try { setAutopsy(typeof log.autopsy === 'string' ? JSON.parse(log.autopsy) : log.autopsy); }
            catch { setAutopsy({ ...AUTOPSY_INIT }); }
        }
        setAltPoster(log.altPoster || null);
        setEditorialHeader(log.editorialHeader || null);
        setDropCap(log.dropCap || false);
        setPullQuote(log.pullQuote || '');
        setIsAutopsied(log.isAutopsied || false);
        setAutopsyOpen(log.isAutopsied || false);
        setFilm({ id: log.filmId, title: log.title, poster_path: log.poster, release_date: log.year?.toString() });
        setStep(1);
    }, [editLogId, logs]);

    // ── Draft restore ──
    useEffect(() => {
        if (editLogId) return;
        AsyncStorage.getItem(DRAFT_KEY).then(raw => {
            if (!raw) return;
            try {
                const draft = JSON.parse(raw);
                if (draft.filmId && film?.id && draft.filmId !== film.id) return;
                if (draft.review) setReview(draft.review);
                if (draft.rating) setRating(draft.rating);
                if (draft.privateNotes) setPrivateNotes(draft.privateNotes);
            } catch {}
        });
    }, []);

    // ── Draft auto-save ──
    useEffect(() => {
        if (editLogId || !film?.id) return;
        const timer = setTimeout(() => {
            if (review || rating > 0 || privateNotes) {
                AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ filmId: film.id, review, rating, privateNotes }));
            }
        }, 1000);
        return () => clearTimeout(timer);
    }, [review, rating, privateNotes, film?.id, editLogId]);

    // ── SEARCH HANDLER ──
    const handleSearch = useCallback((q: string) => {
        setQuery(q);
        if (!q.trim()) { setResults([]); setSearching(false); return; }
        setSearching(true);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(async () => {
            try {
                const res = await tmdb.search(q, 1);
                const filtered = (res.results || []).filter((r: any) => r.media_type !== 'person').slice(0, 8);
                setResults(filtered);
                setSearchType(res.searchType || 'exact');
                setSearchContext(res.matchedContext || '');
            } catch { setResults([]); }
            finally { setSearching(false); }
        }, 400);
    }, []);

    const selectFilm = (f: any) => {
        setFilm(f); setStep(1); setQuery(''); setResults([]);
        Haptics.selectionAsync();
    };

    // ── SUBMIT LOG ──
    const handleLog = async () => {
        if (!user) { Alert.alert('Sign in required'); return; }
        if (status !== 'abandoned' && rating === 0 && !review.trim()) {
            Alert.alert('Rate or review', 'Please add a rating or review to log this film.');
            return;
        }
        setSubmitting(true);
        try {
            const logData: any = {
                filmId: film.id, title: film.title || film.name || 'Untitled',
                poster: altPoster || film.poster_path || null,
                year: film.release_date ? parseInt(film.release_date.slice(0, 4)) : null,
                rating, review: review.trim(), status, isSpoiler,
                watchedDate: date, watchedWith: watchedWith.trim() || null,
                privateNotes: isPremium ? (privateNotes.trim() || null) : null,
                abandonedReason: status === 'abandoned' ? abandonedReason : null,
                physicalMedia: isPremium && physicalMedia !== 'None' ? physicalMedia : null,
                isAutopsied: isAuteur && isAutopsied,
                autopsy: isAuteur && isAutopsied ? autopsy : null,
                altPoster: isAuteur ? altPoster : null,
                editorialHeader: isPremium ? editorialHeader : null,
                dropCap: isPremium ? dropCap : false,
                pullQuote: isPremium ? pullQuote.trim() : '',
            };
            if (isEditing && editLogId) { await updateLog(editLogId, logData); }
            else { await addLog(logData); }
            AsyncStorage.removeItem(DRAFT_KEY);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
        } catch { Alert.alert('Error', 'Failed to save log.'); }
        setSubmitting(false);
    };

    const handleDelete = () => {
        if (!editLogId) return;
        removeLog(editLogId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        router.back();
    };

    const toggleList = (listId: string) => {
        if (!film?.id) return;
        const list = lists.find(l => l.id === listId);
        if (!list) return;
        const isIn = list.films.some(f => f.id === film.id);
        if (isIn) removeFilmFromList(listId, film.id);
        else addFilmToList(listId, { id: film.id, title: film.title || '', poster_path: film.poster_path });
        Haptics.selectionAsync();
    };

    const yesterday = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }, []);
    const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

    // ── Not authenticated ──
    if (!isAuthenticated) {
        return (
            <View style={[st.root, { justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.parchment }}>Sign in to log films</Text>
                <TouchableOpacity style={st.signInBtn} onPress={() => { router.back(); router.push('/login' as any); }}>
                    <Text style={st.signInBtnText}>SIGN IN</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // ════════════════════════════════════════
    //   R E N D E R
    // ════════════════════════════════════════
    return (
        <View style={st.root}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                {/* Header */}
                <View style={st.header}>
                    <View>
                        {isEditing && <View style={st.editBadge}><Text style={st.editBadgeText}>EDITING</Text></View>}
                        <Text style={st.headerTitle}>{step === 0 ? 'Log a Film' : (film?.title || 'Log')}</Text>
                    </View>
                    <TouchableOpacity onPress={() => router.back()} style={st.closeBtn} activeOpacity={0.7}>
                        <X size={16} color={colors.fog} />
                        <Text style={st.closeBtnText}>CLOSE</Text>
                    </TouchableOpacity>
                </View>

                {/* ════ STEP 0: SEARCH ════ */}
                {step === 0 && (
                    <Animated.View entering={FadeIn.duration(200)} style={st.searchStep}>
                        <View style={st.searchWrap}>
                            <Search size={16} color={colors.fog} style={st.searchIcon} />
                            <TextInput
                                style={st.searchInput}
                                placeholder="Search for a film..."
                                placeholderTextColor={colors.fog}
                                value={query}
                                onChangeText={handleSearch}
                                autoFocus
                                returnKeyType="search"
                            />
                        </View>
                        {searching && (
                            <View style={st.searchingWrap}><Text style={st.searchingText}>TRANSMITTING QUERY...</Text></View>
                        )}
                        {results.length > 0 && searchType === 'person' && (
                            <View style={st.searchBadgeRow}>
                                <Sparkles size={8} color={colors.sepia} strokeWidth={1.5} />
                                <Text style={[st.searchBadge, { color: colors.sepia }]}>ACTOR/DIRECTOR MATCH: {searchContext.toUpperCase()}</Text>
                            </View>
                        )}
                        {results.length > 0 && searchType === 'typo' && (
                            <View style={st.searchBadgeRow}>
                                <Sparkles size={8} color={colors.flicker} strokeWidth={1.5} />
                                <Text style={[st.searchBadge, { color: colors.flicker }]}>FUZZY RESCUE: {searchContext.toUpperCase()}</Text>
                            </View>
                        )}
                        <FlatList
                            data={results}
                            keyExtractor={r => String(r.id)}
                            style={st.searchResults}
                            contentContainerStyle={st.searchResultsContent}
                            renderItem={({ item: r }) => (
                                <TouchableOpacity style={st.resultRow} onPress={() => selectFilm(r)} activeOpacity={0.7}>
                                    {r.poster_path && <Image source={{ uri: tmdb.poster(r.poster_path, 'w92') }} style={st.resultPoster} />}
                                    <View style={st.resultFlex}>
                                        <Text style={st.resultTitle}>{r.title || r.name}</Text>
                                        <View style={st.resultMetaRow}>
                                            <Text style={st.resultMeta}>{r.release_date?.slice(0, 4)} · {r.vote_average?.toFixed(1)}</Text>
                                            <Star size={8} color={colors.sepia} fill={colors.sepia} />
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            )}
                        />
                        {!searching && query.length > 0 && results.length === 0 && (
                            <View style={st.noResultsWrap}>
                                <Text style={st.noResultsText}>No films found for "{query}"</Text>
                            </View>
                        )}
                    </Animated.View>
                )}

                {/* ════ STEP 1: LOG FORM ════ */}
                {step === 1 && film && (
                    <ScrollView style={st.formScroll} contentContainerStyle={st.formContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                        {/* DELETE ZONE */}
                        {isEditing && !showDeleteConfirm && (
                            <TouchableOpacity style={st.deleteBtn} onPress={() => setShowDeleteConfirm(true)} activeOpacity={0.7}>
                                <Trash2 size={14} color={colors.danger} />
                                <Text style={st.deleteBtnText}>DELETE THIS ENTIRE LOG</Text>
                            </TouchableOpacity>
                        )}
                        {showDeleteConfirm && (
                            <View style={st.deleteConfirm}>
                                <Text style={st.deleteConfirmText}>DELETE THIS LOG? THIS CANNOT BE UNDONE.</Text>
                                <View style={st.deleteConfirmRow}>
                                    <TouchableOpacity style={st.deleteYes} onPress={handleDelete}><Text style={st.deleteBtnLabel}>CONFIRM DELETE</Text></TouchableOpacity>
                                    <TouchableOpacity style={st.deleteNo} onPress={() => setShowDeleteConfirm(false)}><Text style={[st.deleteBtnLabel, { color: colors.bone }]}>CANCEL</Text></TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {/* Film Header */}
                        <View style={st.filmHeader}>
                            {film.poster_path && (
                                <View>
                                    <Image source={{ uri: tmdb.poster(altPoster || film.poster_path, 'w185') }} style={st.poster} />
                                    {altPoster && <View style={st.altBadge}><Text style={st.altBadgeText}>ALT</Text></View>}
                                </View>
                            )}
                            <View style={st.filmInfoCol}>
                                <Text style={st.filmTitle}>{film.title || film.name}</Text>
                                <Text style={st.filmYear}>{film.release_date?.slice(0, 4) || '—'}</Text>
                            </View>
                        </View>

                        {/* STATUS */}
                        <View style={st.sec}>
                            <Text style={st.secLabel}>STATUS</Text>
                            <View style={st.statusRow}>
                                {(['watched', 'rewatched', 'abandoned'] as const).map(s => (
                                    <TouchableOpacity key={s} style={[st.statusBtn, status === s && st.statusActive]} onPress={() => { setStatus(s); Haptics.selectionAsync(); }} activeOpacity={0.7}>
                                        {s === 'watched' && <Eye size={14} color={status === s ? colors.ink : colors.fog} />}
                                        {s === 'rewatched' && <History size={14} color={status === s ? colors.ink : colors.fog} />}
                                        {s === 'abandoned' && <X size={14} color={status === s ? colors.ink : colors.fog} />}
                                        <Text style={[st.statusText, status === s && { color: colors.ink }]}>{s.toUpperCase()}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* ABANDONED REASON */}
                        {status === 'abandoned' && (
                            <View style={st.sec}>
                                <Text style={st.secLabel}>REASON</Text>
                                <View style={st.tagRow}>
                                    {ABANDONED_REASONS.map(r => (
                                        <TouchableOpacity key={r} style={[st.tag, abandonedReason === r && st.tagActive]} onPress={() => setAbandonedReason(r)} activeOpacity={0.7}>
                                            <Text style={[st.tagText, abandonedReason === r && { color: colors.ink }]}>{r}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}

                        {/* RATING */}
                        {status !== 'abandoned' && (
                            <View style={st.sec}>
                                <View style={st.ratingHeader}>
                                    <Text style={st.secLabel}>YOUR RATING</Text>
                                    {rating > 0 && (
                                        <Text style={st.ratingValue}>{rating % 1 === 0 ? rating : rating.toFixed(1)}<Text style={st.ratingMax}>/5</Text></Text>
                                    )}
                                </View>
                                <View style={st.ratingBody}>
                                    <ReelRating rating={rating} size={44} onChange={(v: number) => { setRating(v === rating ? 0 : v); Haptics.impactAsync(Number.isInteger(v) ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light); }} />
                                    <View style={st.ratingFooter}>
                                        {rating > 0 ? <Text style={st.ratingLabel}>{RATING_LABELS[rating] || ''}</Text> : <View />}
                                        <Text style={st.ratingHint}>TAP LEFT HALF FOR ½ STARS</Text>
                                    </View>
                                </View>
                            </View>
                        )}

                        {/* MORE DETAILS Toggle */}
                        <TouchableOpacity style={st.moreToggle} onPress={() => setMoreOpen(!moreOpen)} activeOpacity={0.7}>
                            <View style={st.moreToggleInner}>
                                {moreOpen ? <ChevronUp size={14} color={colors.sepia} /> : <ChevronDown size={14} color={colors.sepia} />}
                                <Text style={st.moreText}>{moreOpen ? 'COLLAPSE DETAILS' : 'MORE DETAILS'}</Text>
                            </View>
                            {!moreOpen && <Text style={st.moreHint}>DATE · COMPANION · MEDIA · NOTES</Text>}
                        </TouchableOpacity>

                        {/* EXPANDED DETAILS */}
                        {moreOpen && (
                            <Animated.View entering={FadeInDown.duration(200)}>

                                {/* Date Watched */}
                                <View style={st.sec}>
                                    <View style={st.secLabelRow}>
                                        <Clock size={10} color={colors.sepia} />
                                        <Text style={st.secLabel}>DATE WATCHED</Text>
                                    </View>
                                    <View style={st.quickDateRow}>
                                        <TouchableOpacity style={[st.qDateBtn, date === todayStr && st.qDateActive]} onPress={() => { setDate(todayStr); setCalendarOpen(false); }}>
                                            <Text style={[st.qDateText, date === todayStr && { color: colors.ink }]}>TODAY</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[st.qDateBtn, date === yesterday && st.qDateActive]} onPress={() => { setDate(yesterday); setCalendarOpen(false); }}>
                                            <Text style={[st.qDateText, date === yesterday && { color: colors.ink }]}>YESTERDAY</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <TouchableOpacity style={st.dateDisplay} onPress={() => setCalendarOpen(!calendarOpen)} activeOpacity={0.7}>
                                        <Text style={st.dateText}>{new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</Text>
                                        <Text style={[st.dateToggle, calendarOpen && { color: colors.sepia }]}>{calendarOpen ? '▲ CLOSE' : '▼ CHANGE'}</Text>
                                    </TouchableOpacity>
                                    {calendarOpen && <View style={st.calendarWrap}><NitrateCalendar value={date} onChange={(v) => { setDate(v); setCalendarOpen(false); }} /></View>}
                                </View>

                                {/* Watched With */}
                                <View style={st.sec}>
                                    <Text style={st.secLabel}>WATCHED WITH</Text>
                                    <TextInput style={st.input} placeholder="A name, a memory, or @username..." placeholderTextColor={colors.fog} value={watchedWith} onChangeText={setWatchedWith} maxLength={60} />
                                </View>

                                {/* Review Editor */}
                                <View style={st.sec}>
                                    <Text style={st.secLabel}>REVIEW (OPTIONAL)</Text>
                                    <TextInput style={st.reviewInput} placeholder="Write your thoughts as if typing on a manuscript..." placeholderTextColor={colors.fog} value={review} onChangeText={setReview} multiline maxLength={2000} textAlignVertical="top" />
                                    <View style={st.reviewFooter}>
                                        <TouchableOpacity style={st.spoilerRow} onPress={() => setIsSpoiler(!isSpoiler)}>
                                            <View style={[st.cbox, isSpoiler && st.cboxOn]}>{isSpoiler && <Check size={10} color={colors.ink} />}</View>
                                            <Text style={st.spoilerText}>CONTAINS SPOILERS</Text>
                                        </TouchableOpacity>
                                        <Text style={[st.charCount, review.length > 1800 && { color: colors.flicker }]}>{review.length}/2000</Text>
                                    </View>
                                </View>

                                {/* Editorial Desk (Archivist+) */}
                                {isPremium && review.length > 0 && (
                                    <View style={st.editDesk}>
                                        <Sparkles size={10} color={colors.sepia} strokeWidth={1.5} />
                                        <Text style={st.editDeskTitle}>The Editorial Desk</Text>
                                        <View style={st.editRow}>
                                            <Text style={st.editLabel}>STYLIZED DROP CAP</Text>
                                            <TouchableOpacity style={st.spoilerRow} onPress={() => setDropCap(!dropCap)}>
                                                <View style={[st.cbox, dropCap && st.cboxSepia]}>{dropCap && <Check size={10} color={colors.ink} />}</View>
                                                <Text style={st.editToggleText}>ENABLE</Text>
                                            </TouchableOpacity>
                                        </View>
                                        <View>
                                            <Text style={st.editLabel}>PULL QUOTE</Text>
                                            <TextInput style={st.pullQuoteInput} placeholder="Highlight a memorable line..." placeholderTextColor={colors.fog} value={pullQuote} onChangeText={setPullQuote} maxLength={120} />
                                        </View>
                                        <View>
                                            <Text style={st.editLabel}>ARTICLE HEADER (STILL)</Text>
                                            {availableBackdrops.length > 0 ? (
                                                <FlatList horizontal data={[{ file_path: '__none__' }, ...availableBackdrops]} showsHorizontalScrollIndicator={false} keyExtractor={p => p.file_path} contentContainerStyle={{ gap: 8 }}
                                                    renderItem={({ item: p }) => p.file_path === '__none__' ? (
                                                        <TouchableOpacity onPress={() => setEditorialHeader(null)} style={[st.stillThumb, editorialHeader === null && st.stillActive]}>
                                                            <Text style={[st.stillNone, editorialHeader === null && { color: colors.ink }]}>NONE</Text>
                                                        </TouchableOpacity>
                                                    ) : (
                                                        <TouchableOpacity onPress={() => setEditorialHeader(p.file_path)}>
                                                            <Image source={{ uri: tmdb.backdrop(p.file_path, 'w300') }} style={[st.stillImg, editorialHeader === p.file_path && st.stillImgActive, editorialHeader && editorialHeader !== p.file_path && { opacity: 0.4 }]} />
                                                        </TouchableOpacity>
                                                    )}
                                                />
                                            ) : <Text style={st.noData}>No stills found.</Text>}
                                        </View>
                                    </View>
                                )}

                                {/* Auteur Toolkit */}
                                <View style={[st.auteurBox, !isAuteur && st.auteurLocked]} pointerEvents={isAuteur ? 'auto' : 'box-none'}>
                                    <TouchableOpacity style={st.auteurHead} onPress={() => { if (!isAuteur) { router.push('/membership' as any); return; } setAutopsyOpen(!autopsyOpen); setIsAutopsied(!autopsyOpen); }} activeOpacity={0.7}>
                                        <Text style={st.auteurHeadText}>{autopsyOpen ? '[-] HIDE DEEP AUTOPSY' : '[+] PERFORM DEEP AUTOPSY'}</Text>
                                        {!isAuteur && <View style={st.upgradeLockRow}><Lock size={10} color={colors.bloodReel} /><Text style={st.upgradeLink}>UPGRADE</Text></View>}
                                    </TouchableOpacity>
                                    {autopsyOpen && isAuteur && (
                                        <Animated.View entering={FadeInDown.duration(200)} style={st.autopContent}>
                                            <View>
                                                <Text style={st.editLabel}>THE AUTOPSY ENGINE (1-10)</Text>
                                                {Object.keys(autopsy).map(axis => (
                                                    <View key={axis} style={st.sliderRow}>
                                                        <Text style={st.sliderLabel}>{AUTOPSY_LABELS[axis] || axis.toUpperCase()}</Text>
                                                        <View style={st.sliderTrack}>
                                                            {[0,1,2,3,4,5,6,7,8,9,10].map(v => (
                                                                <TouchableOpacity key={v} onPress={() => setAutopsy({ ...autopsy, [axis]: v })} style={[st.sliderSeg, v <= autopsy[axis] && st.sliderSegOn]} />
                                                            ))}
                                                        </View>
                                                        <Text style={st.sliderVal}>{autopsy[axis] || '-'}</Text>
                                                    </View>
                                                ))}
                                            </View>
                                            <AutopsyGauge autopsy={autopsy} />
                                            <View>
                                                <Text style={st.editLabel}>CURATORIAL CONTROL (ALT POSTER)</Text>
                                                {availablePosters.length > 0 ? (
                                                    <FlatList horizontal data={[{ file_path: '__default__' }, ...availablePosters]} showsHorizontalScrollIndicator={false} keyExtractor={p => p.file_path} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                                                        renderItem={({ item: p }) => p.file_path === '__default__' ? (
                                                            <TouchableOpacity onPress={() => setAltPoster(null)} style={[st.pThumb, altPoster === null && st.pThumbActive]}>
                                                                <Text style={[st.pDefault, altPoster === null && { color: colors.ink }]}>DEFAULT</Text>
                                                            </TouchableOpacity>
                                                        ) : (
                                                            <TouchableOpacity onPress={() => setAltPoster(p.file_path)}>
                                                                <Image source={{ uri: tmdb.poster(p.file_path, 'w92') }} style={[st.pImg, altPoster === p.file_path && st.pImgActive, altPoster && altPoster !== p.file_path && { opacity: 0.4 }]} />
                                                            </TouchableOpacity>
                                                        )}
                                                    />
                                                ) : <Text style={st.noData}>No alternative posters found on TMDB.</Text>}
                                            </View>
                                        </Animated.View>
                                    )}
                                </View>

                                {/* Physical Media */}
                                <View style={st.sec}>
                                    <View style={st.secLabelRow}>
                                        <Archive size={10} color={colors.sepia} />
                                        <Text style={st.secLabel}>THE PHYSICAL ARCHIVE</Text>
                                    </View>
                                    <View style={[st.tagRow, !isPremium && st.premiumLocked]} pointerEvents={isPremium ? 'auto' : 'none'}>
                                        {PHYSICAL_OPTIONS.map(opt => (
                                            <TouchableOpacity key={opt} style={[st.tag, physicalMedia === opt && st.tagActive]} onPress={() => setPhysicalMedia(opt)} activeOpacity={0.7}>
                                                <Text style={[st.tagText, physicalMedia === opt && { color: colors.ink }]}>{opt}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    {!isPremium && (
                                        <TouchableOpacity style={st.upgradeRow} onPress={() => router.push('/membership' as any)} activeOpacity={0.7}>
                                            <Lock size={10} color={colors.sepia} /><Text style={st.upgradeRowText}>UNLOCK WITH ARCHIVIST</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>

                                {/* Private Notes */}
                                <View style={st.sec}>
                                    <View style={st.secLabelRow}>
                                        <Lock size={10} color={colors.sepia} />
                                        <Text style={st.secLabel}>PRIVATE NOTES (THE CUTTING ROOM FLOOR)</Text>
                                    </View>
                                    {isPremium ? (
                                        <TextInput style={[st.reviewInput, { minHeight: 80 }]} placeholder="Notes only you can see..." placeholderTextColor={colors.fog} value={privateNotes} onChangeText={setPrivateNotes} multiline maxLength={1000} textAlignVertical="top" />
                                    ) : (
                                        <View style={st.lockedBox}>
                                            <Lock size={20} color={colors.sepia} />
                                            <TouchableOpacity onPress={() => router.push('/membership' as any)}>
                                                <Text style={st.lockedText}>UNLOCK WITH ARCHIVIST</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>
                            </Animated.View>
                        )}

                        {/* ADD TO STACK */}
                        {lists.length > 0 && (
                            <View style={st.sec}>
                                <Text style={st.secLabel}>ADD TO STACK</Text>
                                <FlatList horizontal data={lists} showsHorizontalScrollIndicator={false} keyExtractor={l => l.id} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                                    renderItem={({ item: list }) => {
                                        const isIn = list.films.some(f => f.id === film.id);
                                        return (
                                            <TouchableOpacity style={[st.listChip, isIn && st.listChipOn]} onPress={() => toggleList(list.id)} activeOpacity={0.7}>
                                                {isIn && <Check size={12} color={colors.ink} />}
                                                <Text style={[st.listChipText, isIn && { color: colors.ink }]} numberOfLines={1}>{list.title}</Text>
                                            </TouchableOpacity>
                                        );
                                    }}
                                />
                            </View>
                        )}

                        {/* SUBMIT */}
                        <View style={st.submitRow}>
                            <TouchableOpacity style={[st.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleLog} disabled={submitting} activeOpacity={0.8}>
                                <Text style={st.submitText}>{submitting ? 'SAVING...' : (isEditing ? 'Save Changes' : 'Log This Film')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={st.cancelBtn} onPress={() => router.back()} activeOpacity={0.7}>
                                <Text style={st.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                )}
            </KeyboardAvoidingView>
        </View>
    );
}

// ════════════════════════════════════════
const st = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.soot },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.ash },
    editBadge: { backgroundColor: colors.bloodReel, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 2, alignSelf: 'flex-start', marginBottom: 4 },
    editBadgeText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: '#fff' },
    headerTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.parchment },
    closeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8 },
    closeBtnText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.fog },
    signInBtn: { marginTop: 20, backgroundColor: colors.sepia, borderRadius: 2, paddingVertical: 14, paddingHorizontal: 28 },
    signInBtnText: { fontFamily: fonts.uiBold, fontSize: 11, letterSpacing: 2, color: colors.ink },

    // Search
    searchStep: { flex: 1, paddingHorizontal: 20 },
    searchWrap: { marginTop: 12, position: 'relative' },
    searchIcon: { position: 'absolute', left: 12, top: 14, zIndex: 1 },
    searchInput: { backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.ash, borderRadius: 4, paddingLeft: 38, paddingRight: 12, paddingVertical: 12, fontFamily: fonts.sub, fontSize: 14, color: colors.parchment },
    searchingWrap: { alignItems: 'center', paddingVertical: 20 },
    searchingText: { fontFamily: fonts.ui, fontSize: 10, color: colors.sepia, letterSpacing: 3 },
    searchBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    searchBadge: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.5 },
    searchResults: { marginTop: 8 },
    searchResultsContent: { gap: 8, paddingBottom: 40 },
    resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.ash, borderRadius: 4, padding: 10 },
    resultPoster: { width: 36, height: 54, borderRadius: 2 },
    resultFlex: { flex: 1 },
    resultTitle: { fontFamily: fonts.sub, fontSize: 14, color: colors.parchment },
    resultMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    resultMeta: { fontFamily: fonts.ui, fontSize: 9, color: colors.fog, letterSpacing: 1.5 },
    noResultsWrap: { alignItems: 'center', paddingVertical: 40 },
    noResultsText: { fontFamily: fonts.sub, fontSize: 13, color: colors.fog },

    // Form
    formScroll: { flex: 1 },
    formContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 80 },
    sec: { marginBottom: 20 },
    secLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.sepia, marginBottom: 8 },
    secLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
    input: { backgroundColor: 'rgba(10,7,3,0.8)', borderWidth: 1, borderColor: colors.ash, borderRadius: 4, padding: 12, fontFamily: fonts.sub, fontSize: 13, color: colors.parchment },
    filmHeader: { flexDirection: 'row', gap: 16, marginBottom: 24 },
    filmInfoCol: { flex: 1 },
    poster: { width: 100, height: 150, borderRadius: 3 },
    altBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: colors.sepia, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2 },
    altBadgeText: { fontFamily: fonts.ui, fontSize: 7, color: colors.ink, letterSpacing: 1 },
    filmTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.parchment, lineHeight: 22 },
    filmYear: { fontFamily: fonts.ui, fontSize: 9, color: colors.fog, letterSpacing: 2, marginTop: 4 },
    statusRow: { flexDirection: 'row', gap: 8 },
    statusBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderWidth: 1, borderColor: colors.ash, borderRadius: 4 },
    statusActive: { backgroundColor: colors.sepia, borderColor: colors.sepia },
    statusText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.5, color: colors.fog },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    tag: { paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.ash, borderRadius: 3 },
    tagActive: { backgroundColor: colors.flicker, borderColor: colors.flicker },
    tagText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.fog },

    // Rating
    ratingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    ratingValue: { fontFamily: fonts.display, fontSize: 18, color: colors.flicker },
    ratingMax: { fontSize: 10, color: colors.fog },
    ratingBody: { alignItems: 'center', gap: 8 },
    ratingFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
    ratingLabel: { fontFamily: fonts.ui, fontSize: 9, color: colors.sepia, letterSpacing: 2 },
    ratingHint: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1.5, color: colors.fog, opacity: 0.5 },

    // More Toggle
    moreToggle: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.ash, borderBottomWidth: 1, borderBottomColor: colors.ash, marginBottom: 16 },
    moreToggleInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    moreText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.sepia },
    moreHint: { fontFamily: fonts.ui, fontSize: 8, color: colors.fog, letterSpacing: 1, marginTop: 4 },

    // Date
    quickDateRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
    qDateBtn: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.ash, borderRadius: 3 },
    qDateActive: { backgroundColor: colors.sepia, borderColor: colors.sepia },
    qDateText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.fog },
    dateDisplay: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(10,7,3,0.8)', borderWidth: 1, borderColor: colors.ash, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 10 },
    dateText: { fontFamily: fonts.sub, fontSize: 13, color: colors.parchment },
    dateToggle: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.fog },
    calendarWrap: { marginTop: 8 },

    // Review
    reviewInput: { backgroundColor: 'rgba(10,7,3,0.8)', borderWidth: 1, borderColor: colors.ash, borderRadius: 4, padding: 12, fontFamily: fonts.body, fontSize: 14, color: colors.parchment, minHeight: 120, lineHeight: 22, letterSpacing: 0.2 },
    reviewFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
    spoilerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    cbox: { width: 16, height: 16, borderWidth: 1, borderColor: colors.ash, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
    cboxOn: { backgroundColor: colors.bloodReel, borderColor: colors.bloodReel },
    cboxSepia: { backgroundColor: colors.sepia, borderColor: colors.sepia },
    spoilerText: { fontFamily: fonts.ui, fontSize: 9, color: colors.fog, letterSpacing: 1 },
    charCount: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.fog },

    // Editorial
    editDesk: { padding: 16, borderWidth: 1, borderColor: colors.sepia, borderRadius: 6, backgroundColor: 'rgba(196,150,26,0.05)', gap: 16, marginBottom: 20 },
    editDeskTitle: { fontFamily: fonts.display, fontSize: 14, color: colors.sepia },
    editRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    editLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.bone, marginBottom: 8 },
    editToggleText: { fontFamily: fonts.ui, fontSize: 9, color: colors.fog },
    pullQuoteInput: { backgroundColor: 'rgba(10,7,3,0.8)', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.sepia, borderRadius: 4, padding: 12, fontFamily: fonts.sub, fontSize: 13, fontStyle: 'italic', color: colors.parchment },
    stillThumb: { width: 80, height: 45, backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.ash, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
    stillActive: { backgroundColor: colors.sepia, borderColor: colors.sepia, borderWidth: 2 },
    stillNone: { fontFamily: fonts.ui, fontSize: 8, color: colors.fog },
    stillImg: { width: 80, height: 45, borderRadius: 2, borderWidth: 1, borderColor: 'transparent' },
    stillImgActive: { borderWidth: 2, borderColor: colors.sepia },
    noData: { fontFamily: fonts.body, fontSize: 11, color: colors.fog },

    // Auteur
    auteurBox: { padding: 16, borderWidth: 1, borderColor: colors.bloodReel, borderRadius: 6, backgroundColor: 'rgba(107,26,10,0.05)', marginBottom: 20 },
    auteurLocked: { opacity: 0.5 },
    auteurHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    auteurHeadText: { fontFamily: fonts.display, fontSize: 12, color: colors.bloodReel },
    upgradeLockRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    upgradeLink: { fontFamily: fonts.ui, fontSize: 9, color: colors.bloodReel, textDecorationLine: 'underline' },
    autopContent: { gap: 20, marginTop: 16 },
    sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    sliderLabel: { width: 90, fontFamily: fonts.ui, fontSize: 8, letterSpacing: 0.5, color: colors.fog },
    sliderTrack: { flex: 1, flexDirection: 'row', gap: 2, height: 20 },
    sliderSeg: { flex: 1, backgroundColor: colors.ash, borderRadius: 1, height: 20 },
    sliderSegOn: { backgroundColor: colors.bloodReel },
    sliderVal: { width: 20, textAlign: 'right', fontFamily: fonts.sub, fontSize: 12, color: colors.bone },
    pThumb: { width: 44, height: 66, backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.ash, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
    pThumbActive: { backgroundColor: colors.sepia, borderColor: colors.sepia, borderWidth: 2 },
    pDefault: { fontFamily: fonts.ui, fontSize: 7, color: colors.fog },
    pImg: { width: 44, height: 66, borderRadius: 2, borderWidth: 1, borderColor: 'transparent' },
    pImgActive: { borderWidth: 2, borderColor: colors.bloodReel },

    // Physical / Locked
    premiumLocked: { opacity: 0.4 },
    upgradeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    upgradeRowText: { fontFamily: fonts.ui, fontSize: 9, color: colors.sepia, letterSpacing: 1, textDecorationLine: 'underline' },
    lockedBox: { height: 80, backgroundColor: 'rgba(10,7,3,0.8)', borderWidth: 1, borderColor: colors.ash, borderRadius: 4, alignItems: 'center', justifyContent: 'center', gap: 8 },
    lockedText: { fontFamily: fonts.ui, fontSize: 9, color: colors.sepia, letterSpacing: 1, textDecorationLine: 'underline' },

    // Lists
    listChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.ash, borderRadius: 3 },
    listChipOn: { backgroundColor: colors.sepia, borderColor: colors.sepia },
    listChipText: { fontFamily: fonts.ui, fontSize: 10, color: colors.fog, maxWidth: 120 },

    // Delete
    deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderWidth: 1, borderColor: colors.danger, borderRadius: 4, marginBottom: 16 },
    deleteBtnText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.danger },
    deleteConfirm: { backgroundColor: 'rgba(255,50,50,0.1)', borderWidth: 1, borderColor: colors.danger, borderRadius: 4, padding: 16, alignItems: 'center', marginBottom: 16 },
    deleteConfirmText: { fontFamily: fonts.ui, fontSize: 10, color: colors.danger, letterSpacing: 1, marginBottom: 12 },
    deleteConfirmRow: { flexDirection: 'row', gap: 12 },
    deleteYes: { flex: 1, backgroundColor: colors.danger, paddingVertical: 10, borderRadius: 4, alignItems: 'center' },
    deleteNo: { flex: 1, borderWidth: 1, borderColor: colors.ash, paddingVertical: 10, borderRadius: 4, alignItems: 'center' },
    deleteBtnLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: '#fff' },

    // Submit
    submitRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
    submitBtn: { flex: 1, backgroundColor: colors.sepia, paddingVertical: 14, borderRadius: 4, alignItems: 'center' },
    submitText: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 2, color: colors.ink, fontWeight: '600' },
    cancelBtn: { paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.ash, borderRadius: 4 },
    cancelText: { fontFamily: fonts.ui, fontSize: 11, color: colors.fog },
});
