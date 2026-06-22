import { SectionDivider } from '@/src/components/Decorative';
import { CinematicScrollView } from '@/src/components/layout/CinematicScrollView';
import { ContentActionSheet } from '@/src/components/moderation/ContentActionSheet';
import ReportSheet from '@/src/components/moderation/ReportSheet';
import PressableScale from '@/src/components/PressableScale';
import { router, useLocalSearchParams } from 'expo-router';
import { MoreHorizontal } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { useBlockStore } from '@/src/stores/blockStore';
import { useDispatchStore } from '@/src/stores/content';
import { colors, fonts } from '@/src/theme/theme';
import { DossierComment, DossierDetail } from '@/src/types';
import { enqueueMutation, flushOfflineQueue, getOfflineQueue } from '@/src/utils/offlineQueue';
import reelToast from '@/src/utils/reelToast';
import TactileEngine from '@/src/utils/TactileEngine';
import * as Crypto from 'expo-crypto';
import { z } from 'zod';

// In-flight guard (not a timestamp throttle): blocks re-tapping certify on the same
// dossier until the prior RPC has actually resolved, so a fast second tap can't read
// optimistic state that the first call hasn't confirmed yet.
const _certifyPending = new Set<string>();

export default function DossierReaderScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { user } = useAuthStore();
    const insets = useSafeAreaInsets();
    
    const keyboard = useAnimatedKeyboard();
    const animatedContainerStyle = useAnimatedStyle(() => ({
        paddingBottom: Math.max(keyboard.height.value, insets.bottom),
    }));
    
    const [dossier, setDossier] = useState<DossierDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [certified, setCertified] = useState(false);
    const [comments, setComments] = useState<DossierComment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [posting, setPosting] = useState(false);
    const [actionSheetVisible, setActionSheetVisible] = useState(false);
    const [reportSheetVisible, setReportSheetVisible] = useState(false);
    const [commentActionSheetVisible, setCommentActionSheetVisible] = useState(false);
    const [commentReportSheetVisible, setCommentReportSheetVisible] = useState(false);
    const [selectedComment, setSelectedComment] = useState<DossierComment | null>(null);

    const blockUser = useBlockStore((state) => state.blockUser);
    const muteUser = useBlockStore((state) => state.muteUser);

    // Callback isolation: stabilize annotation input handler
    const handleNewCommentChange = useCallback((text: string) => {
        setNewComment(text);
    }, []);

    useEffect(() => {
        async function fetchDossier() {
            setLoading(true);
            try {
                const localDossier = useDispatchStore.getState().dossiers.find(d => d.id === id);
                if (localDossier) {
                    setDossier(localDossier as DossierDetail);
                }

                // In a real scenario we'd query dispatch_dossiers
                const { data, error } = await supabase
                    .from('dispatch_dossiers')
                    .select('id, title, excerpt, full_content, author_username, user_id, created_at, views, certify_count')
                    .eq('id', id)
                    .single();
                
                if (error) {
                    if (localDossier) {
                        const errLower = (error.message || '').toLowerCase();
                        if (error.code === 'PGRST116' || errLower.includes('fetch') || errLower.includes('network')) {
                            setLoading(false);
                            return; // Keep local dossier and exit gracefully
                        }
                    }
                    throw error;
                }
                
                setDossier(data);
                
                // Track view count cleanly (deduplicated per session)
                if (useDispatchStore.getState().markDossierViewed(id)) {
                    useDispatchStore.getState().syncDossierStats(id, 1, 0);
                    supabase.rpc('increment_dossier_views', { dossier_uuid: id }).then(({ error: rpcError }) => {
                        if (rpcError) {
                            const errStr = (rpcError.message || '').toLowerCase();
                            if (errStr.includes('fetch') || errStr.includes('network') || errStr.includes('timeout')) {
                                enqueueMutation({ type: 'increment_dossier_views', payload: { dossier_uuid: id } });
                                flushOfflineQueue();
                            } else {
                                useDispatchStore.getState().syncDossierStats(id, -1, 0);
                                useDispatchStore.getState().unmarkDossierViewed(id);
                            }
                        }
                    });
                }

                // Fetch Comments
                const { data: commData } = await supabase
                    .from('dossier_comments')
                    .select('id, user_id, username, body, created_at')
                    .eq('dossier_id', id)
                    .order('created_at', { ascending: true });
                
                // Offline Queue Stitching
                const queue = getOfflineQueue();
                const pendingAdds = queue.filter(q => q.type === 'add_dossier_comment' && q.payload.dossier_id === id);
                
                let finalComments = commData || [];
                for (const pa of pendingAdds) {
                    const p = pa.payload;
                    finalComments.push({
                        id: `offline-${Date.now()}-${Math.random()}`,
                        user_id: p.user_id,
                        username: p.username || 'anonymous',
                        body: p.body,
                        created_at: new Date().toISOString()
                    } as unknown as DossierComment);
                }
                
                setComments(finalComments);
                
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
        if (!user) return (router.push as any)('/login');
        if (!newComment.trim() || posting || id.startsWith('seed')) return;

        // Pre-flight Zod validation
        if (!z.string().uuid().safeParse(id).success) {
            reelToast.error('Invalid dossier record.');
            return;
        }

        setPosting(true);
        const tempId = Crypto.randomUUID();
        const tempComment = {
            id: tempId,
            dossier_id: id,
            user_id: user.id,
            username: user.username,
            body: newComment.trim(),
            created_at: new Date().toISOString()
        } as unknown as DossierComment;

        // Optimistic UI update
        setComments(prev => [...prev, tempComment]);
        setNewComment('');

        try {
            const { data, error } = await supabase.from('dossier_comments').insert({
                dossier_id: id,
                user_id: user.id,
                username: user.username,
                body: tempComment.body,
            }).select().single();

            if (error) throw error;
            if (data) {
                TactileEngine.success();
                setComments(prev => prev.map(c => c.id === tempId ? data : c));
            }
        } catch (err: any) { 
            const errStr = (err.message || '').toLowerCase();
            if (errStr.includes('fetch') || errStr.includes('network') || errStr.includes('timeout')) {
                enqueueMutation({
                    type: 'add_dossier_comment',
                    payload: {
                        _tempId: tempId,
                        dossier_id: id,
                        user_id: user.id,
                        username: user.username,
                        body: tempComment.body,
                    }
                });
                flushOfflineQueue();
                reelToast.success('Annotation queued for offline transmission.');
            } else {
                setComments(prev => prev.filter(c => c.id !== tempId));
                if (__DEV__) console.warn('[Dossier] Post comment error:', err);
                reelToast.error('Failed to annotate.');
            }
        } finally {
            setPosting(false);
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        if (!user) return;
        TactileEngine.destroy();
        
        const removed = comments.find(c => c.id === commentId);
        setComments(prev => prev.filter(c => c.id !== commentId));
        
        try {
            const { error } = await supabase.from('dossier_comments').delete()
                .eq('id', commentId)
                .eq('user_id', user.id);
            if (error) throw error;
        } catch (err: any) {
            const errStr = (err.message || '').toLowerCase();
            if (errStr.includes('fetch') || errStr.includes('network') || errStr.includes('timeout')) {
                enqueueMutation({
                    type: 'delete_dossier_comment',
                    payload: { comment_id: commentId, user_id: user.id }
                });
                flushOfflineQueue();
                reelToast.success('Deletion queued offline.');
            } else {
                if (removed) setComments(prev => [...prev, removed].sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
                if (__DEV__) console.warn('[Dossier] Delete comment error:', err);
                reelToast.error('Failed to delete annotation.');
            }
        }
    };

    const handleCertify = async () => {
        if (!user || id.startsWith('seed')) return;

        // Pre-flight Zod validation
        if (!z.string().uuid().safeParse(id).success) {
            return;
        }

        if (_certifyPending.has(id)) return;
        _certifyPending.add(id);

        TactileEngine.navigate();

        const wasCertified = certified;
        const certifyDelta = wasCertified ? -1 : 1;
        setCertified(!wasCertified);
        useDispatchStore.getState().syncDossierStats(id, 0, certifyDelta, !wasCertified);

        try {
            const { error } = await supabase.rpc('toggle_dossier_certify', { dossier_uuid: id });
            if (error) throw error;
        } catch (err: any) {
            const errStr = (err.message || '').toLowerCase();
            if (errStr.includes('fetch') || errStr.includes('network') || errStr.includes('timeout')) {
                enqueueMutation({
                    type: 'toggle_dossier_certify',
                    payload: { dossier_uuid: id, desired_state: !wasCertified }
                });
                flushOfflineQueue();
                reelToast.success('Certification queued offline.');
            } else {
                if (__DEV__) console.warn('[Dossier] Certify error:', err);
                setCertified(wasCertified);
                useDispatchStore.getState().syncDossierStats(id, 0, -certifyDelta, wasCertified);
                reelToast.error('Certification failed');
            }
        } finally {
            _certifyPending.delete(id);
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
                {user?.id !== dossier?.user_id && (
                    <PressableScale
                        style={styles.moreBtn}
                        onPress={() => setActionSheetVisible(true)}
                        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                        haptic="selection"
                        pressedScale={0.92}
                        accessibilityLabel="More options for this dispatch"
                    >
                        <MoreHorizontal size={16} color={colors.fog} strokeWidth={1.5} />
                    </PressableScale>
                )}
            </View>

            <CinematicScrollView 
                style={styles.paper} 
                contentContainerStyle={styles.paperContent}
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
                        <PressableScale
                          key={c.id}
                          onLongPress={() => {
                            if (c.user_id !== user?.id) {
                              TactileEngine.destroy();
                              setSelectedComment(c);
                              setCommentActionSheetVisible(true);
                            }
                          }}
                          delayLongPress={400}
                          pressedScale={0.98}
                          accessibilityLabel={`Comment by ${c.username}`}
                          accessibilityHint={c.user_id !== user?.id ? "Long press to report or block" : undefined}
                        >
                        <View style={styles.commentItem}>
                        <PressableScale onPress={() => (router.push as any)(`/user/${c.username}`)} haptic="selection" pressedScale={0.98}>
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
                        </PressableScale>
                    ))}

                    {comments.length === 0 && (
                        <Text style={styles.emptyComments}>No critiques yet on this dossier.</Text>
                    )}
                </View>
            </CinematicScrollView>

            {/* Input Box */}
            <View style={[styles.inputRow, { paddingBottom: 12 }]}>
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

            {/* Content Action Sheet (Report/Block/Mute) */}
            <ContentActionSheet
                visible={actionSheetVisible}
                targetUserId={dossier.user_id ?? ''}
                targetUsername={dossier.author_username || 'unknown'}
                contentType="dossier"
                contentId={dossier.id}
                onClose={() => setActionSheetVisible(false)}
                onReport={() => {
                    setActionSheetVisible(false);
                    setReportSheetVisible(true);
                }}
                onBlock={() => {
                    if (dossier.user_id) blockUser(dossier.user_id);
                    setActionSheetVisible(false);
                }}
                onMute={() => {
                    if (dossier.user_id) muteUser(dossier.user_id);
                    setActionSheetVisible(false);
                }}
            />

            {/* Report Sheet */}
            <ReportSheet
                visible={reportSheetVisible}
                contentType="dossier"
                contentId={dossier.id}
                targetUserId={dossier.user_id ?? ''}
                targetUsername={dossier.author_username || 'unknown'}
                onDismiss={() => setReportSheetVisible(false)}
            />

            {/* Comment Moderation: Action Sheet & Report Sheet */}
            {selectedComment && (
              <>
                <ContentActionSheet
                  visible={commentActionSheetVisible}
                  contentType="dossier_comment"
                  contentId={selectedComment.id}
                  targetUserId={selectedComment.user_id}
                  targetUsername={selectedComment.username}
                  hideMute
                  onClose={() => {
                    setCommentActionSheetVisible(false);
                    setSelectedComment(null);
                  }}
                  onReport={() => {
                    setCommentActionSheetVisible(false);
                    setCommentReportSheetVisible(true);
                  }}
                  onBlock={() => {
                    blockUser(selectedComment.user_id);
                    setCommentActionSheetVisible(false);
                    setSelectedComment(null);
                  }}
                  onMute={() => {
                    setCommentActionSheetVisible(false);
                    setSelectedComment(null);
                  }}
                />
                <ReportSheet
                  visible={commentReportSheetVisible}
                  contentType="dossier_comment"
                  contentId={selectedComment.id}
                  targetUserId={selectedComment.user_id}
                  targetUsername={selectedComment.username}
                  onDismiss={() => {
                    setCommentReportSheetVisible(false);
                    setSelectedComment(null);
                  }}
                />
              </>
            )}
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
    moreBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginLeft: 8,
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
    heading1: {
        fontFamily: fonts.sub,
        fontSize: 32,
        color: colors.parchment,
        marginTop: 24,
        marginBottom: 12,
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
    heading4: {
        fontFamily: fonts.sub,
        fontSize: 16,
        color: colors.parchment,
        marginTop: 16,
        marginBottom: 8,
    },
    heading5: {
        fontFamily: fonts.sub,
        fontSize: 14,
        color: colors.parchment,
        marginTop: 16,
        marginBottom: 8,
    },
    heading6: {
        fontFamily: fonts.sub,
        fontSize: 12,
        color: colors.parchment,
        marginTop: 16,
        marginBottom: 8,
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
    link: {
        color: colors.sepia,
        textDecorationLine: 'underline' as const,
    },
    code_inline: {
        fontFamily: fonts.ui,
        backgroundColor: colors.sepiaSubtle,
        color: colors.parchmentBright,
        paddingHorizontal: 4,
        borderRadius: 4,
    },
    code_block: {
        fontFamily: fonts.ui,
        backgroundColor: colors.ink,
        color: colors.parchment,
        padding: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.sepiaBorder,
        marginVertical: 16,
    },
    fence: {
        fontFamily: fonts.ui,
        backgroundColor: colors.ink,
        color: colors.parchment,
        padding: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.sepiaBorder,
        marginVertical: 16,
    },
};
