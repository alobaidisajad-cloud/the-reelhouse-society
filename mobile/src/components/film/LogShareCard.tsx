import { useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, Share } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn } from 'react-native-reanimated';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import TactileEngine from '@/src/utils/TactileEngine';
import { colors, fonts, effects } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { tmdb } from '@/src/lib/tmdb';
import reelToast from '@/src/utils/reelToast';
import { ReelRating } from '@/src/components/Decorative';
import { truncateReview as sharedTruncateReview } from '@/src/utils/text';

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

function cleanReviewText(text: string): string {
    if (!text) return '';
    return text.replace(/<(p|div|br)[^>]*>/gi, '\n').replace(/<(?:\/?(?:p|div|br|b|i|strong|em|span|a|ul|li))[^>]*>/gi, '').trim();
}

// Pre-clean review HTML to plain text, then apply the shared truncation.
function truncateReview(text: string, maxLength = 350) {
    return sharedTruncateReview(cleanReviewText(text), maxLength);
}

function CardContent({ data }: { data: ShareCardData }) {
    const posterUrl = data.posterPath ? tmdb.poster(data.posterPath, 'w500') : (data.posterUri || null);
    const reviewText = data.review ? truncateReview(data.review) : null;
    const yearDisplay = data.filmYear || data.year || '';

    return (
        <View style={s.cardContainer}>
            {/* Ambient Blur Layer */}
            {posterUrl && (
                <Image
                    source={{ uri: posterUrl }}
                    style={s.blurBackground}
                    contentFit="cover"
                    blurRadius={40}
                />
            )}

            {/* Vignette Overlay */}
            <View style={s.vignette} />

            {/* Obsidian Slab */}
            <View style={s.obsidianSlab}>
                {/* Header */}
                <View style={s.slabHeader}>
                    <Text style={s.slabHeaderText}>● ARCHIVE DOSSIER ●</Text>
                </View>

                {/* Poster Area */}
                <View style={s.slabPosterArea}>
                    <View style={s.slabPosterWrapper}>
                        {posterUrl ? (
                            <Image source={{ uri: posterUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                        ) : (
                            <View style={[StyleSheet.absoluteFillObject, s.posterPlaceholder]}>
                                <Text style={s.placeholderGlyph}>∅</Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* Film & Review Metadata */}
                <View style={s.slabInfoArea}>
                    <Text style={s.slabFilmTitle} numberOfLines={2} adjustsFontSizeToFit>{data.filmTitle}</Text>
                    <Text style={s.slabFilmMeta}>{yearDisplay}</Text>
                    
                    {data.rating > 0 && (
                        <View style={s.slabRatingWrap}>
                            <ReelRating rating={data.rating} size={13} />
                        </View>
                    )}

                    <View style={s.slabReviewBox}>
                        <Text style={s.slabReviewText} numberOfLines={3}>
                            "{reviewText || 'Classified Analysis'}"
                        </Text>
                    </View>
                </View>

                {/* Footer */}
                <View style={s.slabFooter}>
                    <View style={s.slabFooterLeft}>
                        <Image source={require('@/assets/images/reelhouse-logo-transparent.png')} style={s.slabFooterLogo} />
                        <Text style={s.slabFooterText}>REELHOUSE</Text>
                    </View>
                    {data.username && (
                        <Text style={s.slabFooterUsername}>@{data.username.toUpperCase()}</Text>
                    )}
                </View>
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
        TactileEngine.mutate();

        try {
            const uri = await cardRef.current?.capture?.();
            if (!uri) return;
            const isAvailable = await Sharing.isAvailableAsync();
            if (isAvailable) {
                await Sharing.shareAsync(uri, {
                    mimeType: 'image/png',
                    dialogTitle: `${data.filmTitle} • ReelHouse Log`,
                });
            } else {
                const yearText = (data.filmYear || data.year) ? ` (${data.filmYear || data.year})` : '';
                const ratingText = data.rating > 0 ? ` • ${data.rating}/5 reels` : '';
                await Share.share({
                    message: `${data.filmTitle}${yearText}${ratingText}\n\n${cleanReviewText(data.review || '')}\n\n• via The ReelHouse Society`.trim(),
                });
            }
            TactileEngine.success();
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
                            <Text style={s.closeText}>✕</Text>
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
        fontFamily: fonts.ui, fontSize: 18, color: colors.fog,
        lineHeight: 24,
    },
    cardWrapper: {
        alignItems: 'center', marginBottom: 24,
    },
    cardContainer: {
        width: DOSSIER_CARD_WIDTH, height: DOSSIER_CARD_HEIGHT,
        backgroundColor: '#040302',
        overflow: 'hidden', flexDirection: 'column',
    },
    blurBackground: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.45,
        transform: [{ scale: 1.15 }],
    },
    vignette: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(4,3,2,0.4)',
    },
    obsidianSlab: {
        marginHorizontal: 24,
        marginVertical: 45,
        flex: 1,
        backgroundColor: '#090705',
        borderWidth: 1,
        borderColor: 'rgba(196, 150, 26, 0.3)',
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.8,
        shadowRadius: 30,
        elevation: 10,
    },
    slabHeader: {
        paddingVertical: 12,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(196, 150, 26, 0.15)',
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
    },
    slabHeaderText: {
        fontFamily: fonts.ui, fontSize: 8, letterSpacing: 3,
        color: colors.sepia, opacity: 0.9,
    },
    slabPosterArea: {
        flex: 1,
        padding: 16,
        paddingBottom: 12,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 0,
    },
    slabPosterWrapper: {
        height: '100%',
        aspectRatio: 2/3,
        backgroundColor: colors.soot,
        ...effects.shadowPrimary,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.06)',
        borderRadius: 4,
        overflow: 'hidden',
    },
    posterPlaceholder: { justifyContent: 'center', alignItems: 'center' },
    placeholderGlyph: { fontFamily: fonts.ui, fontSize: 24, color: colors.fog },
    slabInfoArea: {
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    slabFilmTitle: {
        fontFamily: fonts.display, fontSize: 20, lineHeight: 24,
        color: colors.parchment, textAlign: 'center', marginBottom: 4,
    },
    slabFilmMeta: {
        fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2,
        color: colors.sepia, opacity: 0.85, marginBottom: 8,
    },
    slabRatingWrap: { marginBottom: 8 },
    slabReviewBox: {
        width: '100%',
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        borderRadius: 4,
        borderLeftWidth: 2,
        borderLeftColor: colors.sepia,
    },
    slabReviewText: {
        fontFamily: fonts.bodyItalic, fontSize: 11, color: colors.bone,
        lineHeight: 16, textAlign: 'left', opacity: 0.95,
    },
    slabFooter: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(196, 150, 26, 0.15)',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
    },
    slabFooterLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    slabFooterLogo: { width: 10, height: 10, opacity: 0.7 },
    slabFooterText: {
        fontFamily: fonts.ui, fontSize: 7, letterSpacing: 2, color: colors.sepia,
    },
    slabFooterUsername: {
        fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1.5, color: colors.flicker,
    },
    shareButton: {
        backgroundColor: colors.sepia, paddingVertical: 14,
        borderRadius: 4, alignItems: 'center',
    },
    shareButtonText: {
        fontFamily: fonts.uiBold, fontSize: 12, letterSpacing: 2, color: colors.ink,
    },
});
