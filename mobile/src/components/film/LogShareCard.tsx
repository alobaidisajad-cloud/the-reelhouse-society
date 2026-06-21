import { useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, Share } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn } from 'react-native-reanimated';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { colors, fonts, effects } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { tmdb } from '@/src/lib/tmdb';
import reelToast from '@/src/utils/reelToast';
import { ReelRating } from '@/src/components/Decorative';

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

const DOSSIER_CARD_WIDTH = 360;
const DOSSIER_CARD_HEIGHT = 640;

function CornerTicks() {
    const TICK = 12;
    const INSET = 14;
    const RIGHT = DOSSIER_CARD_WIDTH - INSET;
    const BOTTOM = DOSSIER_CARD_HEIGHT - INSET;
    
    return (
        <>
            <View style={[s.tickH, { top: 0, left: 0 }]} />
            <View style={[s.tickV, { top: 0, left: 0 }]} />
            
            <View style={[s.tickH, { top: 0, right: 0 }]} />
            <View style={[s.tickV, { top: 0, right: 0 }]} />
            
            <View style={[s.tickH, { bottom: 0, left: 0 }]} />
            <View style={[s.tickV, { bottom: 0, left: 0 }]} />
            
            <View style={[s.tickH, { bottom: 0, right: 0 }]} />
            <View style={[s.tickV, { bottom: 0, right: 0 }]} />
        </>
    );
}

const ENTITIES: Record<string, string> = {
  '&quot;': '"', '&apos;': "'", '&#39;': "'", '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' '
};

function cleanReviewText(text: string): string {
    if (!text) return '';
    let parsed = text.replace(/<(p|div|br)[^>]*>/gi, '\n').replace(/<(?:\/?(?:p|div|br|b|i|strong|em|span|a|ul|li))[^>]*>/gi, '').trim();
    return parsed.replace(/&[a-z0-9#]+;/gi, (m) => ENTITIES[m] || m);
}

function truncateReview(text: string, maxLength = 350) {
    const raw = cleanReviewText(text);
    if (raw.length <= maxLength) return raw;
    const cut = raw.lastIndexOf(' ', maxLength);
    return raw.substring(0, cut > 40 ? cut : maxLength).trimEnd() + '…';
}

function CardContent({ data }: { data: ShareCardData }) {
    const posterUrl = data.posterUri ?? (data.posterPath ? tmdb.poster(data.posterPath, 'w780') : null);
    const reviewText = data.review ? truncateReview(data.review) : null;
    const yearDisplay = data.filmYear ?? data.year ?? '';

    return (
        <View style={s.cardContainer}>
            <View style={s.insetBorder} pointerEvents="none">
                <CornerTicks />
            </View>

            <View style={s.topHud}>
                <Text style={s.topHudText}>? ARCHIVE DOSSIER ?</Text>
            </View>

            <View style={s.spacerLg} />

            <View style={s.posterWrapper}>
                <View style={s.posterArt}>
                    {posterUrl ? (
                        <Image source={{ uri: posterUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                    ) : (
                        <View style={[StyleSheet.absoluteFillObject, s.posterPlaceholder]}>
                            <Text style={s.placeholderGlyph}>Ø</Text>
                        </View>
                    )}
                </View>
            </View>

            <View style={s.spacerMd} />

            <View style={s.placard}>
                <Text style={s.filmTitle} numberOfLines={2} adjustsFontSizeToFit>{data.filmTitle}</Text>
                
                <Text style={s.filmMeta}>
                    {yearDisplay}
                </Text>

                {data.rating > 0 && (
                    <View style={s.ratingWrap}>
                        <ReelRating rating={data.rating} size={14} />
                    </View>
                )}

                <Text style={s.reviewText} numberOfLines={4}>
                    "{reviewText || 'Classified Analysis'}"
                </Text>

                {data.username && (
                    <Text style={s.attribution}>— @{data.username.toUpperCase()}</Text>
                )}
            </View>

            <View style={s.spacerMd} />

            <View style={s.footerLockup}>
                <Image source={require('@/assets/images/reelhouse-logo-transparent.png')} style={s.footerLogo} />
                <Text style={s.footerText}>THE REELHOUSE SOCIETY</Text>
            </View>
        </View>
    );
}

export default function LogShareCard({ visible, data, onClose }: Props) {
    if (visible === undefined) {
        return <CardContent data={data} />;
    }
    return <LogShareCardModal visible={visible} data={data} onClose={onClose} />;
}

function LogShareCardModal({ visible, data, onClose }: { visible: boolean; data: ShareCardData; onClose?: () => void }) {
    const cardRef = useRef<ViewShot>(null);
    const [sharing, setSharing] = useState(false);

    const handleShare = useCallback(async () => {
        if (!cardRef.current?.capture) return;
        setSharing(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        try {
            const uri = await cardRef.current?.capture?.();
            if (!uri) return;
            const isAvailable = await Sharing.isAvailableAsync();
            if (isAvailable) {
                await Sharing.shareAsync(uri, {
                    mimeType: 'image/png',
                    dialogTitle: `${data.filmTitle} — ReelHouse Log`,
                });
            } else {
                const yearText = (data.filmYear || data.year) ? ` (${data.filmYear || data.year})` : '';
                const ratingText = data.rating > 0 ? ` — ${data.rating}/5 reels` : '';
                await Share.share({
                    message: `${data.filmTitle}${yearText}${ratingText}\n\n${cleanReviewText(data.review || '')}\n\n— via The ReelHouse Society`.trim(),
                });
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            if (msg !== 'User did not share') reelToast.error(msg);
        } finally {
            setSharing(false);
            onClose?.();
        }
    }, [data, onClose]);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={s.overlay}>
                <Animated.View entering={FadeIn.duration(300)} style={s.modalContent}>
                    <View style={s.header}>
                        <Text style={s.title}>GENERATE CLASSIFIED DOSSIER</Text>
                        <PressableScale onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }} haptic="light" pressedScale={0.96}>
                            <Text style={s.closeText}>?</Text>
                        </PressableScale>
                    </View>

                    <View style={s.cardWrapper}>
                        <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }} style={s.cardContainer}>
                            <CardContent data={data} />
                        </ViewShot>
                    </View>

                    <PressableScale style={s.shareButton} onPress={handleShare} disabled={sharing} pressedScale={0.97}>
                        <Text style={s.shareButtonText}>
                            {sharing ? 'DEVELOPING...' : 'SAVE TO PHOTOS'}
                        </Text>
                    </PressableScale>
                </Animated.View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: {
        flex: 1, backgroundColor: 'rgba(4,3,2,0.97)',
        justifyContent: 'center', padding: 24,
    },
    modalContent: {
        width: '100%', maxWidth: 400, alignSelf: 'center',
    },
    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 24, paddingHorizontal: 4,
    },
    title: {
        fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2.5,
        color: colors.sepia, opacity: 0.9,
    },
    closeText: {
        fontFamily: fonts.ui, fontSize: 20, color: colors.fog,
        lineHeight: 24,
    },
    cardWrapper: {
        alignItems: 'center', marginBottom: 24,
    },
    cardContainer: {
        width: DOSSIER_CARD_WIDTH, height: DOSSIER_CARD_HEIGHT,
        backgroundColor: colors.ink, borderRadius: 4,
        overflow: 'hidden', flexDirection: 'column', padding: 14,
    },
    insetBorder: {
        ...StyleSheet.absoluteFillObject,
        margin: 14, borderWidth: 1, borderColor: colors.sepiaBorder,
    },
    tickH: { position: 'absolute', width: 12, height: 1.5, backgroundColor: colors.sepia },
    tickV: { position: 'absolute', width: 1.5, height: 12, backgroundColor: colors.sepia },
    topHud: { alignItems: 'center', marginTop: 4 },
    topHudText: {
        fontFamily: fonts.ui, fontSize: 8, letterSpacing: 3,
        color: colors.sepia, opacity: 0.8,
    },
    spacerLg: { flex: 0.8 },
    spacerMd: { flex: 1 },
    posterWrapper: { alignItems: 'center', width: '100%' },
    posterArt: {
        width: 220, height: 330, backgroundColor: colors.soot,
        ...effects.shadowPrimary, borderWidth: 1, borderColor: 'rgba(196,150,26,0.15)',
    },
    posterPlaceholder: { justifyContent: 'center', alignItems: 'center' },
    placeholderGlyph: { fontFamily: fonts.ui, fontSize: 24, color: colors.fog },
    placard: { alignItems: 'center', paddingHorizontal: 16 },
    filmTitle: {
        fontFamily: fonts.display, fontSize: 24, lineHeight: 28,
        color: colors.parchment, textAlign: 'center', marginBottom: 6,
        ...effects.textGlowSepia,
    },
    filmMeta: {
        fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2,
        color: colors.flicker, opacity: 0.85, marginBottom: 12,
    },
    ratingWrap: { marginBottom: 12 },
    reviewText: {
        fontFamily: fonts.bodyItalic, fontSize: 12, color: colors.bone,
        lineHeight: 18, textAlign: 'center', opacity: 0.95,
    },
    attribution: {
        fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1.5,
        color: colors.sepia, marginTop: 8, opacity: 0.9,
    },
    footerLockup: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 2,
    },
    footerLogo: { width: 12, height: 12, opacity: 0.8 },
    footerText: {
        fontFamily: fonts.ui, fontSize: 7, letterSpacing: 3, color: colors.sepiaBorderStrong,
    },
    shareButton: {
        backgroundColor: colors.sepia, paddingVertical: 14,
        borderRadius: 4, alignItems: 'center',
    },
    shareButtonText: {
        fontFamily: fonts.uiBold, fontSize: 12, letterSpacing: 2, color: colors.ink,
    },
});
