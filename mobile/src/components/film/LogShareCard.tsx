/**
 * LogShareCard — Native share card for film logs.
 * Uses react-native-view-shot + expo-sharing for native share sheet.
 * Supports both standalone Modal usage and embedded (off-screen capture) usage.
 */
import { useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Image, Share, Alert } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { colors, fonts } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';

// Flexible interface — accepts both new and legacy shapes
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
    role?: string;
}

interface Props {
    visible?: boolean;
    data: ShareCardData;
    onClose?: () => void;
}

function ReelRating({ rating }: { rating: number }) {
    return (
        <View style={rs.container}>
            {[1, 2, 3, 4, 5].map(i => (
                <Text key={i} style={[rs.reel, i <= rating ? rs.reelFilled : rs.reelEmpty]}>◉</Text>
            ))}
        </View>
    );
}

const rs = StyleSheet.create({
    container: { flexDirection: 'row', gap: 3 },
    reel: { fontSize: 18 },
    reelFilled: { color: colors.sepia },
    reelEmpty: { color: colors.ash },
});

export default function LogShareCard({ visible, data, onClose }: Props) {
    const posterUrl = data.posterUri || (data.posterPath ? tmdb.poster(data.posterPath, 'w500') : null);
    const yearDisplay = data.filmYear || data.year || '';
    const statusLabel = data.status === 'rewatched' ? 'REWATCHED' : data.status === 'abandoned' ? 'ABANDONED' : 'WATCHED';

    // Embedded mode (no modal, just render the card for off-screen capture)
    if (visible === undefined) {
        return (
            <View style={s.card}>
                {posterUrl && <Image source={{ uri: posterUrl }} style={s.poster} />}
                <View style={s.cardOverlay}>
                    <View style={s.cardContent}>
                        <Text style={s.statusBadge}>{statusLabel}</Text>
                        <Text style={s.filmTitle}>{data.filmTitle}</Text>
                        {yearDisplay ? <Text style={s.filmYear}>{yearDisplay}</Text> : null}
                        <ReelRating rating={data.rating} />
                        {data.review && <Text style={s.review} numberOfLines={4}>"{data.review}"</Text>}
                        <View style={s.cardFooter}>
                            <Text style={s.username}>— @{data.username}</Text>
                            <Text style={s.branding}>THE REELHOUSE SOCIETY</Text>
                        </View>
                    </View>
                </View>
            </View>
        );
    }

    // Modal mode
    const cardRef = useRef<ViewShot>(null);
    const [sharing, setSharing] = useState(false);

    const handleShare = useCallback(async () => {
        if (!cardRef.current?.capture) return;
        setSharing(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        try {
            const uri = await cardRef.current.capture();
            const isAvailable = await Sharing.isAvailableAsync();
            if (isAvailable) {
                await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `${data.filmTitle} — ReelHouse Log` });
            } else {
                await Share.share({ message: `${data.filmTitle} (${yearDisplay}) — ${data.rating}/5 reels\n\n${data.review || ''}\n\n— via The ReelHouse Society` });
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e: any) {
            if (e.message !== 'User did not share') Alert.alert('Share Failed', e.message);
        } finally {
            setSharing(false);
        }
    }, [data]);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={s.overlay}>
                <Animated.View entering={FadeIn.duration(300)} style={s.content}>
                    <TouchableOpacity style={s.closeBtn} onPress={onClose}>
                        <Text style={s.closeBtnText}>✕</Text>
                    </TouchableOpacity>

                    <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }}>
                        <View style={s.card}>
                            {posterUrl && <Image source={{ uri: posterUrl }} style={s.poster} />}
                            <View style={s.cardOverlay}>
                                <View style={s.cardContent}>
                                    <Text style={s.statusBadge}>{statusLabel}</Text>
                                    <Text style={s.filmTitle}>{data.filmTitle}</Text>
                                    {yearDisplay ? <Text style={s.filmYear}>{yearDisplay}</Text> : null}
                                    <ReelRating rating={data.rating} />
                                    {data.review && <Text style={s.review} numberOfLines={4}>"{data.review}"</Text>}
                                    <View style={s.cardFooter}>
                                        <Text style={s.username}>— @{data.username}</Text>
                                        <Text style={s.branding}>THE REELHOUSE SOCIETY</Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                    </ViewShot>

                    <TouchableOpacity style={s.shareBtn} onPress={handleShare} disabled={sharing} activeOpacity={0.7}>
                        <Text style={s.shareBtnText}>{sharing ? 'PREPARING...' : '✦ SHARE CARD'}</Text>
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    content: { width: '100%', maxWidth: 360, alignItems: 'center' },
    closeBtn: { position: 'absolute', top: -40, right: 0, zIndex: 10, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    closeBtnText: { fontSize: 20, color: colors.fog },
    card: { width: '100%', borderRadius: 8, overflow: 'hidden', backgroundColor: '#0F0D0A', borderWidth: 1, borderColor: colors.sepia },
    poster: { width: '100%', height: 280, resizeMode: 'cover', opacity: 0.4 },
    cardOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
    cardContent: { padding: 24 },
    statusBadge: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 3, color: colors.ink, backgroundColor: colors.sepia, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2, marginBottom: 8 },
    filmTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.parchment, marginBottom: 4 },
    filmYear: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 2, color: colors.fog, marginBottom: 12 },
    review: { fontFamily: fonts.body, fontSize: 12, color: colors.fog, fontStyle: 'italic', lineHeight: 18, marginTop: 12 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(139,105,20,0.3)' },
    username: { fontFamily: fonts.sub, fontSize: 12, color: colors.bone },
    branding: { fontFamily: fonts.ui, fontSize: 6, letterSpacing: 3, color: colors.sepia, opacity: 0.6 },
    shareBtn: { backgroundColor: colors.sepia, paddingVertical: 14, paddingHorizontal: 40, borderRadius: 4, marginTop: 20 },
    shareBtnText: { fontFamily: fonts.uiBold, fontSize: 12, letterSpacing: 2, color: colors.ink },
});
