import { nav } from '@/src/utils/typedRouter';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, InteractionManager, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/src/components/EmptyStates';
import PressableScale from '@/src/components/PressableScale';
import { LoungeService } from '@/src/services/LoungeService';
import { ProfileService } from '@/src/services/ProfileWriteService';
import { useAuthStore } from '@/src/stores/auth';
import { useLoungeStore } from '@/src/stores/lounge';
import { colors, fonts } from '@/src/theme/theme';
import { logger } from '@/src/utils/logger';
import reelToast from '@/src/utils/reelToast';
import { BlurView } from 'expo-blur';
import { Check, Film as FilmIcon, Send, User, UserCircle2, Users, X } from 'lucide-react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

interface SocialProfile {
    id: string;
    username: string;
    avatar_url?: string | null;
    role?: string;
}

interface LoungeItem {
    lounge_id: string;
    lounges?: { id: string; name: string } | { id: string; name: string }[] | null | undefined;
}

// ── Determine modal mode from params ──────────────────────────────────────────
type ModalMode = 'followers' | 'following' | 'share-film' | 'share-person';

function resolveMode(params: Record<string, string | undefined>): { mode: ModalMode; valid: boolean } {
    const type = params.type;
    if (type === 'followers' || type === 'following') {
        return { mode: type, valid: !!params.userId };
    }
    if (params.shareFilmId) {
        return { mode: 'share-film', valid: true };
    }
    if (params.personId) {
        return { mode: 'share-person', valid: true };
    }
    return { mode: 'followers', valid: false };
}

function resolveTitle(mode: ModalMode): string {
    switch (mode) {
        case 'followers': return 'FOLLOWERS';
        case 'following': return 'FOLLOWING';
        case 'share-film': return 'SHARE TO LOUNGE';
        case 'share-person': return 'SHARE TO LOUNGE';
    }
}

// ── Lounge Row Component ──────────────────────────────────────────────────────
const LoungeRow = React.memo(function LoungeRow({ 
    lounge, onShare, sharing, shared 
}: { 
    lounge: { id: string; name: string }; 
    onShare: (loungeId: string) => void; 
    sharing: string | null;
    shared: Set<string>;
}) {
    const isSharing = sharing === lounge.id;
    const isShared = shared.has(lounge.id);

    return (
        <View style={styles.userRow}>
            <View style={styles.loungeIconWrap}>
                <Users size={18} color={colors.sepia} strokeWidth={1.5} />
            </View>
            <View style={styles.userInfo}>
                <Text style={styles.username}>{lounge.name.toUpperCase()}</Text>
                <Text style={styles.role}>LOUNGE</Text>
            </View>
            <PressableScale
                onPress={() => onShare(lounge.id)}
                disabled={isSharing || isShared}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                haptic="selection"
                pressedScale={0.92}
                accessibilityRole="button"
                accessibilityLabel={isShared ? 'Already shared to this lounge' : `Share to ${lounge.name}`}
            >
                <View style={[styles.shareChip, isShared && styles.shareChipDone]}>
                    {isSharing ? (
                        <ActivityIndicator size="small" color={colors.sepia} />
                    ) : isShared ? (
                        <>
                            <Check size={10} color={colors.sepia} strokeWidth={2.5} />
                            <Text style={styles.shareChipText}>SENT</Text>
                        </>
                    ) : (
                        <>
                            <Send size={10} color={colors.bone} strokeWidth={1.5} />
                            <Text style={styles.shareChipText}>SHARE</Text>
                        </>
                    )}
                </View>
            </PressableScale>
        </View>
    );
});

export default function SocialModal() {
    const rawParams = useLocalSearchParams<{
        userId?: string;
        type?: string;
        shareFilmId?: string;
        shareFilmTitle?: string;
        shareFilmPoster?: string;
        shareFilmYear?: string;
        personId?: string;
        personName?: string;
    }>();

    const normalizeString = (val: string | string[] | undefined): string | undefined => 
        Array.isArray(val) ? val[0] : val;

    const params = useMemo(() => ({
        userId: normalizeString(rawParams.userId),
        type: normalizeString(rawParams.type),
        shareFilmId: normalizeString(rawParams.shareFilmId),
        shareFilmTitle: normalizeString(rawParams.shareFilmTitle),
        shareFilmPoster: normalizeString(rawParams.shareFilmPoster),
        shareFilmYear: normalizeString(rawParams.shareFilmYear),
        personId: normalizeString(rawParams.personId),
        personName: normalizeString(rawParams.personName),
    }), [rawParams.userId, rawParams.type, rawParams.shareFilmId, rawParams.shareFilmTitle, rawParams.shareFilmPoster, rawParams.shareFilmYear, rawParams.personId, rawParams.personName]);

    const { mode, valid } = useMemo(() => resolveMode(params), [params]);
    const { user } = useAuthStore();

    const [loading, setLoading] = useState(true);
    const [profiles, setProfiles] = useState<SocialProfile[]>([]);
    const [lounges, setLounges] = useState<{ id: string; name: string }[]>([]);
    const [timedOut, setTimedOut] = useState(false);
    const [sharingTo, setSharingTo] = useState<string | null>(null);
    const [sharedTo, setSharedTo] = useState<Set<string>>(new Set());

    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    // 15s timeout prevents permanent spinner on API hang
    useEffect(() => {
        if (!loading) { setTimedOut(false); return; }
        const timer = setTimeout(() => { if (isMounted.current) setTimedOut(true); }, 15000);
        return () => clearTimeout(timer);
    }, [loading]);

    // ── Data fetching ──────────────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            if (mode === 'followers' || mode === 'following') {
                // Original social connections mode
                const result = await ProfileService.getSocialConnections(params.userId!, mode);
                if (isMounted.current) setProfiles(result.profiles || []);
            } else {
                // Share mode — fetch user's lounges
                if (!user?.id) {
                    if (isMounted.current) { setLoading(false); }
                    return;
                }
                const userLounges = await LoungeService.getUserLounges(user.id);
                if (isMounted.current) {
                    const parsed = userLounges.map((ul: LoungeItem) => {
                        const l = Array.isArray(ul.lounges) ? ul.lounges[0] : ul.lounges;
                        return l ? { id: l.id, name: l.name } : null;
                    }).filter(Boolean) as { id: string; name: string }[];
                    setLounges(parsed);
                }
            }
         
        } catch (err) {
            reelToast.error('The telegraph to the archive is disrupted.');
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, [mode, params.userId, user?.id]);

    useEffect(() => {
        if (!valid) {
            InteractionManager.runAfterInteractions(() => {
                if (isMounted.current) nav.back();
            });
            return;
        }

        fetchData();
    }, [valid, fetchData]);

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleProfilePress = useCallback((username: string) => {
        router.dismiss();
        InteractionManager.runAfterInteractions(() => {
            nav.push(`/user/${username}`);
        });
    }, []);

    const handleShareToLounge = useCallback(async (loungeId: string) => {
        if (!user?.id || sharingTo) return;
        setSharingTo(loungeId);

        try {
            let success = false;
            const { sendMessage } = useLoungeStore.getState();

            if (mode === 'share-film' && params.shareFilmId) {
                success = await sendMessage(
                    loungeId,
                    `Check out ${params.shareFilmTitle ?? 'this film'}`,
                    'film_share',
                    {
                        film_id: Number(params.shareFilmId),
                        film_title: params.shareFilmTitle ?? undefined,
                        film_poster: params.shareFilmPoster ?? undefined,
                    }
                );
            } else if (mode === 'share-person' && params.personId) {
                success = await sendMessage(
                    loungeId,
                    `Check out ${params.personName ?? 'this artist'}`,
                    'text',
                    {
                        metadata: {
                            personId: params.personId,
                            personName: params.personName ?? null,
                        }
                    }
                );
            }

            if (isMounted.current) {
                if (success) {
                    setSharedTo(prev => new Set(prev).add(loungeId));
                    reelToast.success('Shared to lounge');
                } else {
                    reelToast.error('Failed to share. Try again.');
                }
            }
        } catch (err) {
            logger.warn('[SocialModal] Share failed:', err);
            reelToast.error('Failed to share. Try again.');
        } finally {
            if (isMounted.current) setSharingTo(null);
        }
    }, [user?.id, mode, params.shareFilmId, params.shareFilmTitle, params.shareFilmPoster, params.personId, params.personName, sharingTo]);

    // ── Render helpers ────────────────────────────────────────────────────────
    const renderSocialItem = useCallback(({ item, index }: { item: SocialProfile; index: number }) => (
        <Animated.View entering={FadeInUp.duration(300).delay(Math.min(index * 40, 400))}>
            <PressableScale onPress={() => handleProfilePress(item.username)} accessibilityRole="button" accessibilityLabel={`View ${item.username}'s profile`}>
                <View style={styles.userRow}>
                    {item.avatar_url && item.avatar_url.startsWith('http') ? (
                        <Image source={{ uri: item.avatar_url }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
                    ) : (
                        <View style={styles.avatarPlaceholder}><User size={20} color={colors.parchment} /></View>
                    )}
                    <View style={styles.userInfo}>
                        <Text style={styles.username}>@{item.username.toUpperCase()}</Text>
                        <Text style={styles.role}>{(item.role ?? 'member').toUpperCase()}</Text>
                    </View>
                </View>
            </PressableScale>
        </Animated.View>
    ), [handleProfilePress]);

    const renderLoungeItem = useCallback(({ item, index }: { item: { id: string; name: string }; index: number }) => (
        <Animated.View entering={FadeInUp.duration(300).delay(Math.min(index * 40, 400))}>
            <LoungeRow lounge={item} onShare={handleShareToLounge} sharing={sharingTo} shared={sharedTo} />
        </Animated.View>
    ), [handleShareToLounge, sharingTo, sharedTo]);

    // ── Share context banner ──────────────────────────────────────────────────
    const shareBanner = useMemo(() => {
        if (mode === 'share-film' && params.shareFilmTitle) {
            return (
                <View style={styles.shareBanner}>
                    <FilmIcon size={12} color={colors.sepia} strokeWidth={1.5} />
                    <Text style={styles.shareBannerText} numberOfLines={1}>
                        {params.shareFilmTitle.toUpperCase()}{params.shareFilmYear ? ` (${params.shareFilmYear})` : ''}
                    </Text>
                </View>
            );
        }
        if (mode === 'share-person' && params.personName) {
            return (
                <View style={styles.shareBanner}>
                    <UserCircle2 size={12} color={colors.sepia} strokeWidth={1.5} />
                    <Text style={styles.shareBannerText} numberOfLines={1}>
                        {params.personName.toUpperCase()}
                    </Text>
                </View>
            );
        }
        return null;
    }, [mode, params.shareFilmTitle, params.shareFilmYear, params.personName]);

    // ── Determine list data ──────────────────────────────────────────────────
    const isShareMode = mode === 'share-film' || mode === 'share-person';
    const listData = isShareMode ? lounges : profiles;
    const isEmpty = !loading && listData.length === 0;

    const retryFetch = useCallback(() => {
        setTimedOut(false);
        fetchData();
    }, [fetchData]);

    return (
        <BlurView intensity={90} tint="dark" style={styles.container} accessibilityViewIsModal={true}>
            {/* Drag handle */}
            <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>

            <View style={styles.header}>
                <View style={{ width: 40 }} />
                <Text style={styles.title}>{resolveTitle(mode)}</Text>
                <PressableScale onPress={() => nav.back()} style={styles.closeBtn} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="selection" pressedScale={0.92} accessibilityRole="button" accessibilityLabel="Close social modal">
                    <X size={20} color={colors.parchment} />
                </PressableScale>
            </View>

            {/* Share context banner */}
            {shareBanner}

            {loading ? (
                <View style={styles.center}>
                    {timedOut ? (
                        <>
                            <Text style={[styles.username, styles.timeoutTitle]}>CONNECTION TIMED OUT</Text>
                            <Text style={styles.timeoutSubtext}>The telegraph to the archive is disrupted.</Text>
                            <PressableScale
                                onPress={retryFetch}
                                style={styles.retryBtn}
                                haptic="light"
                                accessibilityRole="button"
                                accessibilityLabel="Retry loading"
                            >
                                <Text style={styles.retryBtnText}>RETRY</Text>
                            </PressableScale>
                        </>
                    ) : (
                        <ActivityIndicator size="large" color={colors.sepia} />
                    )}
                </View>
            ) : isEmpty ? (
                <View style={styles.center}>
                    <EmptyState
                        icon={isShareMode
                            ? <Users size={28} color={colors.sepia} strokeWidth={1} />
                            : <Users size={28} color={colors.sepia} strokeWidth={1} />
                        }
                        title={isShareMode ? 'No Lounges Found' : 'The Circle Is Empty'}
                        subtitle={isShareMode
                            ? 'You haven\'t joined any lounges yet. Join a lounge to share content with fellow cinephiles.'
                            : mode === 'followers'
                                ? 'No one follows this member yet.'
                                : 'This member hasn\'t followed anyone yet.'
                        }
                    />
                </View>
            ) : isShareMode ? (
                <FlashList 
                    data={lounges}
                    estimatedItemSize={68}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ padding: 16 }}
                    renderItem={renderLoungeItem}
                />
            ) : (
                <FlashList 
                    data={profiles}
                    estimatedItemSize={68}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ padding: 16 }}
                    renderItem={renderSocialItem}
                />
            )}
        </BlurView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.ink },
    dragHandleWrap: { alignItems: 'center', paddingTop: 10 },
    dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(184,137,26,0.2)',
    },
    title: { fontFamily: fonts.sub, fontSize: 12, letterSpacing: 4, color: colors.sepia },
    closeBtn: { width: 40, height: 40, alignItems: 'flex-end', justifyContent: 'center' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    // ── Share Banner ──
    shareBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        marginHorizontal: 16, marginTop: 4, marginBottom: 4,
        paddingHorizontal: 14, paddingVertical: 10,
        backgroundColor: 'rgba(184,137,26,0.08)',
        borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)',
        borderRadius: 3,
    },
    shareBannerText: {
        flex: 1,
        fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.5,
        color: colors.bone,
    },

    // ── User/Profile Row ──
    userRow: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash,
    },
    avatar: { width: 44, height: 44, borderRadius: 22 },
    avatarPlaceholder: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: 'rgba(184,137,26,0.15)', alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: 'rgba(184,137,26,0.3)',
    },
    userInfo: { marginLeft: 14, flex: 1 },
    username: { fontFamily: fonts.sub, fontSize: 15, color: colors.parchment, marginBottom: 2 },
    role: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.5, color: colors.fog },

    // ── Lounge Row ──
    loungeIconWrap: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: 'rgba(184,137,26,0.1)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: 'rgba(184,137,26,0.25)',
    },
    shareChip: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 12, paddingVertical: 8,
        borderRadius: 2, borderWidth: 1,
        borderColor: 'rgba(215,205,190,0.15)',
        backgroundColor: 'rgba(25,23,20,0.8)',
    },
    shareChipDone: {
        borderColor: 'rgba(184,137,26,0.3)',
        backgroundColor: 'rgba(184,137,26,0.08)',
    },
    shareChipText: {
        fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.5,
        color: colors.bone,
    },

    // ── Timeout State ──
    timeoutTitle: { textAlign: 'center' } as import('react-native').TextStyle,
    timeoutSubtext: {
        fontFamily: fonts.sub, fontSize: 12, color: colors.fog,
        textAlign: 'center', marginTop: 4,
    },
    retryBtn: {
        marginTop: 16, paddingVertical: 10, paddingHorizontal: 24,
        borderWidth: 1, borderColor: colors.sepia, borderRadius: 3,
    },
    retryBtnText: {
        fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.sepia,
    },
});
