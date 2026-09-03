import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Keyboard, InteractionManager, Alert, AppState, NativeSyntheticEvent, Platform, TextInputSelectionChangeEventData } from 'react-native';
import { onMarkdownLinkPress } from '@/src/utils/markdownSafety';
import { CinematicScrollView } from '@/src/components/layout/CinematicScrollView';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bold, Italic, Type, Quote, Minus, Link2 } from 'lucide-react-native';
import Markdown from 'react-native-markdown-display';
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
import { ComposeBallotScreen, ComposeShortScreen } from '@/src/components/dispatch/ComposeDesks';
import { FORMS, PaperPicker } from '@/src/components/dispatch/paper/PaperMore';
import { p } from '@/src/components/dispatch/paper/paperStyles';
import { groupDigits } from '@/src/components/dispatch/paper/paperMetrics';
import { excerptFor } from '@/src/components/dispatch/excerpt';
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
                    <Text style={styles.cancelBtn} numberOfLines={1}>CANCEL</Text>
                </PressableScale>
                <Text style={styles.headerTitle} numberOfLines={1}>THE WRITING ROOM</Text>
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
                    <Text style={styles.previewBtn} numberOfLines={1}>{isPreview ? 'EDIT' : 'PREVIEW'}</Text>
                </PressableScale>
            </View>

            {isPreview ? (
                <CinematicScrollView style={styles.workspace} contentContainerStyle={styles.previewContent} showsVerticalScrollIndicator={false} bottomInset={insets.bottom}>
                    <Text style={styles.previewEyebrow}>LIVE PREVIEW</Text>
                    {title ? <Text style={styles.previewTitle}>{title}</Text> : null}
                    {/* Guarded like the other mounts — a link is a link even in your own
                        draft. Deliberately NOT capped: this is the author's live preview,
                        and truncating someone's essay while they write it is the app
                        fighting its user. See utils/markdownSafety.ts. */}
                    {content ? (
                        <Markdown style={markdownStyles} onLinkPress={onMarkdownLinkPress}>
                            {content}
                        </Markdown>
                    ) : (
                        <View style={styles.emptyPreview}>
                            <Text style={styles.emptyPreviewText}>Your cinematic essay will appear here...</Text>
                        </View>
                    )}
                </CinematicScrollView>
            ) : (
                <Animated.View style={[styles.kavFlex, animatedContainerStyle]}>
                    <CinematicScrollView style={styles.workspace} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bottomInset={insets.bottom}>
                        <TextInput
                            style={styles.titleInput}
                            placeholder="Headline..."
                            placeholderTextColor={colors.fog}
                            value={title}
                            onChangeText={setTitle}
                            maxLength={100}
                            cursorColor={colors.sepia}
                            selectionColor="rgba(184,137,26,0.3)"
                            keyboardAppearance="dark"
                            accessibilityLabel="Dossier headline"
                        />
                        <TextInput
                            ref={inputRef}
                            style={styles.contentInput}
                            placeholder="Begin your dossier... Use Markdown for formatting."
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
                                <Bold size={18} color={colors.parchment} />
                            </PressableScale>
                            <PressableScale hitSlop={{ top: 15, bottom: 15, left: 4, right: 4 }} style={styles.toolBtn} onPress={() => insertFormatting('*', '*')} haptic="selection" accessibilityRole="button" accessibilityLabel="Italic">
                                <Italic size={18} color={colors.parchment} />
                            </PressableScale>
                            <PressableScale hitSlop={{ top: 15, bottom: 15, left: 4, right: 4 }} style={styles.toolBtn} onPress={() => insertFormatting('\n## ', '\n')} haptic="selection" accessibilityRole="button" accessibilityLabel="Heading">
                                <Type size={18} color={colors.parchment} />
                            </PressableScale>
                            <PressableScale hitSlop={{ top: 15, bottom: 15, left: 4, right: 4 }} style={styles.toolBtn} onPress={() => insertFormatting('\n> ', '\n')} haptic="selection" accessibilityRole="button" accessibilityLabel="Block quote">
                                <Quote size={18} color={colors.parchment} />
                            </PressableScale>
                            <PressableScale hitSlop={{ top: 15, bottom: 15, left: 4, right: 4 }} style={styles.toolBtn} onPress={() => insertFormatting('\n---\n', '')} haptic="selection" accessibilityRole="button" accessibilityLabel="Horizontal rule">
                                <Minus size={18} color={colors.parchment} />
                            </PressableScale>
                            <PressableScale hitSlop={{ top: 15, bottom: 15, left: 4, right: 4 }} style={styles.toolBtn} onPress={() => insertFormatting('[', '](url)')} haptic="selection" accessibilityRole="button" accessibilityLabel="Insert link">
                                <Link2 size={18} color={colors.parchment} />
                            </PressableScale>
                        </ScrollView>
                    </View>

                    <BlurView intensity={90} tint="dark" style={styles.footer}>
                        <View style={styles.stats}>
                            <Text style={styles.statText} numberOfLines={1}>WORDS <Text style={styles.statVal}>{stats.words}</Text></Text>
                            <Text style={styles.statText} numberOfLines={1}>READ TIME <Text style={styles.statVal}>~{stats.readMin}m</Text></Text>
                            {limit.show ? (
                                <Text style={[styles.statText, limit.over && styles.statOver]} numberOfLines={1}>
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
                            <Text style={styles.publishBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{isPublishing ? 'FILING…' : (edit ? 'RE-FILE DOSSIER' : 'FILE THE DOSSIER')}</Text>
                        </PressableScale>
                    </BlurView>
                </Animated.View>
            )}
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
        padding: 8,
        backgroundColor: 'rgba(184,137,26,0.1)',
        borderRadius: 4,
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
        fontFamily: fonts.display,
        fontSize: 30,
        color: colors.parchment,
        marginBottom: 32,
        lineHeight: 36,
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
});

const markdownStyles = {
    body: {
        fontFamily: fonts.body,
        fontSize: 15,
        color: colors.bone,
        lineHeight: 24,
    },
    heading2: {
        fontFamily: fonts.sub,
        fontSize: 24,
        color: colors.parchment,
        marginTop: 24,
        marginBottom: 12,
    },
    heading3: {
        fontFamily: fonts.sub,
        fontSize: 18,
        color: colors.parchment,
        marginTop: 20,
        marginBottom: 10,
    },
    blockquote: {
        backgroundColor: 'rgba(184,137,26,0.05)',
        borderLeftWidth: 2,
        borderLeftColor: colors.sepia,
        paddingHorizontal: 16,
        paddingVertical: 8,
        marginVertical: 16,
    },
    strong: {
        fontFamily: fonts.bodyBold,
        color: colors.parchment,
    },
    em: {
        fontFamily: fonts.bodyItalic,
    },
    hr: {
        backgroundColor: colors.sepia,
        height: 1,
        marginVertical: 24,
        opacity: 0.3,
    },
};
