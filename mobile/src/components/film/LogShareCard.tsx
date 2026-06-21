import { useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, Share } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
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

function cleanReviewText(text: string): string {
    if (!text) return '';
    return text.replace(/<(p|div|br)[^>]*>/gi, '\n').replace(/<(?:\/?(?:p|div|br|b|i|strong|em|span|a|ul|li))[^>]*>/gi, '').trim();
}

function truncateReview(text: string, maxLength = 350) {
    const raw = cleanReviewText(text);
    if (raw.length <= maxLength) return raw;
    const cut = raw.lastIndexOf(' ', maxLength);
    return raw.substring(0, cut > 40 ? cut : maxLength).trimEnd() + '…';
}

function CardContent({ data }: { data: ShareCardData }) {
    const posterUrl = data.posterPath ? tmdb.poster(data.posterPath, 'w500') : (data.posterUri || null);
    const reviewText = data.review ? truncateReview(data.review) : null;
    const yearDisplay = data.filmYear || data.year || '';

    return (
        <View style={{
            position: 'relative', width: 360, height: 640,
            backgroundColor: colors.ink, overflow: 'hidden'
        }}>
            {/* Poster top half full bleed */}
            <View style={{ position: 'absolute', top: 0, left: 0, width: 360, height: 360, zIndex: 1, backgroundColor: colors.soot }}>
                {posterUrl ? (
                    <Image source={{ uri: posterUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                ) : null}
            </View>

            {/* Abyss Fade Mask */}
            <LinearGradient
                colors={['rgba(11, 10, 8, 0)', 'rgba(11, 10, 8, 1)']}
                style={{ position: 'absolute', top: 120, left: 0, width: 360, height: 240, zIndex: 2 }}
            />

            {/* Typography Container */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5 }}>
                {/* Film Title */}
                <Text style={{
                    position: 'absolute', top: 270, left: 20, width: 320,
                    textAlign: 'center', fontFamily: fonts.display, color: colors.flicker,
                    fontSize: 28, lineHeight: 32, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 12
                }} numberOfLines={2}>
                    {data.filmTitle}
                </Text>

                {/* Metadata */}
                <View style={{
                    position: 'absolute', top: 335, left: 20, width: 320,
                    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8
                }}>
                    {yearDisplay ? <Text style={{ fontFamily: fonts.ui, color: colors.sepia, fontSize: 11, letterSpacing: 1.5, fontWeight: '600' }}>{yearDisplay}</Text> : null}
                    {yearDisplay ? <Text style={{ fontFamily: fonts.ui, color: colors.sepia, fontSize: 11, opacity: 0.5 }}>•</Text> : null}
                    {data.rating > 0 ? <ReelRating rating={data.rating} size={11} /> : null}
                </View>

                {/* Review Text */}
                <View style={{
                    position: 'absolute', top: 380, left: 24, width: 312, height: 170,
                    overflow: 'hidden', alignItems: 'center'
                }}>
                    {reviewText ? (
                        <Text style={{
                            fontFamily: 'Courier', fontSize: 13, lineHeight: 20,
                            color: colors.bone, textAlign: 'center', fontStyle: 'italic'
                        }}>
                            "{reviewText}"
                        </Text>
                    ) : (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <Text style={{ fontFamily: 'Courier', fontSize: 12, color: 'rgba(200, 185, 154, 0.4)', letterSpacing: 1 }}>
                                LOGGED // {data.status?.toUpperCase() || 'WATCHED'}
                            </Text>
                        </View>
                    )}
                    
                    {/* Fade to black at bottom of review */}
                    {reviewText ? (
                        <LinearGradient
                            colors={['rgba(11, 10, 8, 0)', 'rgba(11, 10, 8, 1)']}
                            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40 }}
                        />
                    ) : null}
                </View>

                {/* Footer */}
                <View style={{
                    position: 'absolute', top: 580, left: 24, width: 312,
                    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                    paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(196, 150, 26, 0.2)'
                }}>
                    <Text style={{ fontFamily: fonts.ui, fontSize: 10, color: colors.sepia, letterSpacing: 1, opacity: 0.8 }}>REELHOUSE</Text>
                    <Text style={{ fontFamily: fonts.ui, fontSize: 10, color: colors.parchment, letterSpacing: 1, opacity: 0.8 }}>@{data.username}</Text>
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
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

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
    slabFooterLogo: { width: 14, height: 14, opacity: 0.7 },
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
