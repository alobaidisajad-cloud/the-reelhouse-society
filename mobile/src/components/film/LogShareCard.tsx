/**
 * LogShareCard — Premium adaptive share card for film logs.
 * 
 * Two distinct layouts:
 *   1. CINEMATIC — Short/no review: Large poster, centered title, big rating.
 *   2. EDITORIAL — Long review: Side-by-side poster+title, full review text in magazine column style.
 * 
 * Uses react-native-view-shot + expo-sharing for native share sheet.
 */
import { useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, Share, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn } from 'react-native-reanimated';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { tmdb } from '@/src/lib/tmdb';
import reelToast from '@/src/utils/reelToast';


export interface ShareCardData {
    filmTitle: string;
    filmYear?: string;
    year?: string;
    posterPath?: string | null;
    posterUri?: string;
    backdropUri?: string;
    rating: number;
    review?: string;
    username: string;
    status?: 'watched' | 'rewatched' | 'abandoned';
    abandonedReason?: string | null;
    role?: string;
    watchedWith?: string;
    pullQuote?: string;
    dropCap?: boolean;
}

interface Props {
    visible?: boolean;
    data: ShareCardData;
    onClose?: () => void;
}

function ReelRating({ rating, size = 18 }: { rating: number; size?: number }) {
    return (
        <View style={rs.container}>
            {[1, 2, 3, 4, 5].map(i => {
                const filled = i <= Math.floor(rating);
                const half = !filled && i === Math.ceil(rating) && rating % 1 >= 0.5;
                return (
                    <Text key={i} style={[rs.reel, { fontSize: size }, filled ? rs.reelFilled : half ? rs.reelHalf : rs.reelEmpty]}>◉</Text>
                );
            })}
        </View>
    );
}

const rs = StyleSheet.create({
    container: { flexDirection: 'row', gap: 3, alignItems: 'center' },
    reel: { fontSize: 18 },
    reelFilled: { color: colors.sepia },
    reelHalf: { color: 'rgba(139,105,20,0.5)' },
    reelEmpty: { color: 'rgba(255,255,255,0.08)' },
});

/** Strips HTML tags from review text */
function stripHtml(text: string): string {
    return (text || '').replace(/<[^>]+>/g, '').trim();
}

/** The inner card content — shared between embedded and modal modes */
function CardContent({ data }: { data: ShareCardData }) {
    const posterUrl = data.posterUri ?? (data.posterPath ? tmdb.poster(data.posterPath, 'w500') : null);
    const yearDisplay = data.filmYear ?? data.year ?? '';
    const rawReview = stripHtml(data.review || '');
    const isLong = rawReview.length > 200;
    const hasReview = rawReview.length > 0;
    const statusLabel = data.status === 'rewatched' ? 'REWATCHED' : data.status === 'abandoned' ? `ABANDONED${data.abandonedReason ? ` — ${data.abandonedReason.toUpperCase()}` : ''}` : 'WATCHED';

    const { width } = useWindowDimensions();
    const cardWidth = Math.min(width - 48, 380);

    return (
        <View style={[s.card, { width: cardWidth }]}>
            {/* Atmospheric blurred poster backdrop */}
            {posterUrl && (
                <Image
                    source={{ uri: posterUrl }}
                    style={s.backdropBlur}
                    blurRadius={40}
                    contentFit="cover"
                />
            )}
            {/* Dark gradient overlay */}
            <LinearGradient
                colors={['rgba(10,7,3,0.6)', 'rgba(10,7,3,0.85)', 'rgba(10,7,3,0.95)']}
                style={StyleSheet.absoluteFillObject}
            />
            {/* Film grain texture */}
            <View style={s.grainOverlay} />

            <View style={s.cardInner}>
                {/* ── TOP: Username + Branding ── */}
                <View style={s.topRow}>
                    <View style={s.userChip}>
                        <View style={s.userDot} />
                        <Text style={s.username}>@{data.username}</Text>
                    </View>
                    <Text style={s.brandSmall}>REELHOUSE</Text>
                </View>

                {isLong ? (
                    /* ══════════════════════════════════
                       EDITORIAL LAYOUT — Long reviews
                    ══════════════════════════════════ */
                    <View>
                        {/* Compact film header */}
                        <View style={s.editorialHeader}>
                            {posterUrl && (
                                <Image
                                    source={{ uri: posterUrl }}
                                    style={s.editorialPoster}
                                    contentFit="cover"
                                />
                            )}
                            <View style={s.editorialMeta}>
                                <View style={s.statusChip}>
                                    <Text style={s.statusText}>{statusLabel}</Text>
                                </View>
                                <Text style={s.editorialTitle} adjustsFontSizeToFit numberOfLines={3} minimumFontScale={0.8}>{data.filmTitle}</Text>
                                {yearDisplay ? <Text style={s.editorialYear}>{yearDisplay}</Text> : null}
                                <ReelRating rating={data.rating} size={14} />
                            </View>
                        </View>

                        {/* Pull quote */}
                        {data.pullQuote && (
                            <View style={s.pullQuoteWrap}>
                                <View style={s.pullQuoteLine} />
                                <Text style={s.pullQuoteText}>« {data.pullQuote} »</Text>
                            </View>
                        )}

                        {/* Full review — no truncation */}
                        <Text style={s.editorialReview}>
                            {data.dropCap ? (
                                <>
                                    <Text style={s.dropCapLetter}>{rawReview.charAt(0)}</Text>
                                    <Text>{rawReview.slice(1)}</Text>
                                </>
                            ) : (
                                rawReview
                            )}
                        </Text>
                    </View>
                ) : (
                    /* ══════════════════════════════════
                       CINEMATIC LAYOUT — Short reviews
                    ══════════════════════════════════ */
                    <View style={s.cinematicBody}>
                        {/* Large centered poster */}
                        {posterUrl && (
                            <View style={s.cinematicPosterWrap}>
                                <Image
                                    source={{ uri: posterUrl }}
                                    style={[s.cinematicPoster, { width: cardWidth * 0.55, height: cardWidth * 0.55 * 1.5 }]}
                                    contentFit="cover"
                                />
                            </View>
                        )}

                        {/* Status badge */}
                        <View style={s.statusChipCenter}>
                            <Text style={s.statusText}>{statusLabel}</Text>
                        </View>

                        {/* Title */}
                        <Text style={s.cinematicTitle} adjustsFontSizeToFit numberOfLines={3} minimumFontScale={0.8}>{data.filmTitle}</Text>
                        {yearDisplay ? <Text style={s.cinematicYear}>{yearDisplay}</Text> : null}

                        {/* Rating */}
                        <View style={s.cinematicRating}>
                            <ReelRating rating={data.rating} size={20} />
                        </View>

                        {/* Watched with */}
                        {data.watchedWith && (
                            <Text style={s.watchedWith}>♡ W/ {data.watchedWith.toUpperCase()}</Text>
                        )}

                        {/* Short review */}
                        {hasReview && (
                            <Text style={s.cinematicReview}>&quot;{rawReview}&quot;</Text>
                        )}
                    </View>
                )}

                {/* ── BOTTOM: Watermark ── */}
                <View style={s.bottomRow}>
                    <Text style={s.brandLarge}>REELHOUSE</Text>
                    <Text style={s.brandSub}>THE SOCIETY</Text>
                </View>
            </View>
        </View>
    );
}

export default function LogShareCard({ visible, data, onClose }: Props) {
    // Modal mode hooks
    const cardRef = useRef<ViewShot>(null);
    const [sharing, setSharing] = useState(false);

    const handleShare = useCallback(async () => {
        if (!cardRef.current?.capture) return;
        setSharing(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        try {
            const uri = await (cardRef.current as any)?.capture?.();
            if (!uri) return;
            const isAvailable = await Sharing.isAvailableAsync();
            if (isAvailable) {
                await Sharing.shareAsync(uri, {
                    mimeType: 'image/png',
                    dialogTitle: `${data.filmTitle} — ReelHouse Log`,
                });
            } else {
                await Share.share({
                    message: `${data.filmTitle} (${data.filmYear || data.year || ''}) — ${data.rating}/5 reels\n\n${data.review || ''}\n\n— via The ReelHouse Society`,
                });
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            if (msg !== 'User did not share') reelToast.error(msg);
        } finally {
            setSharing(false);
        }
    }, [data]);

    // Embedded mode (off-screen capture by parent)
    if (visible === undefined) {
        return <CardContent data={data} />;
    }

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={s.overlay}>
                <Animated.View entering={FadeIn.duration(300)} style={s.modalContent}>
                    <PressableScale style={s.closeBtn} onPress={onClose} haptic="light">
                        <Text style={s.closeBtnText}>✕</Text>
                    </PressableScale>

                    <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }}>
                        <CardContent data={data} />
                    </ViewShot>

                    <PressableScale
                        style={s.shareBtn}
                        onPress={handleShare}
                        disabled={sharing}
                        pressedScale={0.97}
                    >
                        <Text style={s.shareBtnText}>
                            {sharing ? 'PREPARING...' : '✦ SHARE CARD'}
                        </Text>
                    </PressableScale>
                </Animated.View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    // ── Modal chrome ──
    overlay: {
        flex: 1, backgroundColor: 'rgba(5,3,1,0.97)',
        justifyContent: 'center', alignItems: 'center', padding: 24,
    },
    modalContent: { width: '100%', maxWidth: 400, alignItems: 'center' },
    closeBtn: {
        position: 'absolute', top: -44, right: 0, zIndex: 10,
        width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 18,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },
    closeBtnText: { fontSize: 16, color: colors.fog },
    shareBtn: {
        backgroundColor: colors.sepia, paddingVertical: 14,
        paddingHorizontal: 48, borderRadius: 4, marginTop: 20,
    },
    shareBtnText: { fontFamily: fonts.uiBold, fontSize: 12, letterSpacing: 2, color: colors.ink },

    // ── Card container ──
    card: {
        backgroundColor: '#0A0703',
        borderRadius: 0, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(139,105,20,0.35)',
    },
    backdropBlur: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.5,
    },
    grainOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.03)',
        zIndex: 1,
    },
    cardInner: {
        position: 'relative', zIndex: 2,
        padding: 24,
    },

    // ── Top row ──
    topRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, paddingBottom: 10,
        borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.12)',
    },
    userChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    userDot: {
        width: 20, height: 20, borderRadius: 10,
        backgroundColor: 'rgba(139,105,20,0.15)',
        borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    },
    username: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.parchment },
    brandSmall: { fontFamily: fonts.ui, fontSize: 6, letterSpacing: 3.5, color: colors.sepia, opacity: 0.6 },

    // ── Status chip ──
    statusChip: {
        alignSelf: 'flex-start',
        backgroundColor: colors.sepia, paddingHorizontal: 8, paddingVertical: 3,
        borderRadius: 2, marginBottom: 8,
    },
    statusChipCenter: {
        alignSelf: 'center',
        backgroundColor: colors.sepia, paddingHorizontal: 10, paddingVertical: 3,
        borderRadius: 2, marginBottom: 10,
    },
    statusText: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 3, color: colors.ink },

    // ══════════════════════════════════
    // EDITORIAL layout styles
    // ══════════════════════════════════
    editorialHeader: {
        flexDirection: 'row', gap: 14, marginBottom: 16, alignItems: 'flex-start',
    },
    editorialPoster: {
        width: 72, height: 108, borderRadius: 3, flexShrink: 0,
        borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)',
    },
    editorialMeta: { flex: 1, paddingTop: 2 },
    editorialTitle: {
        fontFamily: fonts.display, fontSize: 20, color: colors.parchment,
        lineHeight: 24, marginBottom: 4,
    },
    editorialYear: {
        fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2,
        color: colors.fog, marginBottom: 8,
    },
    pullQuoteWrap: {
        paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: colors.sepia,
        backgroundColor: 'rgba(139,105,20,0.05)', paddingVertical: 10,
        paddingHorizontal: 12, marginBottom: 14,
    },
    pullQuoteLine: {},
    pullQuoteText: {
        fontFamily: fonts.display, fontStyle: 'italic', fontSize: 14,
        color: colors.sepia, lineHeight: 20,
    },
    editorialReview: {
        fontFamily: fonts.body, fontSize: 12, color: colors.bone,
        lineHeight: 21, opacity: 0.9,
    },
    dropCapLetter: {
        fontFamily: fonts.display, fontSize: 32, color: colors.sepia,
        lineHeight: 28,
    },

    // ══════════════════════════════════
    // CINEMATIC layout styles
    // ══════════════════════════════════
    cinematicBody: { alignItems: 'center' },
    cinematicPosterWrap: {
        marginBottom: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.7, shadowRadius: 30, elevation: 12,
    },
    cinematicPoster: {
        borderRadius: 4, borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)',
    },
    cinematicTitle: {
        fontFamily: fonts.display, fontSize: 26, color: colors.parchment,
        textAlign: 'center', lineHeight: 30, marginBottom: 4,
        textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 3 },
        textShadowRadius: 10,
    },
    cinematicYear: {
        fontFamily: fonts.ui, fontSize: 11, letterSpacing: 3,
        color: colors.fog, marginBottom: 10,
    },
    cinematicRating: { marginBottom: 12 },
    watchedWith: {
        fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.5,
        color: colors.fog, marginBottom: 10,
    },
    cinematicReview: {
        fontFamily: fonts.body, fontSize: 13, color: colors.bone,
        fontStyle: 'italic', lineHeight: 20, textAlign: 'center',
        paddingHorizontal: 8, opacity: 0.85,
    },

    // ── Bottom row ──
    bottomRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 20, paddingTop: 10,
        borderTopWidth: 1, borderTopColor: 'rgba(139,105,20,0.12)',
    },
    brandLarge: {
        fontFamily: fonts.display, fontSize: 16, color: colors.sepia, opacity: 0.8,
        letterSpacing: 1,
    },
    brandSub: {
        fontFamily: fonts.ui, fontSize: 6, letterSpacing: 3,
        color: colors.fog, opacity: 0.5,
    },
});
