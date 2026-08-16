import { SectionDivider } from '@/src/components/Decorative';
import { CinematicScrollView } from '@/src/components/layout/CinematicScrollView';
import { ContentActionSheet } from '@/src/components/moderation/ContentActionSheet';
import ReportSheet from '@/src/components/moderation/ReportSheet';
import PressableScale from '@/src/components/PressableScale';
import ShareToLoungeModal from '@/src/components/ShareToLoungeModal';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Heart, MessageCircle, MoreHorizontal, Send } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { onMarkdownLinkPress, capMarkdownForRender } from '@/src/utils/markdownSafety';
import Markdown from 'react-native-markdown-display';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { useBlockStore } from '@/src/stores/blockStore';
import { useDispatchStore } from '@/src/stores/content';
import { colors, effects, fonts } from '@/src/theme/theme';
import { DossierComment, DossierDetail } from '@/src/types';
import { enqueueMutation, flushOfflineQueue, getOfflineQueue } from '@/src/utils/offlineQueue';
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';
import { formatDate, formatDateMonthDay } from '@/src/utils/timeAgo';
import { buildCritiquePayload, type CritiqueRow } from '@/src/utils/critiquePayload';
import reelToast from '@/src/utils/reelToast';
import TactileEngine from '@/src/utils/TactileEngine';
import * as Crypto from 'expo-crypto';
import { z } from 'zod';

// In-flight guard (not a timestamp throttle): blocks re-tapping certify on the same
// dossier until the prior RPC has actually resolved, so a fast second tap can't read
// optimistic state that the first call hasn't confirmed yet.
const _certifyPending = new Set<string>();

const PAGE_SIZE = 30;

// Average adult reading pace ≈ 220 wpm; floor at one minute.
function readMinutes(text: string): number {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 220));
}

function formatCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`;
    return String(n);
}


// dossier_comments has no FK to profiles, so faces arrive via one batched
// lookup per page. Faces are decoration — a failure never blocks the words.
async function attachFaces(rows: DossierComment[]): Promise<CritiqueRow[]> {
    const ids = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
    if (ids.length === 0) return rows;
    try {
        const { data } = await supabase.from('profiles').select('id, avatar_url').in('id', ids);
        const faces = new Map((data ?? []).map(p => [p.id as string, p.avatar_url as string | null]));
        return rows.map(r => ({ ...r, avatar_url: faces.get(r.user_id) ?? null }));
    } catch {
        return rows;
    }
}

export default function DossierReaderScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { user } = useAuthStore();
    const insets = useSafeAreaInsets();
    
    const keyboard = useAnimatedKeyboard();
    // KEYBOARD LAW (router screen): iOS pads by keyboard height; Android's
    // window resize lifts the composer natively — padding both would
    // double-shift. Resting padding (insets.bottom) is identical on both.
    const animatedContainerStyle = useAnimatedStyle(() => ({
        paddingBottom: Platform.OS === 'ios' ? Math.max(keyboard.height.value, insets.bottom) : insets.bottom,
    }));
    
    const [dossier, setDossier] = useState<DossierDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [certified, setCertified] = useState(false);
    const [comments, setComments] = useState<CritiqueRow[]>([]);
    const [commentTotal, setCommentTotal] = useState(0);
    const [loadingMore, setLoadingMore] = useState(false);
    const [shareVisible, setShareVisible] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [posting, setPosting] = useState(false);

    // Jump-to-critiques plumbing: the scroll handle + the section's measured y.
    const scrollRef = useRef<Animated.ScrollView>(null);
    const critiquesY = useRef(0);
    // Ref (not state) guards the pagination lock so the callback identity never
    // churns mid-flight — the lesson of the follow-requests deadlock.
    const loadingMoreRef = useRef(false);
    const [actionSheetVisible, setActionSheetVisible] = useState(false);
    const [reportSheetVisible, setReportSheetVisible] = useState(false);
    const [commentActionSheetVisible, setCommentActionSheetVisible] = useState(false);
    const [commentReportSheetVisible, setCommentReportSheetVisible] = useState(false);
    const [selectedComment, setSelectedComment] = useState<DossierComment | null>(null);

    const blockUser = useBlockStore((state) => state.blockUser);
    const muteUser = useBlockStore((state) => state.muteUser);

    // Callback isolation: stabilize critique input handler
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

                // Parallelized reads — dossier, comments, and certification are
                // independent (they only need `id`/`user.id`), so fire them
                // concurrently instead of as a sequential waterfall.
                const [dossierRes, commRes, certRes] = await Promise.all([
                    supabase
                        .from('dispatch_dossiers')
                        .select('id, title, excerpt, full_content, author_username, user_id, created_at, views, certify_count')
                        .eq('id', id)
                        .single(),
                    supabase
                        .from('dossier_comments')
                        .select('id, user_id, username, body, created_at', { count: 'exact' })
                        .eq('dossier_id', id)
                        .order('created_at', { ascending: false })
                        .limit(PAGE_SIZE),
                    user
                        ? supabase
                            .from('dossier_certifications')
                            .select('id')
                            .eq('user_id', user.id)
                            .eq('dossier_id', id)
                            .maybeSingle()
                        : Promise.resolve({ data: null, error: null }),
                ]);

                const { data, error } = dossierRes;

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

                // Comments (fetched in parallel above) — newest first, one page,
                // total count riding the same round trip.
                const commData = (commRes.data ?? []) as DossierComment[];
                const serverTotal = commRes.count ?? commData.length;

                // Offline Queue Stitching — queued critiques are ours and are the
                // newest words in the room, so they sit at the top of the pile.
                const queue = getOfflineQueue();
                const pendingAdds = queue.filter(q => q.type === 'add_dossier_comment' && q.payload.dossier_id === id);

                const finalComments: CritiqueRow[] = await attachFaces(commData);
                for (const pa of pendingAdds) {
                    const p = pa.payload;
                    finalComments.unshift({
                        id: `offline-${Date.now()}-${Math.random()}`,
                        user_id: p.user_id,
                        username: p.username || 'anonymous',
                        body: p.body,
                        created_at: new Date().toISOString(),
                        avatar_url: user?.avatar_url ?? null,
                    } as unknown as CritiqueRow);
                }

                setComments(finalComments);
                setCommentTotal(serverTotal + pendingAdds.length);
                
                // Certification (fetched in parallel above)
                if (user) {
                    setCertified(!!certRes.data);
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

    // Keyset pagination, unbounded: every earlier page is one tap away no
    // matter how deep the pile grows. Cursor = oldest loaded created_at.
    const loadEarlier = useCallback(async () => {
        if (loadingMoreRef.current) return;
        const oldest = comments[comments.length - 1];
        if (!oldest) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);
        try {
            const { data, error } = await supabase
                .from('dossier_comments')
                .select('id, user_id, username, body, created_at')
                .eq('dossier_id', id)
                .lt('created_at', oldest.created_at)
                .order('created_at', { ascending: false })
                .limit(PAGE_SIZE);
            if (error) throw error;
            const rows = await attachFaces((data ?? []) as DossierComment[]);
            if (rows.length) {
                setComments(prev => {
                    const seen = new Set(prev.map(c => c.id));
                    return [...prev, ...rows.filter(r => !seen.has(r.id))];
                });
            }
        } catch (err: unknown) {
            if (__DEV__) console.warn('[Dossier] Load earlier error:', err);
            reelToast.error('Could not retrieve earlier critiques.');
        } finally {
            loadingMoreRef.current = false;
            setLoadingMore(false);
        }
    }, [comments, id]);

    // The CRITIQUES key scrolls to the section — it never summons the keyboard.
    const handleJumpToCritiques = useCallback(() => {
        TactileEngine.navigate();
        scrollRef.current?.scrollTo({ y: Math.max(critiquesY.current - 12, 0), animated: true });
    }, []);

    const handleOpenShareLounge = useCallback(() => {
        if (!user) return (router.push as any)('/login');
        if (id.startsWith('seed')) {
            reelToast.error('House specimens cannot be shared to lounges.');
            return;
        }
        setShareVisible(true);
    }, [user, id]);

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

        // finding 104 — cleaned BEFORE the optimistic row is built, so the words on
        // screen are the words that get stored. Sanitising at the insert instead would
        // leave the author reading a version of their critique that no longer exists.
        const tempComment = buildCritiquePayload(newComment, {
            id, tempId, userId: user.id, username: user.username, avatarUrl: user.avatar_url,
        });
        if (!tempComment) {
            setPosting(false);
            return;
        }

        // Optimistic UI update — newest words sit at the top of the pile.
        setComments(prev => [tempComment, ...prev]);
        setCommentTotal(t => t + 1);
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
                // Keep the optimistic face — the server echo doesn't carry one.
                setComments(prev => prev.map(c => c.id === tempId ? { ...data, avatar_url: tempComment.avatar_url } : c));
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
                reelToast.success('Critique queued for offline transmission.');
            } else {
                setComments(prev => prev.filter(c => c.id !== tempId));
                setCommentTotal(t => Math.max(t - 1, 0));
                if (__DEV__) console.warn('[Dossier] Post comment error:', err);
                reelToast.error('Failed to file critique.');
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
        setCommentTotal(t => Math.max(t - 1, 0));
        
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
                if (removed) {
                    setComments(prev => [...prev, removed].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
                    setCommentTotal(t => t + 1);
                }
                if (__DEV__) console.warn('[Dossier] Delete comment error:', err);
                reelToast.error('Failed to delete critique.');
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
                <Text style={styles.navMark}>FROM THE DISPATCH</Text>
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
                ref={scrollRef}
                style={styles.paper}
                contentContainerStyle={styles.paperContent}
            >
                <Text style={[styles.title, effects.textGlowSepia]}>{dossier.title}</Text>

                <View style={styles.bylineBlock}>
                    <PressableScale
                        style={styles.bylineAuthorBtn}
                        onPress={() => (router.push as any)(`/user/${dossier.author_username}`)}
                        haptic="selection"
                        pressedScale={0.97}
                        accessibilityRole="button"
                        accessibilityLabel={`View @${dossier.author_username}'s dossier`}
                    >
                        <Text style={styles.bylineText} numberOfLines={1}>FILED BY <Text style={styles.authorHighlight}>@{dossier.author_username}</Text></Text>
                    </PressableScale>
                    <Text style={styles.dateText} numberOfLines={1}>
                        {[
                            dossier.created_at ? formatDateMonthDay(dossier.created_at) : null,
                            `${readMinutes(dossier.full_content || dossier.excerpt || '')} MIN`,
                            (dossier.views ?? 0) > 0 ? `${formatCount(dossier.views ?? 0)} READINGS` : null,
                        ].filter(Boolean).join(' · ')}
                    </Text>
                </View>

                {/* Body Content */}
                <View style={styles.markdownWrap}>
                    {/* onLinkPress is a SECURITY control, not a convenience — without it
                        the library opens any href straight through Linking.openURL, so
                        [tap](javascript:…) / (intent://…) in a published dossier bypasses
                        the app's URL allowlist. See utils/markdownSafety.ts. */}
                    <Markdown style={markdownStyles} onLinkPress={onMarkdownLinkPress}>
                        {capMarkdownForRender(dossier.full_content || dossier.excerpt || '')}
                    </Markdown>
                </View>

                {/* ── ACTION BAR: Certify · Critiques · Share to Lounge ── */}
                <View style={styles.actionBar}>
                    <PressableScale style={styles.actionItem} onPress={handleCertify} hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }} haptic="selection" accessibilityRole="button" accessibilityLabel={certified ? 'Uncertify dossier' : 'Certify dossier'}>
                        <View pointerEvents="none"><Heart size={16} strokeWidth={2} color={certified ? colors.crimson : colors.fog} fill={certified ? colors.crimson : 'transparent'} /></View>
                        <Text style={[styles.actionLabel, certified && styles.actionLabelActive]} pointerEvents="none" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                            {certified ? 'CERTIFIED' : 'CERTIFY'}
                        </Text>
                    </PressableScale>

                    <View style={styles.actionDivider} />

                    <PressableScale style={styles.actionItem} onPress={handleJumpToCritiques} hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }} haptic="selection" accessibilityRole="button" accessibilityLabel="Jump to critiques">
                        <View pointerEvents="none"><MessageCircle size={14} color={colors.fog} /></View>
                        <Text style={styles.actionLabel} pointerEvents="none" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                            {commentTotal > 0 ? `CRITIQUES (${formatCount(commentTotal)})` : 'CRITIQUES'}
                        </Text>
                    </PressableScale>

                    <View style={styles.actionDivider} />

                    <PressableScale style={styles.actionItem} onPress={handleOpenShareLounge} hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }} haptic="selection" accessibilityRole="button" accessibilityLabel="Share to lounge">
                        <View pointerEvents="none"><Send size={14} color={colors.fog} /></View>
                        <Text style={styles.actionLabel} pointerEvents="none" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>LOUNGE</Text>
                    </PressableScale>
                </View>

                <Text style={styles.endMark}>— ✦ —</Text>

                {/* Critiques — newest first, every earlier page one tap away */}
                <View
                    style={styles.commentsSection}
                    onLayout={(e) => { critiquesY.current = e.nativeEvent.layout.y; }}
                >
                    <SectionDivider label={`CRITIQUES (${formatCount(commentTotal)})`} />

                    {comments.map((c: CritiqueRow) => (
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
                          accessibilityLabel={`Critique by ${c.username}`}
                          accessibilityHint={c.user_id !== user?.id ? "Long press to report or block" : undefined}
                        >
                        <View style={styles.commentItem}>
                        <PressableScale style={styles.commAuthorRow} onPress={() => (router.push as any)(`/user/${c.username}`)} haptic="selection" pressedScale={0.98}>
                            <View style={styles.commAvatar}>
                                {c.avatar_url
                                    ? <Image source={{ uri: c.avatar_url }} style={styles.commAvatarImg} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                                    : <Text style={styles.commAvatarLetter}>{c.username?.[0]?.toUpperCase()}</Text>}
                            </View>
                            <Text style={styles.commUsername} numberOfLines={1}>@{c.username}</Text>
                        </PressableScale>
                        <Text style={styles.commBody}>{c.body}</Text>
                        <View style={styles.commMetaRow}>
                            <Text style={styles.commDate}>{formatDate(c.created_at)}</Text>
                            {user?.id === c.user_id && (
                            <PressableScale onPress={() => handleDeleteComment(c.id)} haptic="heavy" pressedScale={0.95}>
                                <Text style={styles.commDelete}>DELETE</Text>
                            </PressableScale>
                            )}
                        </View>
                        </View>
                        </PressableScale>
                    ))}

                    {commentTotal > comments.length && (
                        <PressableScale
                            style={styles.loadEarlierBtn}
                            onPress={loadEarlier}
                            disabled={loadingMore}
                            haptic="selection"
                            pressedScale={0.97}
                            accessibilityRole="button"
                            accessibilityLabel={`Load ${commentTotal - comments.length} earlier critiques`}
                        >
                            <Text style={styles.loadEarlierText}>
                                {loadingMore ? 'RETRIEVING…' : `✦ LOAD EARLIER · ${formatCount(commentTotal - comments.length)} MORE`}
                            </Text>
                        </PressableScale>
                    )}

                    {comments.length === 0 && (
                        <Text style={styles.emptyComments}>No critiques filed yet — the first word is yours.</Text>
                    )}
                </View>
            </CinematicScrollView>

            {/* Input Box */}
            <View style={[styles.inputRow, { paddingBottom: 12 }]}>
                <TextInput
                    style={styles.input}
                    placeholder="File a critique..."
                    placeholderTextColor={colors.fog}
                    value={newComment}
                    onChangeText={handleNewCommentChange}
                    multiline
                    maxLength={MAX_LENGTHS.dossierComment}
                    keyboardAppearance="dark"
                    accessibilityLabel="Dossier critique"
                    selectionColor={colors.selection}
                />
                <PressableScale style={styles.postBtn} onPress={handlePostComment} disabled={!newComment.trim() || posting} haptic="medium" pressedScale={0.95}>
                    <Text style={[styles.postBtnText, { opacity: newComment.trim() ? 1 : 0.5 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{posting ? 'FILING…' : 'FILE CRITIQUE'}</Text>
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

            {/* Share to Lounge */}
            <ShareToLoungeModal
                visible={shareVisible}
                onClose={() => setShareVisible(false)}
                dossierId={dossier.id}
                dossierTitle={dossier.title}
                dossierAuthor={dossier.author_username}
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
        fontFamily: fonts.sub,
    },
    navMark: {
        fontFamily: fonts.sub,
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
        fontFamily: fonts.display,
        fontSize: 28,
        color: colors.parchment,
        marginBottom: 20,
        lineHeight: 38,
    },
    bylineBlock: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingBottom: 16,
        marginBottom: 24,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(139,105,20,0.15)',
        borderStyle: 'dashed',
    },
    bylineAuthorBtn: {
        flexShrink: 1,
    },
    bylineText: {
        fontFamily: fonts.sub,
        fontSize: 10,
        letterSpacing: 1.5,
        color: colors.fog,
    },
    authorHighlight: {
        color: colors.sepia,
        fontFamily: fonts.sub,
    },
    dateText: {
        fontFamily: fonts.sub,
        fontSize: 9,
        letterSpacing: 1,
        color: colors.fog,
    },
    markdownWrap: {
        marginBottom: 40,
    },
    // ── Action Bar (the house trio: Certify · Critiques · Lounge) ──
    actionBar: {
        flexDirection: 'row', alignItems: 'center',
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(184,137,26,0.25)',
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(184,137,26,0.25)',
        paddingVertical: 14, marginTop: 20,
    },
    actionItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    actionLabel: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.5, color: colors.fog },
    actionLabelActive: { color: colors.crimson },
    actionDivider: { width: 1, height: 16, backgroundColor: 'rgba(184,137,26,0.2)' },
    endMark: {
        fontFamily: fonts.display,
        fontSize: 16,
        color: colors.fog,
        textAlign: 'center',
        marginTop: 40,
    },
    // Critiques
    commentsSection: { marginTop: 40 },
    emptyComments: { fontFamily: fonts.body, fontSize: 12, fontStyle: 'italic', color: colors.fog, textAlign: 'center', marginTop: 24 },
    commentItem: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash },
    commAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, alignSelf: 'flex-start' },
    commAvatar: {
        width: 22, height: 22, borderRadius: 11, overflow: 'hidden',
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.soot, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash,
    },
    commAvatarImg: { width: '100%', height: '100%' },
    commAvatarLetter: { fontFamily: fonts.sub, fontSize: 10, color: colors.sepia, includeFontPadding: false },
    commUsername: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1, color: colors.sepia, flexShrink: 1 },
    commBody: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 18 },
    commMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
    commDate: { fontFamily: fonts.sub, fontSize: 9, color: colors.fog },
    // Same control, same colour as the log page's — see logDetailStyles.
    // Crimson at 9pt is 3.2:1 on ink; `danger` is 5.2:1 and still red.
    commDelete: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1, color: colors.danger },
    loadEarlierBtn: { paddingVertical: 16, alignItems: 'center' },
    loadEarlierText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.sepia },

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
    postBtnText: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2, color: colors.sepia },
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
        fontFamily: fonts.body,
        backgroundColor: colors.sepiaSubtle,
        color: colors.parchmentBright,
        paddingHorizontal: 4,
        borderRadius: 4,
    },
    code_block: {
        fontFamily: fonts.body,
        backgroundColor: colors.ink,
        color: colors.parchment,
        padding: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.sepiaBorder,
        marginVertical: 16,
    },
    fence: {
        fontFamily: fonts.body,
        backgroundColor: colors.ink,
        color: colors.parchment,
        padding: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.sepiaBorder,
        marginVertical: 16,
    },
};
