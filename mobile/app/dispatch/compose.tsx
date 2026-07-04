import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Keyboard, InteractionManager, Alert, AppState, NativeSyntheticEvent, TextInputSelectionChangeEventData } from 'react-native';
import { CinematicScrollView } from '@/src/components/layout/CinematicScrollView';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bold, Italic, Type, Quote, Minus, Link2 } from 'lucide-react-native';
import Markdown from 'react-native-markdown-display';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import TactileEngine from '@/src/utils/TactileEngine';
import Animated, { useAnimatedStyle, useAnimatedKeyboard } from 'react-native-reanimated';

import { useAuthStore } from '@/src/stores/auth';
import { useDispatchStore } from '@/src/stores/content';
import { storage } from '@/src/stores/mmkv-storage';
import { isAuteurPlusTier } from '@/src/utils/tier';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { colors, fonts, spacing } from '@/src/theme/theme';
import reelToast from '@/src/utils/reelToast';
import PressableScale from '@/src/components/PressableScale';

// A long essay must survive a background-kill. Drafts persist here, new-dossiers only.
const DRAFT_KEY = 'reelhouse_dispatch_draft';

export default function ComposeDossierScreen() {
    const { edit, initialTitle, initialContent } = useLocalSearchParams<{ edit?: string, initialTitle?: string, initialContent?: string }>();
    const { user } = useAuthStore();
    const insets = useSafeAreaInsets();
    const canWrite = isAuteurPlusTier(user);

    const keyboard = useAnimatedKeyboard();
    const animatedContainerStyle = useAnimatedStyle(() => ({
        paddingBottom: keyboard.height.value,
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

    useEffect(() => {
        if (!canWrite) {
            reelToast.error('Auteur tier required');
            InteractionManager.runAfterInteractions(() => {
                router.back();
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
        Keyboard.dismiss();
        setIsPublishing(true);

        try {
            // Strip markdown formatting for the clean plaintext excerpt
            const plainText = content.replace(/[#*_[\]()>-]/g, '').replace(/\n+/g, ' ').trim();
            const excerpt = plainText.substring(0, 150) + (plainText.length > 150 ? '...' : '');

            if (edit) {
                await useDispatchStore.getState().updateDossier(edit, {
                    title: title.trim(),
                    excerpt,
                    fullContent: content.trim(),
                });
                reelToast.success('Dossier updated');
            } else {
                await useDispatchStore.getState().addDossier({
                    title: title.trim(),
                    excerpt,
                    fullContent: content.trim(),
                });
                storage.delete(DRAFT_KEY);
                reelToast.success('Dossier filed');
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
                }} hitSlop={{top:10,bottom:10,left:10,right:10}} haptic>
                    <Text style={styles.cancelBtn} numberOfLines={1}>CANCEL</Text>
                </PressableScale>
                <Text style={styles.headerTitle} numberOfLines={1}>THE WRITING ROOM</Text>
                <PressableScale
                    onPress={() => {
                        setIsPreview(!isPreview);
                    }}
                    haptic="medium"
                >
                    <Text style={styles.previewBtn} numberOfLines={1}>{isPreview ? 'EDIT' : 'PREVIEW'}</Text>
                </PressableScale>
            </View>

            {isPreview ? (
                <CinematicScrollView style={styles.workspace} contentContainerStyle={styles.previewContent} showsVerticalScrollIndicator={false} bottomInset={insets.bottom}>
                    <Text style={styles.previewEyebrow}>LIVE PREVIEW</Text>
                    {title ? <Text style={styles.previewTitle}>{title}</Text> : null}
                    {content ? (
                        <Markdown style={markdownStyles}>
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
                            <PressableScale style={styles.toolBtn} onPress={() => insertFormatting('**', '**')} haptic="selection" accessibilityRole="button" accessibilityLabel="Bold">
                                <Bold size={18} color={colors.parchment} />
                            </PressableScale>
                            <PressableScale style={styles.toolBtn} onPress={() => insertFormatting('*', '*')} haptic="selection" accessibilityRole="button" accessibilityLabel="Italic">
                                <Italic size={18} color={colors.parchment} />
                            </PressableScale>
                            <PressableScale style={styles.toolBtn} onPress={() => insertFormatting('\n## ', '\n')} haptic="selection" accessibilityRole="button" accessibilityLabel="Heading">
                                <Type size={18} color={colors.parchment} />
                            </PressableScale>
                            <PressableScale style={styles.toolBtn} onPress={() => insertFormatting('\n> ', '\n')} haptic="selection" accessibilityRole="button" accessibilityLabel="Block quote">
                                <Quote size={18} color={colors.parchment} />
                            </PressableScale>
                            <PressableScale style={styles.toolBtn} onPress={() => insertFormatting('\n---\n', '')} haptic="selection" accessibilityRole="button" accessibilityLabel="Horizontal rule">
                                <Minus size={18} color={colors.parchment} />
                            </PressableScale>
                            <PressableScale style={styles.toolBtn} onPress={() => insertFormatting('[', '](url)')} haptic="selection" accessibilityRole="button" accessibilityLabel="Insert link">
                                <Link2 size={18} color={colors.parchment} />
                            </PressableScale>
                        </ScrollView>
                    </View>

                    <BlurView intensity={90} tint="dark" style={styles.footer}>
                        <View style={styles.stats}>
                            <Text style={styles.statText} numberOfLines={1}>WORDS <Text style={styles.statVal}>{stats.words}</Text></Text>
                            <Text style={styles.statText} numberOfLines={1}>READ TIME <Text style={styles.statVal}>~{stats.readMin}m</Text></Text>
                        </View>
                        <PressableScale
                            style={[styles.publishBtn, (!title || !content || isPublishing) && styles.publishBtnDisabled]}
                            disabled={!title || !content || isPublishing}
                            onPress={handlePublish}
                            haptic="medium"
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
