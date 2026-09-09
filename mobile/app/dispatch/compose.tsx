import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Keyboard, InteractionManager, Alert, AppState, NativeSyntheticEvent, Platform, TextInputSelectionChangeEventData } from 'react-native';
// The preview mounts `EssayBody`, which carries the link guard and the render
// cap itself — so this screen no longer holds its own copy of either.
import { CinematicScrollView } from '@/src/components/layout/CinematicScrollView';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bold, Italic, Type, Quote, Minus, Link2 } from 'lucide-react-native';
import { EssayBody } from '@/src/components/dispatch/EssayBody';
import Animated, { useAnimatedStyle, useAnimatedKeyboard } from 'react-native-reanimated';

import { useAuthStore } from '@/src/stores/auth';
import { storage } from '@/src/stores/mmkv-storage';
import { isAuteurPlusTier } from '@/src/utils/tier';
import { colors, fonts } from '@/src/theme/theme';
import reelToast from '@/src/utils/reelToast';
// isOverLimit / remainingChars shipped in the sanitiser with ZERO callers — this
// screen is the one that needed them.
import { isOverLimit, remainingChars, MAX_LENGTHS } from '@/src/utils/sanitizeInput';
import PressableScale from '@/src/components/PressableScale';
import { ComposeBallotScreen, ComposeShortScreen, FilmPicker } from '@/src/components/dispatch/ComposeDesks';
import { SeriesPicker, roman, type SeriesChoice } from '@/src/components/dispatch/SeriesPicker';
import { FORMS, PaperPicker } from '@/src/components/dispatch/paper/PaperMore';
import { p } from '@/src/components/dispatch/paper/paperStyles';
import { groupDigits } from '@/src/components/dispatch/paper/paperMetrics';
import { excerptFor } from '@/src/components/dispatch/excerpt';
/**
 * The writing room was the one Dispatch screen with no font-scaling props on any
 * of its text. React Native's default is `allowFontScaling` with NO ceiling, so
 * at accessibility sizes every label here grew without limit — the header's
 * three-across row and the counter row worst, because neither can reflow.
 */
import { scaledTextProps, displayTextProps, deckLabelProps, decorativeTextProps } from '@/src/constants/textScaling';
import { useDispatch } from '@/src/stores/dispatch';
import type { FilingKind } from '@/src/stores/dispatchTypes';

// A long essay must survive a background-kill. Drafts persist here, new-dossiers only.
const DRAFT_KEY = 'reelhouse_dispatch_draft';

/**
 * How close to the fence before the counter appears.
 *
 * The limit is ~4,350 words. Showing a counter from the first sentence would
 * make a memory fence feel like an editorial one, so it stays out of the way
 * until the last ~870 words — enough warning to finish a thought and trim,
 * without hovering over anyone writing an ordinary piece.
 */
const LIMIT_WARNING_CHARS = 5000;

/**
 * ── THE DESK YOU ARE SENT TO ─────────────────────────────────────────────────
 * One route, five desks. `?kind=` decides which; with no kind the picker asks.
 *
 * ── WHY ONE ROUTE AND NOT FIVE ──────────────────────────────────────────────
 * The picker and the desk are one act — choose a form, fill it in — and putting
 * them on two routes means the back gesture from a desk returns to a picker the
 * member has already answered, which they then have to dismiss twice. Setting a
 * param keeps it one screen with one way out, and the desk's own BACK clears the
 * kind rather than leaving the modal, so a member who picked WIRE by mistake is
 * one tap from picking again.
 *
 * The AUTEURS gate is checked HERE, once, rather than in each desk: a ballot and
 * a dossier need the tier, a take, a seeking and a wire do not, and a member who
 * cannot file one must never reach its desk to find out at the end.
 */
export default function ComposeScreen() {
    const params = useLocalSearchParams<{ kind?: string; edit?: string }>();
    const user = useAuthStore((s) => s.user);
    const kind = (params.kind ?? (params.edit ? 'dossier' : '')) as FilingKind | '';

    /**
     * ── NOBODY IS SIGNED IN ──────────────────────────────────────────────────
     * Answered HERE, before the picker draws, rather than at each desk.
     *
     * The brass Concierge sits in the nav bar for everyone and its "File to the
     * Dispatch" row is not gated, so a signed-out reader reached this route,
     * was shown all five forms, tapped one — and the desk rendered NOTHING. Read
     * back off the tree, the whole screen was `[]`: no header, no back, no
     * sentence.
     *
     * Locking the rows instead would have been a lie. The picker's lock says
     * AUTEURS, which is a different reason and the wrong one; being told the
     * long form is for auteurs when the real answer is "you are not a member"
     * teaches somebody something untrue about what membership costs.
     *
     * So: the same sentence the feed already gives a signed-out reader, and the
     * way back, before any form is offered.
     */
    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);
    useEffect(() => {
        if (user) return;
        reelToast.error('Filing is for members.');
        // The wait matters: this fires while the modal is still animating in,
        // and unguarded both pops land, costing two screens instead of one.
        InteractionManager.runAfterInteractions(() => {
            if (isMounted.current) router.back();
        });
    }, [user]);

    // An unrecognised kind in a link is not a crash and not a blank screen; it
    // is somebody arriving without having chosen, which is what the picker is.
    const known = (['take', 'seeking', 'wire', 'ballot', 'dossier'] as const)
        .includes(kind as FilingKind);

    if (!known) return <KindPicker />;
    if (kind === 'dossier') return <ComposeDossierScreen />;
    if (kind === 'ballot') return <ComposeBallotScreen />;
    return <ComposeShortScreen kind={kind as 'take' | 'seeking' | 'wire'} />;
}

/**
 * WHAT ARE YOU FILING? — the five forms, with the two AUTEURS ones locked for
 * anyone who cannot file them.
 *
 * The lock is shown rather than the row hidden. A member should know the house
 * has a long form and a ballot before they can use them; a menu that silently
 * grows when you pay is a menu that told you nothing about what you were buying.
 */
function KindPicker() {
    const user = useAuthStore((s) => s.user);
    const auteur = isAuteurPlusTier(user);
    const insets = useSafeAreaInsets();

    return (
        <View style={[p.screen, { justifyContent: 'flex-end' }]}>
            <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
            <View style={{ paddingBottom: insets.bottom }}>
                <PaperPicker
                    forms={FORMS.map((f) => ({
                        ...f,
                        locked: f.locked ? !auteur : false,
                    }))}
                    onPick={(k) => router.setParams({ kind: k })}
                />
            </View>
        </View>
    );
}

function ComposeDossierScreen() {
    const { edit, initialTitle, initialContent } = useLocalSearchParams<{ edit?: string, initialTitle?: string, initialContent?: string }>();
    const { user } = useAuthStore();
    const insets = useSafeAreaInsets();
    const canWrite = isAuteurPlusTier(user);

    const keyboard = useAnimatedKeyboard();
    const animatedContainerStyle = useAnimatedStyle(() => ({
        // iOS only: Android's window resize handles the keyboard natively.
        paddingBottom: Platform.OS === 'ios' ? keyboard.height.value : 0,
    }));

    const [title, setTitle] = useState(initialTitle || '');
    const [content, setContent] = useState(initialContent || '');
    const [isPublishing, setIsPublishing] = useState(false);
    const [isPreview, setIsPreview] = useState(false);

    /**
     * ── WHAT THE PIECE IS, AS OPPOSED TO HOW IT IS SET ───────────────────────
     * The reader has always drawn a dossier's film and its series — `EssayHead`
     * prints a film credit and a series line, and the feed prints "Part II of
     * …". The store has always accepted them: `FilingDraft` carries `film`,
     * `seriesId`, `seriesTitle` and `partNumber`, and the database holds a
     * series together with `series_whole`, which refuses a half-set one.
     *
     * Only this screen never set them. So an Auteur could write the long form
     * and had no way to say which film it was about.
     *
     * NO COVER. `EssayHead` also draws one, from `film.backdropPath` — but
     * `dispatch_posts` has a single image column, `subject_image`, and `toFilm`
     * maps it to the POSTER. There is nowhere for a backdrop to live, so a
     * cover control here would be a button that saves nothing. It needs a
     * column before it needs a picker.
     */
    const [film, setFilm] = useState<{ id: number; title: string; sub: string | null; image: string | null } | null>(null);
    const [filmOpen, setFilmOpen] = useState(false);
    const [series, setSeries] = useState<SeriesChoice | null>(null);
    const [seriesOpen, setSeriesOpen] = useState(false);

    // Live caret tracking — the toolbar wraps the selection AT the cursor.
    const [selection, setSelection] = useState({ start: (initialContent || '').length, end: (initialContent || '').length });
    // Drives the caret for exactly one render after a toolbar edit, then releases.
    const [forcedSelection, setForcedSelection] = useState<{ start: number; end: number } | null>(null);

    const inputRef = useRef<TextInput>(null);

    // Refs mirror state so the AppState flush reads the latest without re-subscribing.
    const titleRef = useRef(title); titleRef.current = title;
    const contentRef = useRef(content); contentRef.current = content;

    // Mirrors the ref three sibling modals keep, for the guard just below.
    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    useEffect(() => {
        if (!canWrite) {
            reelToast.error('Auteur tier required');
            InteractionManager.runAfterInteractions(() => {
                // This fires while the screen is still animating in, so the wait is
                // long enough for the member to tap back themselves. Unguarded, both
                // pops land and they lose two screens instead of one.
                if (isMounted.current) router.back();
            });
        }
    }, [canWrite]);

    // ── Draft restore (new dossiers only; edit loads from the server) ──
    useEffect(() => {
        if (edit) return;
        const raw = storage.getString(DRAFT_KEY);
        if (raw) {
            try {
                const d = JSON.parse(raw);
                if (d.title) setTitle(d.title);
                if (d.content) {
                    setContent(d.content);
                    setSelection({ start: d.content.length, end: d.content.length });
                }
            } catch { /* corrupt draft — ignore */ }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Draft auto-save (debounced) ──
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (edit) return;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
            if (title.trim() || content.trim()) {
                storage.set(DRAFT_KEY, JSON.stringify({ title, content }));
            } else {
                storage.delete(DRAFT_KEY);
            }
        }, 1000);
        return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    }, [title, content, edit]);

    // ── Background flush — guarantees a long essay survives an immediate OS kill ──
    useEffect(() => {
        if (edit) return;
        const sub = AppState.addEventListener('change', (state) => {
            if (state !== 'active') {
                const t = titleRef.current, c = contentRef.current;
                if (t.trim() || c.trim()) {
                    storage.set(DRAFT_KEY, JSON.stringify({ title: t, content: c }));
                }
            }
        });
        return () => sub.remove();
    }, [edit]);

    const stats = useMemo(() => {
        const words = content.trim() ? content.trim().split(/\s+/).length : 0;
        const readMin = Math.max(1, Math.ceil(words / 200));
        return { words, readMin };
    }, [content]);

    /**
     * How close this essay is to the fence, and whether it may be filed.
     *
     * There was no signal at all. `sanitizeInput` cuts silently — the truncation
     * has no presence in its return type — so an essay over the limit was
     * shortened without a word, the publish reported success, and the draft was
     * deleted on the strength of that success. The writer lost the ending.
     *
     * `isOverLimit` and `remainingChars` already existed in the sanitiser,
     * tested, with ZERO callers. They are wired here.
     */
    const limit = useMemo(() => {
        const trimmed = content.trim();
        const remaining = remainingChars(trimmed, 'filingEssay');
        return {
            over: isOverLimit(trimmed, 'filingEssay'),
            remaining,
            // Quiet until it could plausibly matter — a counter on a 400-word
            // piece is noise, and this fence is meant never to be felt.
            show: remaining <= LIMIT_WARNING_CHARS,
            max: MAX_LENGTHS.filingEssay,
        };
    }, [content]);

    // Wrap the selection (or insert at the cursor) — never dumps at the document end.
    const insertFormatting = (before: string, after: string) => {
        const { start, end } = selection;
        const selected = content.slice(start, end);
        const next = content.slice(0, start) + before + selected + after + content.slice(end);
        setContent(next);
        // Selection present → caret after the wrap; empty → caret between the markers.
        const caret = selected.length > 0
            ? start + before.length + selected.length + after.length
            : start + before.length;
        setForcedSelection({ start: caret, end: caret });
        inputRef.current?.focus();
    };

    const handleSelectionChange = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
        setSelection(e.nativeEvent.selection);
        // Release programmatic control the render after a toolbar edit applied.
        if (forcedSelection) setForcedSelection(null);
    };

    const handlePublish = async () => {
        if (!canWrite) {
            reelToast.error('Auteur tier required');
            return;
        }
        if (!title.trim() || !content.trim() || isPublishing) return;

        // Refuse BEFORE anything is written or deleted. This return happens
        // outside the try below, so the draft is never touched — the failure
        // mode moves from "your essay was silently shortened and your draft is
        // gone" to "this cannot be filed yet, and every word is still here".
        if (limit.over) {
            reelToast.error(
                `This dossier is ${groupDigits(Math.abs(limit.remaining))} characters over the limit. Trim it and file again — nothing has been lost.`
            );
            return;
        }

        Keyboard.dismiss();
        setIsPublishing(true);

        try {
            // The card's opening, as prose. `excerptFor` unwraps markdown rather
            // than deleting its characters wherever they appear: the old line
            // turned `a well-made film (see below)` into `a wellmade film see
            // below`, and turned a link into its own URL.
            const excerpt = excerptFor(content);

            if (edit) {
                await useDispatch.getState().amend(edit, {
                    title: title.trim(),
                    body: excerpt,
                    fullContent: content.trim(),
                });
                reelToast.success('Dossier updated');
            } else {
                const filed = await useDispatch.getState().file({
                    kind: 'dossier',
                    title: title.trim(),
                    // For a dossier the BODY is the excerpt — one column, two
                    // meanings, and the database enforces the tighter 500 on it.
                    body: excerpt,
                    fullContent: content.trim(),
                    // The film and the series, which the reader has always drawn
                    // and the store has always accepted. `series_whole` refuses a
                    // half-set series, so these three travel together or not at
                    // all — which is why they come from one piece of state.
                    film,
                    seriesId: series?.id ?? null,
                    seriesTitle: series?.title ?? null,
                    partNumber: series?.part ?? null,
                });
                // The draft is deleted only after the write is accepted. It used
                // to be deleted on the strength of a success that a silent
                // truncation had already spoiled; now nothing is thrown away
                // until there is a row to throw it away for.
                if (filed) storage.delete(DRAFT_KEY);
                reelToast.success(filed?.offline ? 'Filed. It goes out when the wire is back.' : 'Dossier filed');
            }
            router.replace('/(tabs)/dispatch');

        } catch (err) {
            reelToast.error('Transmission failed');
        } finally {
            setIsPublishing(false);
        }
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />

            <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
                <PressableScale onPress={() => {
                    if (title.trim() || content.trim()) {
                        Alert.alert('Discard Draft?', 'Your unsaved dossier will be lost.', [
                            { text: 'Keep Writing', style: 'cancel' },
                            { text: 'Discard', style: 'destructive', onPress: () => {
                                if (!edit) storage.delete(DRAFT_KEY);
                                router.back();
                            } },
                        ]);
                    } else {
                        router.back();
                    }
                }} hitSlop={{top:10,bottom:10,left:10,right:10}} haptic
                    accessibilityRole="button"
                    accessibilityLabel="Cancel, and leave the writing room">
                    {/* The header is three across and cannot reflow, so its
                        labels take the deck cap: one line, and shrink-to-fit
                        rather than push a neighbour off the row. */}
                    <Text style={styles.cancelBtn} {...deckLabelProps}>CANCEL</Text>
                </PressableScale>
                <Text style={styles.headerTitle} {...deckLabelProps}>THE WRITING ROOM</Text>
                <PressableScale
                    onPress={() => {
                        setIsPreview(!isPreview);
                    }}
                    haptic="medium"
                    accessibilityRole="button"
                    // The label says what the press DOES, and the state says
                    // where you are. A control announced only as "Preview" gives
                    // a reader no way to know it is already showing one.
                    accessibilityState={{ selected: isPreview }}
                    accessibilityLabel={isPreview ? 'Back to editing' : 'Preview the dossier'}
                >
                    <Text style={styles.previewBtn} {...deckLabelProps}>{isPreview ? 'EDIT' : 'PREVIEW'}</Text>
                </PressableScale>
            </View>

            {isPreview ? (
                <CinematicScrollView style={styles.workspace} contentContainerStyle={styles.previewContent} showsVerticalScrollIndicator={false} bottomInset={insets.bottom}>
                    {/* ── THIS IS THE READER, NOT A PICTURE OF IT ──────────────
                        The preview used to set an essay in Courier 15/24 in
                        `bone`, with its own heading sizes, while the page it
                        would appear on sets it in Spectral 16.5/28 in
                        `parchment`, opens it with a raised initial, and prints
                        a section break as an ornament. Two different documents.
                        A member could not learn anything here about how their
                        writing would actually read.

                        `EssayBody` is the component the Dispatch itself mounts,
                        so the answer can no longer drift: there is one essay
                        typography and this is it.

                        ── AND IT IS CAPPED NOW, WHICH THE OLD NOTE REFUSED ────
                        That note said capping the preview would be "the app
                        fighting its user". It was written about truncation, but
                        the cap is not a style rule — it is the guard against two
                        markdown rules that are QUADRATIC, and the preview runs
                        the same renderer the reader does. Uncapped, a very long
                        draft could stall the composer exactly as it would stall
                        the page.

                        Nothing publishable is affected: `filingEssay` and
                        `dossierContent` are both 25,000, and sanitizeInput says
                        that is "not by accident". A draft ALREADY over the limit
                        now shows an ellipsis at the point the composer already
                        refuses to file past — which tells a member where the
                        limit bites rather than hiding it. */}
                    <Text style={styles.previewEyebrow} {...scaledTextProps}>AS THE HOUSE WILL SET IT</Text>
                    {title ? <Text style={styles.previewTitle} {...displayTextProps}>{title}</Text> : null}
                    {content ? (
                        <EssayBody text={content} />
                    ) : (
                        <View style={styles.emptyPreview}>
                            <Text style={styles.emptyPreviewText} {...scaledTextProps}>Your cinematic essay will appear here...</Text>
                        </View>
                    )}
                </CinematicScrollView>
            ) : (
                <Animated.View style={[styles.kavFlex, animatedContainerStyle]}>
                    <CinematicScrollView style={styles.workspace} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bottomInset={insets.bottom}>
                        <TextInput
                            style={styles.titleInput}
                            placeholder="A title for this dossier"
                            placeholderTextColor={colors.fog}
                            value={title}
                            onChangeText={setTitle}
                            maxLength={100}
                            cursorColor={colors.sepia}
                            selectionColor="rgba(184,137,26,0.3)"
                            keyboardAppearance="dark"
                            accessibilityLabel="Dossier headline"
                        />
                        {/* ── WHAT THE PIECE IS ────────────────────────────────
                            Above the writing, and separate from it. The rail at
                            the foot sets HOW the words read; these two say what
                            the dossier is about, which is a different question
                            and belongs with the title rather than with bold and
                            italic. */}
                        <View style={styles.slots}>
                            <PressableScale
                                style={styles.slot} onPress={() => setFilmOpen(true)} haptic="selection"
                                hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
                                accessibilityRole="button"
                                accessibilityLabel={film ? `The film is ${film.title}. Change it.` : 'Name the film this is about'}
                            >
                                <Text style={styles.slotLabel} {...decorativeTextProps}>FILM</Text>
                                <Text style={[styles.slotValue, film && styles.slotValueSet]} numberOfLines={1} {...scaledTextProps}>
                                    {film ? [film.title, film.sub].filter(Boolean).join(' · ') : 'Name the film this is about'}
                                </Text>
                            </PressableScale>
                            <PressableScale
                                style={styles.slot} onPress={() => setSeriesOpen(true)} haptic="selection"
                                hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
                                accessibilityRole="button"
                                accessibilityLabel={series ? `Part ${series.part} of ${series.title}. Change it.` : 'Make this part of a series'}
                            >
                                <Text style={styles.slotLabel} {...decorativeTextProps}>SERIES</Text>
                                <Text style={[styles.slotValue, series && styles.slotValueSet]} numberOfLines={1} {...scaledTextProps}>
                                    {series ? `${series.title.toUpperCase()} · ${roman(series.part)}` : 'Part of a series?'}
                                </Text>
                            </PressableScale>
                        </View>

                        <TextInput
                            ref={inputRef}
                            style={styles.contentInput}
                            placeholder="Begin. The house is listening."
                            placeholderTextColor={colors.ash}
                            value={content}
                            onChangeText={setContent}
                            onSelectionChange={handleSelectionChange}
                            selection={forcedSelection ?? undefined}
                            multiline
                            textAlignVertical="top"
                            cursorColor={colors.sepia}
                            selectionColor="rgba(184,137,26,0.3)"
                            keyboardAppearance="dark"
                            accessibilityLabel="Dossier content body"
                        />
                    </CinematicScrollView>

                    <View style={styles.toolbar}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolsScroll} keyboardShouldPersistTaps="handled">
                            <PressableScale hitSlop={{ top: 15, bottom: 15, left: 4, right: 4 }} style={styles.toolBtn} onPress={() => insertFormatting('**', '**')} haptic="selection" accessibilityRole="button" accessibilityLabel="Bold">
                                <Bold size={15} color={colors.parchment} />
                                <Text style={styles.toolWord} {...decorativeTextProps}>BOLD</Text>
                            </PressableScale>
                            <PressableScale hitSlop={{ top: 15, bottom: 15, left: 4, right: 4 }} style={styles.toolBtn} onPress={() => insertFormatting('*', '*')} haptic="selection" accessibilityRole="button" accessibilityLabel="Italic">
                                <Italic size={15} color={colors.parchment} />
                                <Text style={styles.toolWord} {...decorativeTextProps}>ITALIC</Text>
                            </PressableScale>
                            <PressableScale hitSlop={{ top: 15, bottom: 15, left: 4, right: 4 }} style={styles.toolBtn} onPress={() => insertFormatting('\n## ', '\n')} haptic="selection" accessibilityRole="button" accessibilityLabel="Heading">
                                <Type size={15} color={colors.parchment} />
                                <Text style={styles.toolWord} {...decorativeTextProps}>HEADING</Text>
                            </PressableScale>
                            <PressableScale hitSlop={{ top: 15, bottom: 15, left: 4, right: 4 }} style={styles.toolBtn} onPress={() => insertFormatting('\n> ', '\n')} haptic="selection" accessibilityRole="button" accessibilityLabel="Block quote">
                                <Quote size={15} color={colors.parchment} />
                                <Text style={styles.toolWord} {...decorativeTextProps}>QUOTE</Text>
                            </PressableScale>
                            <PressableScale hitSlop={{ top: 15, bottom: 15, left: 4, right: 4 }} style={styles.toolBtn} onPress={() => insertFormatting('\n---\n', '')} haptic="selection" accessibilityRole="button" accessibilityLabel="Horizontal rule">
                                <Minus size={15} color={colors.parchment} />
                                <Text style={styles.toolWord} {...decorativeTextProps}>BREAK</Text>
                            </PressableScale>
                            <PressableScale hitSlop={{ top: 15, bottom: 15, left: 4, right: 4 }} style={styles.toolBtn} onPress={() => insertFormatting('[', '](url)')} haptic="selection" accessibilityRole="button" accessibilityLabel="Insert link">
                                <Link2 size={15} color={colors.parchment} />
                                <Text style={styles.toolWord} {...decorativeTextProps}>LINK</Text>
                            </PressableScale>
                        </ScrollView>
                    </View>

                    <BlurView intensity={90} tint="dark" style={styles.footer}>
                        <View style={styles.stats}>
                            {/* The counter row is the other one that cannot
                                reflow: three items sharing a fixed strip. The
                                values nested inside inherit the cap. */}
                            <Text style={styles.statText} {...deckLabelProps}>WORDS <Text style={styles.statVal}>{stats.words}</Text></Text>
                            <Text style={styles.statText} {...deckLabelProps}>READ TIME <Text style={styles.statVal}>~{stats.readMin}m</Text></Text>
                            {limit.show ? (
                                <Text style={[styles.statText, limit.over && styles.statOver]} {...deckLabelProps}>
                                    {limit.over ? 'OVER BY ' : 'LEFT '}
                                    <Text style={[styles.statVal, limit.over && styles.statOver]}>
                                        {groupDigits(Math.abs(limit.remaining))}
                                    </Text>
                                </Text>
                            ) : null}
                        </View>
                        <PressableScale
                            style={[styles.publishBtn, (!title || !content || isPublishing) && styles.publishBtnDisabled]}
                            disabled={!title || !content || isPublishing}
                            onPress={handlePublish}
                            haptic="medium"
                            accessibilityRole="button"
                            // Disabled is ANNOUNCED, not merely applied. Without
                            // it the control reads as available and answers a
                            // press with nothing, which is the exact experience
                            // this whole audit exists to prevent.
                            accessibilityState={{ disabled: !title || !content || isPublishing, busy: isPublishing }}
                            accessibilityLabel={
                                isPublishing ? 'Filing the dossier'
                                    : !title || !content ? 'File the dossier. Not ready yet — it needs a title and a body'
                                        : edit ? 'Re-file the dossier' : 'File the dossier'
                            }
                        >
                            {/* Keeps its own shrink-to-fit — 'FILE THE DOSSIER'
                                is the longest label on the screen — and gains
                                the ceiling it never had. */}
                            <Text style={styles.publishBtnText} {...scaledTextProps} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{isPublishing ? 'FILING…' : (edit ? 'RE-FILE DOSSIER' : 'FILE THE DOSSIER')}</Text>
                        </PressableScale>
                    </BlurView>
                </Animated.View>
            )}

            {/* Both sheets are mounted OUTSIDE the preview/edit branch, so
                neither is torn down and rebuilt when a member flips to the
                preview and back. They draw nothing until opened. */}
            <FilmPicker
                visible={filmOpen}
                bottomInset={insets.bottom}
                onClose={() => setFilmOpen(false)}
                onPick={(f, id) => {
                    // The id comes from the finder by POSITION, which is the one
                    // way to get the right film when two share a title and year.
                    setFilm({
                        id,
                        title: f.title,
                        sub: [f.year, f.director].filter(Boolean).join(' · ') || null,
                        image: f.posterPath ?? null,
                    });
                    setFilmOpen(false);
                }}
            />
            <SeriesPicker
                visible={seriesOpen}
                chosen={series}
                bottomInset={insets.bottom}
                onClose={() => setSeriesOpen(false)}
                onSet={(choice) => { setSeries(choice); setSeriesOpen(false); }}
                onClear={() => { setSeries(null); setSeriesOpen(false); }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.soot,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 16,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.sepiaBorder,
        backgroundColor: colors.ink,
    },
    cancelBtn: {
        fontFamily: fonts.sub,
        fontSize: 9,
        color: colors.fog,
        letterSpacing: 1.5,
        includeFontPadding: false,
    },
    headerTitle: {
        fontFamily: fonts.sub,
        fontSize: 9,
        letterSpacing: 3,
        color: colors.sepia,
        includeFontPadding: false,
    },
    previewBtn: {
        fontFamily: fonts.sub,
        fontSize: 9,
        color: colors.parchment,
        letterSpacing: 1.5,
        includeFontPadding: false,
    },
    workspace: {
        flex: 1,
    },
    titleInput: {
        fontFamily: fonts.sub,
        fontSize: 30,
        color: colors.parchment,
        padding: 24,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(184,137,26,0.1)',
    },
    contentInput: {
        fontFamily: fonts.body,
        fontSize: 16,
        color: colors.bone,
        padding: 24,
        paddingTop: 24,
        lineHeight: 24,
        minHeight: 400,
    },
    toolbar: {
        borderTopWidth: 1,
        borderTopColor: colors.sepiaBorder,
        backgroundColor: 'rgba(10,7,3,0.9)',
        paddingVertical: 8,
    },
    toolsScroll: {
        paddingHorizontal: 16,
        gap: 8,
    },
    toolBtn: {
        // A column now — the mark, and its NAME under it. Six unlabelled icons
        // meant a member had to already know what markdown was to use a rail
        // that exists so they would not have to.
        alignItems: 'center',
        gap: 3,
        paddingVertical: 6,
        paddingHorizontal: 10,
        backgroundColor: 'rgba(184,137,26,0.1)',
        borderRadius: 4,
        minWidth: 52,
    },
    toolWord: {
        fontFamily: fonts.sub,
        fontSize: 6.5,
        letterSpacing: 1.2,
        color: colors.bone,
        includeFontPadding: false,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 40,
        borderTopWidth: 1,
        borderTopColor: colors.sepiaBorder,
    },
    stats: {
        flex: 1,
    },
    statText: {
        fontFamily: fonts.sub,
        fontSize: 8,
        letterSpacing: 2,
        color: colors.fog,
        marginBottom: 4,
        includeFontPadding: false,
    },
    statVal: {
        color: colors.sepia,
    },
    // The one state where the essay cannot be filed. Same strip, same weight —
    // a colour change, not an alarm.
    statOver: {
        color: colors.crimson,
    },
    publishBtn: {
        backgroundColor: colors.sepia,
        paddingVertical: 12,
        paddingHorizontal: 22,
        borderRadius: 4,
    },
    publishBtnDisabled: {
        backgroundColor: colors.ash,
    },
    publishBtnText: {
        fontFamily: fonts.sub,
        fontSize: 9,
        letterSpacing: 2,
        color: colors.ink,
        includeFontPadding: false,
    },

    // Preview
    previewEyebrow: {
        fontFamily: fonts.sub,
        fontSize: 9,
        letterSpacing: 3,
        color: colors.sepia,
        marginBottom: 16,
        textAlign: 'center',
        includeFontPadding: false,
    },
    previewTitle: {
        // The reader's own head — `PaperEssay.title`, 26/34 in parchment. It was
        // 30pt here, which is a fourth size for one thing on one screen.
        fontFamily: fonts.display,
        fontSize: 26,
        lineHeight: 34,
        color: colors.parchment,
        marginBottom: 20,
    },
    emptyPreview: {
        paddingVertical: 100,
        alignItems: 'center',
    },
    emptyPreviewText: {
        fontFamily: fonts.bodyItalic,
        fontSize: 14,
        color: colors.fog,
    },
    kavFlex: { flex: 1 },
    previewContent: { padding: 20 },

    /** What the piece IS — above the writing, below the title. */
    slots: {
        borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.16)',
        borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.16)',
        paddingVertical: 4, marginBottom: 14,
    },
    slot: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
    slotLabel: {
        fontFamily: fonts.sub, fontSize: 7, letterSpacing: 1.8, color: colors.sepia,
        width: 46, includeFontPadding: false,
    },
    /** Unset reads as an invitation; set reads as a fact. */
    slotValue: {
        fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2, color: colors.fog,
        includeFontPadding: false, flex: 1, minWidth: 0,
    },
    slotValueSet: { color: colors.parchment },
});

