/**
 * LogShareCard — the log page's doorway to THE NITRATE FILE.
 * The card template itself lives in NitrateFileCard (shared with the
 * film page) so a member's file looks identical from every room.
 *
 * Two render modes, preserved from the original contract:
 *   · visible === undefined → bare CardContent (captured by the log
 *     page's own hidden ViewShot)
 *   · visible boolean → self-contained share modal
 */
import { useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, Share, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import TactileEngine from '@/src/utils/TactileEngine';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { tmdb } from '@/src/lib/tmdb';
import reelToast from '@/src/utils/reelToast';
import { stripHtml } from '@/src/utils/html';
import {
  NitrateFileCard,
  NITRATE_CARD_WIDTH,
  NITRATE_CARD_HEIGHT,
  NITRATE_EXPORT_WIDTH,
  NITRATE_EXPORT_HEIGHT,
} from '@/src/components/film/NitrateFileCard';

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
    memberNo?: number | null;
}

interface Props {
    visible?: boolean;
    data: ShareCardData;
    onClose?: () => void;
}

function CardContent({ data }: { data: ShareCardData }) {
    const posterUrl = data.posterPath ? tmdb.poster(data.posterPath, 'w500') : (data.posterUri || null);
    return (
        <NitrateFileCard
            data={{
                title: data.filmTitle,
                year: data.filmYear || data.year || '',
                posterUrl,
                rating: data.rating,
                review: data.review,
                pullQuote: data.pullQuote,
                status: data.status ?? null,
                username: data.username,
                memberNo: data.memberNo,
            }}
        />
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
    const { width: winW, height: winH } = useWindowDimensions();
    const previewScale = Math.min(1, (winW - 72) / NITRATE_CARD_WIDTH, (winH - 240) / NITRATE_CARD_HEIGHT);

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
                    dialogTitle: `${data.filmTitle} • The Nitrate File`,
                });
            } else {
                const yearText = (data.filmYear || data.year) ? ` (${data.filmYear || data.year})` : '';
                const ratingText = data.rating > 0 ? ` • ${data.rating}/5 reels` : '';
                await Share.share({
                    message: `${data.filmTitle}${yearText}${ratingText}\n\n${stripHtml(data.review || '')}\n\n• via The ReelHouse Society`.trim(),
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
        <Modal statusBarTranslucent visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={s.overlay}>
                <Animated.View entering={FadeIn.duration(300)} style={s.modalContent}>
                    <View style={s.header}>
                        <Text style={s.title}>✦ THE NITRATE FILE</Text>
                        <PressableScale onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }} haptic="light" pressedScale={0.96}>
                            <Text style={s.closeText}>✕</Text>
                        </PressableScale>
                    </View>

                    <View style={[s.cardWrapper, { width: NITRATE_CARD_WIDTH * previewScale, height: NITRATE_CARD_HEIGHT * previewScale }]}>
                        <View style={{ transform: [{ scale: previewScale }] }}>
                            <ViewShot
                                ref={cardRef}
                                options={{ format: 'png', quality: 1, width: NITRATE_EXPORT_WIDTH, height: NITRATE_EXPORT_HEIGHT }}
                                style={s.cardContainer}
                            >
                                <CardContent data={data} />
                            </ViewShot>
                        </View>
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
        fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.5,
        color: colors.sepia, opacity: 0.9,
    },
    closeText: {
        fontFamily: fonts.body, fontSize: 18, color: colors.fog,
        lineHeight: 24,
    },
    cardWrapper: {
        alignSelf: 'center', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
    },
    cardContainer: {
        width: NITRATE_CARD_WIDTH, height: NITRATE_CARD_HEIGHT,
        backgroundColor: '#040302',
        overflow: 'hidden',
    },
    shareButton: {
        backgroundColor: colors.sepia, paddingVertical: 14,
        borderRadius: 4, alignItems: 'center',
    },
    shareButtonText: {
        fontFamily: fonts.sub, fontSize: 12, letterSpacing: 2, color: colors.ink,
    },
});
