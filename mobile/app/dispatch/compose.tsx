import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Dimensions, Keyboard } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Bold, Italic, Type, Quote, Minus, Link2 } from 'lucide-react-native';
import Markdown from 'react-native-markdown-display';
import * as Haptics from 'expo-haptics';

import { useAuthStore } from '@/src/stores/auth';
import { supabase } from '@/src/lib/supabase';
import { colors, fonts, spacing } from '@/src/theme/theme';
import reelToast from '@/src/utils/reelToast';

const { width } = Dimensions.get('window');

export default function ComposeDossierScreen() {
    const { edit } = useLocalSearchParams<{ edit?: string }>();
    const { user } = useAuthStore();
    const canWrite = user?.role === 'auteur';

    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [isPublishing, setIsPublishing] = useState(false);
    const [isPreview, setIsPreview] = useState(false);

    const inputRef = useRef<TextInput>(null);

    useEffect(() => {
        if (!canWrite) {
            reelToast('Auteur tier required', { icon: '🔒' });
            router.back();
        }
    }, [canWrite]);

    const stats = useMemo(() => {
        const words = content.trim() ? content.trim().split(/\s+/).length : 0;
        const readMin = Math.max(1, Math.ceil(words / 200));
        return { words, readMin };
    }, [content]);

    const insertFormatting = (before: string, after: string) => {
        Haptics.selectionAsync();
        setContent(prev => `${prev}${before}${after}`);
        // In a real advanced editor, we'd handle cursor position, but React Native TextInput selection handling is tricky.
        // We just append for now to ensure stability.
        inputRef.current?.focus();
    };

    const handlePublish = async () => {
        if (!title.trim() || !content.trim() || isPublishing) return;
        Keyboard.dismiss();
        setIsPublishing(true);

        try {
            const payload = {
                title: title.trim(),
                excerpt: content.trim().substring(0, 150) + (content.length > 150 ? '...' : ''),
                full_content: content.trim(),
            };

            if (edit) {
                // Ignore edit functionality for now in mobile to keep it simple
            } else {
                const { error } = await supabase.from('dispatch_dossiers').insert([{
                    author_id: user?.id,
                    author: user?.username,
                    ...payload
                }]);
                if (error) throw error;
                reelToast('Dossier Published ✦', { icon: '📰' });
            }
            router.replace('/(tabs)/explore');
        } catch (error: any) {
            reelToast('Transmission Failed', { icon: '⚠️' });
        } finally {
            setIsPublishing(false);
        }
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
            
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={{top:10,bottom:10,left:10,right:10}}>
                    <Text style={styles.cancelBtn}>CANCEL</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>THE WRITING ROOM</Text>
                <TouchableOpacity 
                    onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setIsPreview(!isPreview);
                    }}
                >
                    <Text style={styles.previewBtn}>{isPreview ? 'EDIT' : 'PREVIEW'}</Text>
                </TouchableOpacity>
            </View>

            {isPreview ? (
                <ScrollView style={styles.workspace} contentContainerStyle={{ padding: 20 }}>
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
                </ScrollView>
            ) : (
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <ScrollView style={styles.workspace} keyboardShouldPersistTaps="handled">
                        <TextInput
                            style={styles.titleInput}
                            placeholder="Headline..."
                            placeholderTextColor={colors.fog}
                            value={title}
                            onChangeText={setTitle}
                            maxLength={100}
                        />
                        <TextInput
                            ref={inputRef}
                            style={styles.contentInput}
                            placeholder="Begin your dossier... Use Markdown for formatting."
                            placeholderTextColor={colors.ash}
                            value={content}
                            onChangeText={setContent}
                            multiline
                            textAlignVertical="top"
                        />
                    </ScrollView>

                    <View style={styles.toolbar}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolsScroll}>
                            <TouchableOpacity style={styles.toolBtn} onPress={() => insertFormatting('**', '**')}>
                                <Bold size={18} color={colors.parchment} />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.toolBtn} onPress={() => insertFormatting('*', '*')}>
                                <Italic size={18} color={colors.parchment} />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.toolBtn} onPress={() => insertFormatting('\n## ', '\n')}>
                                <Type size={18} color={colors.parchment} />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.toolBtn} onPress={() => insertFormatting('\n> ', '\n')}>
                                <Quote size={18} color={colors.parchment} />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.toolBtn} onPress={() => insertFormatting('\n---\n', '')}>
                                <Minus size={18} color={colors.parchment} />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.toolBtn} onPress={() => insertFormatting('[', '](url)')}>
                                <Link2 size={18} color={colors.parchment} />
                            </TouchableOpacity>
                        </ScrollView>
                    </View>

                    <BlurView intensity={90} tint="dark" style={styles.footer}>
                        <View style={styles.stats}>
                            <Text style={styles.statText}>WORDS <Text style={styles.statVal}>{stats.words}</Text></Text>
                            <Text style={styles.statText}>READ TIME <Text style={styles.statVal}>~{stats.readMin}m</Text></Text>
                        </View>
                        <TouchableOpacity 
                            style={[styles.publishBtn, (!title || !content || isPublishing) && styles.publishBtnDisabled]}
                            disabled={!title || !content || isPublishing}
                            onPress={handlePublish}
                        >
                            <Text style={styles.publishBtnText}>{isPublishing ? 'TRANSMITTING' : 'PUBLISH'}</Text>
                        </TouchableOpacity>
                    </BlurView>
                </KeyboardAvoidingView>
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
        paddingTop: 60,
        paddingBottom: 16,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.ash,
        backgroundColor: colors.ink,
    },
    cancelBtn: {
        fontFamily: fonts.ui,
        fontSize: 10,
        color: colors.fog,
        letterSpacing: 1,
    },
    headerTitle: {
        fontFamily: fonts.uiBold,
        fontSize: 10,
        letterSpacing: 3,
        color: colors.sepia,
    },
    previewBtn: {
        fontFamily: fonts.uiBold,
        fontSize: 10,
        color: colors.parchment,
        letterSpacing: 1,
    },
    workspace: {
        flex: 1,
    },
    titleInput: {
        fontFamily: fonts.sub,
        fontSize: 32,
        color: colors.parchment,
        padding: 24,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(139,105,20,0.1)',
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
        borderTopColor: colors.ash,
        backgroundColor: 'rgba(10,7,3,0.9)',
        paddingVertical: 8,
    },
    toolsScroll: {
        paddingHorizontal: 16,
        gap: 8,
    },
    toolBtn: {
        padding: 8,
        backgroundColor: 'rgba(255,255,255,0.05)',
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
        borderTopColor: colors.ash,
    },
    stats: {
        flex: 1,
    },
    statText: {
        fontFamily: fonts.ui,
        fontSize: 8,
        letterSpacing: 2,
        color: colors.fog,
        marginBottom: 4,
    },
    statVal: {
        color: colors.sepia,
    },
    publishBtn: {
        backgroundColor: colors.sepia,
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 4,
    },
    publishBtnDisabled: {
        backgroundColor: colors.ash,
    },
    publishBtnText: {
        fontFamily: fonts.uiBold,
        fontSize: 10,
        letterSpacing: 2,
        color: colors.ink,
    },

    // Preview
    previewEyebrow: {
        fontFamily: fonts.ui,
        fontSize: 10,
        letterSpacing: 3,
        color: colors.sepia,
        marginBottom: 16,
        textAlign: 'center',
    },
    previewTitle: {
        fontFamily: fonts.sub,
        fontSize: 32,
        color: colors.parchment,
        marginBottom: 32,
    },
    emptyPreview: {
        paddingVertical: 100,
        alignItems: 'center',
    },
    emptyPreviewText: {
        fontFamily: fonts.bodyItalic,
        fontSize: 14,
        color: colors.fog,
    }
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
        backgroundColor: 'rgba(139,105,20,0.05)',
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
