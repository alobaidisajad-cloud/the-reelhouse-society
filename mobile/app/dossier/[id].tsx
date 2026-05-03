import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { SectionDivider } from '@/src/components/Decorative';
import PressableScale from '@/src/components/PressableScale';
import { useLocalSearchParams, router } from 'expo-router';
import Markdown from 'react-native-markdown-display';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts } from '@/src/theme/theme';
import reelToast from '@/src/utils/reelToast';
import * as Haptics from 'expo-haptics';
import { DossierDetail, DossierComment } from '@/src/types';

export default function DossierReaderScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { user } = useAuthStore();
    const insets = useSafeAreaInsets();
    
    const keyboard = useAnimatedKeyboard();
    const animatedContainerStyle = useAnimatedStyle(() => ({
        paddingBottom: keyboard.height.value,
    }));
    
    const [dossier, setDossier] = useState<DossierDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [certified, setCertified] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [certifyCount, setCertifyCount] = useState(0);
    const [comments, setComments] = useState<DossierComment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [posting, setPosting] = useState(false);

    // Callback isolation: stabilize annotation input handler
    const handleNewCommentChange = useCallback((text: string) => {
        setNewComment(text);
    }, []);

    useEffect(() => {
        async function fetchDossier() {
            setLoading(true);
            try {
                // In a real scenario we'd query dispatch_dossiers
                const { data, error } = await supabase
                    .from('dispatch_dossiers')
                    .select('id, title, excerpt, full_content, author_username, user_id, created_at, views, certify_count')
                    .eq('id', id)
                    .single();
                
                if (error) throw error;
                setDossier(data);
                
                // Track view count (simplified)
                const { error: rpcError } = await supabase.rpc('increment_dossier_views', { dossier_uuid: id });
                if (rpcError && __DEV__) console.warn('[Dossier] View increment RPC failed:', rpcError);

                // Fetch Comments
                const { data: commData } = await supabase
                    .from('dossier_comments')
                    .select('id, user_id, username, body, created_at')
                    .eq('dossier_id', id)
                    .order('created_at', { ascending: true });
                
                setComments(commData || []);
                
                // Check if certified
                if (user) {
                    const { data: cert } = await supabase
                        .from('dossier_certifications')
                        .select('id')
                        .eq('user_id', user.id)
                        .eq('dossier_id', id)
                        .maybeSingle();
                    setCertified(!!cert);
                }
            } catch (err: unknown) {
                if (__DEV__) console.warn('[Dossier] Fetch error:', err);
                reelToast.error('Dossier not found or encrypted.');
                router.back();
            } finally {
                setLoading(false);
            }
        }
        

        fetchDossier();
    }, [id, user]);

    const handlePostComment = async () => {
        if (!user) return router.push('/login');
        if (!newComment.trim() || posting || id.startsWith('seed')) return;

        setPosting(true);
        try {
            const { data, error } = await supabase.from('dossier_comments').insert({
                dossier_id: id,
                user_id: user.id,
                username: user.username,
                body: newComment.trim(),
            }).select().single();

            if (!error && data) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setComments(prev => [...prev, data]);
                setNewComment('');
            }
        } catch (err: unknown) { 
            if (__DEV__) console.warn('[Dossier] Post comment error:', err);
            reelToast.error('Failed to annotate.');
        } finally {
            setPosting(false);
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        try {
            await supabase.from('dossier_comments').delete().eq('id', commentId);
            setComments(prev => prev.filter(c => c.id !== commentId));
        } catch (err: unknown) {
            if (__DEV__) console.warn('[Dossier] Delete comment error:', err);
        }
    };

    const handleCertify = async () => {
        if (!user || id.startsWith('seed')) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        
        const wasCertified = certified;
        setCertified(!wasCertified);
        setCertifyCount(prev => wasCertified ? Math.max(0, prev - 1) : prev + 1);
        
        try {
            await supabase.rpc('toggle_dossier_certify', { dossier_uuid: id });
        } catch (err: unknown) {
            if (__DEV__) console.warn('[Dossier] Certify error:', err);
            setCertified(wasCertified);
            setCertifyCount(prev => wasCertified ? prev + 1 : Math.max(0, prev - 1));
            reelToast.error('Certification failed');
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, { justifyContent: 'center' }]}>
                <ActivityIndicator color={colors.sepia} />
            </View>
        );
    }

    if (!dossier) return null;

    return (
        <Animated.View 
            style={[styles.container, animatedContainerStyle]}
        >
            {/* Header / Nav */}
            <View style={[styles.navBlock, { paddingTop: Math.max(insets.top + 10, 60) }]}>
                <PressableScale onPress={() => router.back()} style={styles.backBtn} hitSlop={{top:10,bottom:10,left:10,right:10}} haptic="selection" pressedScale={0.92}>
                    <Text style={styles.backIcon}>✕</Text>
                </PressableScale>
                <Text style={styles.navMark}>REELHOUSE DIGITAL DOSSIER</Text>
            </View>

            <ScrollView 
                style={styles.paper} 
                contentContainerStyle={styles.paperContent}
                showsVerticalScrollIndicator={false}
            >
                <Text style={styles.title}>{dossier.title}</Text>
                
                <View style={styles.bylineBlock}>
                    <Text style={styles.bylineText}>FILED BY <Text style={styles.authorHighlight}>@{dossier.author_username}</Text></Text>
                    {dossier.created_at && (
                        <Text style={styles.dateText}>{new Date(dossier.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}</Text>
                    )}
                </View>

                {/* Body Content */}
                <View style={styles.markdownWrap}>
                    <Markdown style={markdownStyles}>
                        {dossier.full_content || dossier.excerpt || ''}
                    </Markdown>
                </View>

                {/* Interactions */}
                <View style={styles.actionBlock}>
                    <PressableScale 
                        style={styles.actionBtn} 
                        onPress={handleCertify}
                        haptic="light"
                        pressedScale={0.95}
                    >
                        <Text style={[styles.actionIcon, certified && styles.actionIconActive]}>✦</Text>
                        <Text style={[styles.actionLabel, certified && styles.actionLabelActive]}>
                            {certified ? 'CERTIFIED' : 'CERTIFY'}
                        </Text>
                    </PressableScale>
                </View>

                <Text style={styles.endMark}>— ✦ —</Text>

                {/* Annotations */}
                <View style={styles.commentsSection}>
                    <SectionDivider label={`ANNOTATIONS (${comments.length})`} />
                    
                    {comments.map((c: DossierComment) => (
                        <View key={c.id} style={styles.commentItem}>
                        <PressableScale onPress={() => router.push(`/user/${c.username}`)} haptic="selection" pressedScale={0.98}>
                            <Text style={styles.commUsername}>@{c.username}</Text>
                        </PressableScale>
                        <Text style={styles.commBody}>{c.body}</Text>
                        <View style={styles.commMetaRow}>
                            <Text style={styles.commDate}>{new Date(c.created_at).toLocaleDateString()}</Text>
                            {user?.id === c.user_id && (
                            <PressableScale onPress={() => handleDeleteComment(c.id)} haptic="heavy" pressedScale={0.95}>
                                <Text style={styles.commDelete}>DELETE</Text>
                            </PressableScale>
                            )}
                        </View>
                        </View>
                    ))}

                    {comments.length === 0 && (
                        <Text style={styles.emptyComments}>No critiques yet on this dossier.</Text>
                    )}
                </View>
            </ScrollView>

            {/* Input Box */}
            <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                <TextInput
                    style={styles.input}
                    placeholder="Add an annotation..."
                    placeholderTextColor={colors.fog}
                    value={newComment}
                    onChangeText={handleNewCommentChange}
                    multiline
                    maxLength={500}
                    keyboardAppearance="dark"
                    accessibilityLabel="Dossier annotation"
                    selectionColor={'rgba(218,165,32,0.3)'}
                />
                <PressableScale style={styles.postBtn} onPress={handlePostComment} disabled={!newComment.trim() || posting} haptic="medium" pressedScale={0.95}>
                    <Text style={[styles.postBtnText, { opacity: newComment.trim() ? 1 : 0.5 }]}>POST</Text>
                </PressableScale>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.ink,
    },
    navBlock: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingBottom: 16,
        paddingHorizontal: 20,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.ash,
        backgroundColor: colors.soot,
    },
    backBtn: {
        paddingRight: 16,
    },
    backIcon: {
        fontSize: 16,
        color: colors.fog,
        fontFamily: fonts.ui,
    },
    navMark: {
        fontFamily: fonts.uiBold,
        fontSize: 10,
        letterSpacing: 2,
        color: colors.sepia,
        flex: 1,
        textAlign: 'center',
        paddingRight: 32, // Offset back button to center exactly
    },
    paper: {
        flex: 1,
    },
    paperContent: {
        padding: 24,
        paddingBottom: 60,
    },
    title: {
        fontFamily: fonts.sub,
        fontSize: 34,
        color: colors.parchment,
        marginBottom: 20,
        lineHeight: 42,
    },
    bylineBlock: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 16,
        marginBottom: 24,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(139,105,20,0.15)',
        borderStyle: 'dashed',
    },
    bylineText: {
        fontFamily: fonts.uiMedium,
        fontSize: 10,
        letterSpacing: 1.5,
        color: colors.fog,
    },
    authorHighlight: {
        color: colors.sepia,
        fontFamily: fonts.uiBold,
    },
    dateText: {
        fontFamily: fonts.ui,
        fontSize: 9,
        letterSpacing: 1,
        color: colors.fog,
    },
    markdownWrap: {
        marginBottom: 40,
    },
    actionBlock: {
        flexDirection: 'row',
        gap: 20,
        borderTopWidth: 1,
        borderTopColor: 'rgba(139,105,20,0.1)',
        paddingTop: 20,
        marginTop: 20,
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    actionIcon: {
        fontSize: 12,
        color: colors.fog,
    },
    actionIconActive: {
        color: colors.sepia,
    },
    actionLabel: {
        fontFamily: fonts.uiMedium,
        fontSize: 10,
        letterSpacing: 2,
        color: colors.fog,
    },
    actionLabelActive: {
        color: colors.sepia,
    },
    endMark: {
        fontFamily: fonts.display,
        fontSize: 16,
        color: colors.fog,
        textAlign: 'center',
        marginTop: 40,
    },
    // Annotations
    commentsSection: { marginTop: 40 },
    emptyComments: { fontFamily: fonts.body, fontSize: 12, fontStyle: 'italic', color: colors.fog, textAlign: 'center', marginTop: 24 },
    commentItem: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash },
    commUsername: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 1, color: colors.sepia, marginBottom: 4 },
    commBody: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 18 },
    commMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
    commDate: { fontFamily: fonts.ui, fontSize: 9, color: colors.fog },
    commDelete: { fontFamily: fonts.uiMedium, fontSize: 9, letterSpacing: 1, color: colors.bloodReel },

    // Input
    inputRow: {
        flexDirection: 'row', alignItems: 'center', padding: 12,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ash,
        backgroundColor: colors.soot
    },
    input: {
        flex: 1, backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.ash,
        borderRadius: 4, paddingHorizontal: 12, paddingVertical: 10,
        color: colors.parchment, fontFamily: fonts.body, fontSize: 13,
        maxHeight: 100,
    },
    postBtn: { paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center' },
    postBtnText: { fontFamily: fonts.uiBold, fontSize: 11, letterSpacing: 2, color: colors.sepia },
});

const markdownStyles = {
    body: {
        fontFamily: fonts.body,
        fontSize: 15,
        color: colors.bone,
        lineHeight: 26,
    },
    heading2: {
        fontFamily: fonts.sub,
        fontSize: 24,
        color: colors.parchment,
        marginTop: 32,
        marginBottom: 16,
    },
    heading3: {
        fontFamily: fonts.sub,
        fontSize: 18,
        color: colors.parchment,
        marginTop: 24,
        marginBottom: 12,
    },
    blockquote: {
        backgroundColor: 'rgba(139,105,20,0.05)',
        borderLeftWidth: 2,
        borderLeftColor: colors.sepia,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginVertical: 20,
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
        marginVertical: 32,
        opacity: 0.2,
    },
};
