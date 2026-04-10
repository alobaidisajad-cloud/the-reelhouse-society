import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import { SectionDivider } from '@/src/components/Decorative';
import { useLocalSearchParams, router } from 'expo-router';
import Markdown from 'react-native-markdown-display';
import * as Haptics from 'expo-haptics';

import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts } from '@/src/theme/theme';
import reelToast from '@/src/utils/reelToast';

export default function DossierReaderScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { user } = useAuthStore();
    
    const [dossier, setDossier] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [certified, setCertified] = useState(false);
    const [certifyCount, setCertifyCount] = useState(0);
    const [comments, setComments] = useState<any[]>([]);
    const [newComment, setNewComment] = useState('');
    const [posting, setPosting] = useState(false);

    useEffect(() => {
        async function fetchDossier() {
            setLoading(true);
            try {
                // In a real scenario we'd query dispatch_dossiers
                const { data, error } = await supabase
                    .from('dispatch_dossiers')
                    .select('*')
                    .eq('id', id)
                    .single();
                
                if (error) throw error;
                setDossier(data);
                
                // Track view count (simplified)
                const { error: rpcError } = await supabase.rpc('increment_dossier_views', { dossier_uuid: id });
                if (rpcError) console.log(rpcError);

                // Fetch Comments
                const { data: commData } = await supabase
                    .from('dossier_comments')
                    .select('*')
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
            } catch (err: any) {
                reelToast.error('Dossier not found or encrypted.');
                router.back();
            } finally {
                setLoading(false);
            }
        }
        
        // Seeded content bypass for UI testing if 'id' starts with seed
        if (id.startsWith('seed')) {
            setDossier({
                title: 'The Architecture of Anxiety',
                author: 'NitrateOracle',
                created_at: new Date().toISOString(),
                full_content: `The modern cinematic landscape operates primarily on **tension**. It is not the tension of the plot, but the tension of *existence*. \n\n## The Framing Device\nWhen we look closely at how the camera moves through a physical space, we see the echoes of our own societal claustrophobia.`
            });
            setLoading(false);
            return;
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
        } catch { 
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
        } catch {}
    };

    const handleCertify = async () => {
        if (!user || id.startsWith('seed')) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        
        const wasCertified = certified;
        setCertified(!wasCertified);
        setCertifyCount(prev => wasCertified ? Math.max(0, prev - 1) : prev + 1);
        
        try {
            await supabase.rpc('toggle_dossier_certify', { dossier_uuid: id });
        } catch {
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
        <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
            style={styles.container}
        >
            {/* Header / Nav */}
            <View style={styles.navBlock}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{top:10,bottom:10,left:10,right:10}}>
                    <Text style={styles.backIcon}>✕</Text>
                </TouchableOpacity>
                <Text style={styles.navMark}>REELHOUSE DIGITAL DOSSIER</Text>
            </View>

            <ScrollView 
                style={styles.paper} 
                contentContainerStyle={styles.paperContent}
                showsVerticalScrollIndicator={false}
            >
                <Text style={styles.title}>{dossier.title}</Text>
                
                <View style={styles.bylineBlock}>
                    <Text style={styles.bylineText}>FILED BY <Text style={styles.authorHighlight}>@{dossier.author}</Text></Text>
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
                    <TouchableOpacity 
                        style={styles.actionBtn} 
                        onPress={handleCertify}
                        activeOpacity={0.7}
                    >
                        <Text style={[styles.actionIcon, certified && styles.actionIconActive]}>✦</Text>
                        <Text style={[styles.actionLabel, certified && styles.actionLabelActive]}>
                            {certified ? 'CERTIFIED' : 'CERTIFY'}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={styles.actionBtn} 
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            reelToast('Sharing coming soon');
                        }}
                    >
                        <Text style={styles.actionLabel}>SHARE</Text>
                    </TouchableOpacity>
                </View>

                <Text style={styles.endMark}>— ✦ —</Text>

                {/* Annotations */}
                <View style={styles.commentsSection}>
                    <SectionDivider label={`ANNOTATIONS (${comments.length})`} />
                    
                    {comments.map((c: any) => (
                        <View key={c.id} style={styles.commentItem}>
                        <TouchableOpacity onPress={() => router.push(`/user/${c.username}`)} activeOpacity={0.7}>
                            <Text style={styles.commUsername}>@{c.username}</Text>
                        </TouchableOpacity>
                        <Text style={styles.commBody}>{c.body}</Text>
                        <View style={styles.commMetaRow}>
                            <Text style={styles.commDate}>{new Date(c.created_at).toLocaleDateString()}</Text>
                            {user?.id === c.user_id && (
                            <TouchableOpacity onPress={() => handleDeleteComment(c.id)}>
                                <Text style={styles.commDelete}>DELETE</Text>
                            </TouchableOpacity>
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
            <View style={styles.inputRow}>
                <TextInput
                    style={styles.input}
                    placeholder="Add an annotation..."
                    placeholderTextColor={colors.fog}
                    value={newComment}
                    onChangeText={setNewComment}
                    multiline
                    maxLength={500}
                />
                <TouchableOpacity style={styles.postBtn} onPress={handlePostComment} disabled={!newComment.trim() || posting}>
                    <Text style={[styles.postBtnText, { opacity: newComment.trim() ? 1 : 0.5 }]}>POST</Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
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
        paddingTop: 60,
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
        backgroundColor: colors.soot, paddingBottom: Platform.OS === 'ios' ? 32 : 12
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
