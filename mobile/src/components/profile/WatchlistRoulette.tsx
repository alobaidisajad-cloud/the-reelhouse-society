/**
 * WatchlistRoulette — "The Oracle's Choice"
 * Full spin animation with poster flicker, random film picker, and reveal.
 * Matches web's 116-line component exactly.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { colors, fonts } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';

const ORACLE_REASONS = [
    "The Oracle demands this.",
    "It's time to face the unknown.",
    "A cinematic blind spot repaired.",
    "Destined for tonight's atmosphere.",
    "Because you've waited long enough.",
    "The archive has chosen.",
];

export function WatchlistRoulette({ visible, watchlist, onClose, onSelect }: {
    visible?: boolean;
    watchlist?: any[];
    onClose?: () => void;
    onSelect?: (id: any) => void;
}) {
    const router = useRouter();
    const [picking, setPicking] = useState(false);
    const [result, setResult] = useState<any | null>(null);
    const [reason, setReason] = useState('');
    const [flickerItem, setFlickerItem] = useState<any | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Clean up on unmount
    useEffect(() => {
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []);

    const spin = useCallback(() => {
        if (!watchlist || watchlist.length < 2) return;
        setPicking(true);
        setResult(null);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        const target = watchlist[Math.floor(Math.random() * watchlist.length)];

        let ticks = 0;
        if (intervalRef.current) clearInterval(intervalRef.current);

        intervalRef.current = setInterval(() => {
            ticks++;
            setFlickerItem(watchlist[Math.floor(Math.random() * watchlist.length)]);

            // Haptic tick every few frames
            if (ticks % 3 === 0) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }

            if (ticks > 30) {
                if (intervalRef.current) clearInterval(intervalRef.current);
                setResult(target);
                setReason(ORACLE_REASONS[Math.floor(Math.random() * ORACLE_REASONS.length)]);
                setPicking(false);
                // Heavy clunk on lock-in
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
        }, 50); // 20fps projector simulation
    }, [watchlist]);

    const handleSelect = useCallback(() => {
        if (!result) return;
        const filmId = result.id || result.filmId;
        onClose?.();
        setResult(null);
        if (onSelect) {
            onSelect(filmId);
        } else {
            router.push(`/film/${filmId}`);
        }
    }, [result, onSelect, onClose, router]);

    // Don't render if not visible or not enough films
    if (!visible || !watchlist || watchlist.length < 2) return null;

    const posterUri = (item: any) => {
        const path = item?.poster_path || item?.poster;
        return path ? tmdb.poster(path, 'w342') : null;
    };

    return (
        <Modal visible transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
                <TouchableOpacity activeOpacity={1} style={s.card}>
                    {/* Scanlines when picking */}
                    {picking && <View style={s.scanlines} pointerEvents="none" />}

                    {/* IDLE — Show prompt */}
                    {!picking && !result && (
                        <Animated.View entering={FadeIn.duration(400)} style={s.centerContent}>
                            <Text style={s.title}>The Oracle's Choice</Text>
                            <Text style={s.subtitle}>Can't decide? Let the Archive choose your next obsession.</Text>
                            <TouchableOpacity style={s.spinBtn} onPress={spin} activeOpacity={0.7}>
                                <Text style={s.spinBtnText}>✦ Consult the Oracle</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    )}

                    {/* PICKING — Flicker posters */}
                    {picking && (
                        <View style={s.centerContent}>
                            <Text style={s.scanningText}>SCANNING THE ARCHIVES...</Text>
                            {flickerItem && posterUri(flickerItem) && (
                                <View style={s.flickerWrap}>
                                    <Image
                                        source={{ uri: posterUri(flickerItem)! }}
                                        style={[s.poster, { opacity: 0.5 }]}
                                        blurRadius={3}
                                    />
                                </View>
                            )}
                        </View>
                    )}

                    {/* RESULT — Reveal */}
                    {!picking && result && (
                        <Animated.View entering={ZoomIn.duration(400)} style={s.centerContent}>
                            <Text style={s.oracleSpoken}>THE ORACLE HAS SPOKEN</Text>
                            <TouchableOpacity onPress={handleSelect} activeOpacity={0.8}>
                                {posterUri(result) && (
                                    <View style={s.resultPosterWrap}>
                                        <Image source={{ uri: posterUri(result)! }} style={s.poster} />
                                    </View>
                                )}
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleSelect}>
                                <Text style={s.resultTitle}>{result.title || result.name}</Text>
                            </TouchableOpacity>
                            <Text style={s.resultReason}>"{reason}"</Text>
                            <TouchableOpacity style={s.rerollBtn} onPress={spin} activeOpacity={0.7}>
                                <Text style={s.rerollText}>↻ RE-ROLL INCANTATION</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    )}

                    {/* Close button */}
                    <TouchableOpacity style={s.closeBtn} onPress={onClose} activeOpacity={0.7}>
                        <Text style={s.closeBtnText}>✕</Text>
                    </TouchableOpacity>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center', alignItems: 'center', padding: 24,
    },
    card: {
        width: '100%', maxWidth: 400, padding: 32,
        backgroundColor: colors.soot, borderWidth: 1, borderColor: colors.ash,
        borderTopWidth: 2, borderTopColor: colors.sepia, borderRadius: 8,
        position: 'relative', overflow: 'hidden',
    },
    scanlines: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.05)',
        zIndex: 0,
    },
    centerContent: { alignItems: 'center', zIndex: 1 },
    title: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment, marginBottom: 8, textAlign: 'center' },
    subtitle: { fontFamily: fonts.sub, fontSize: 13, color: colors.fog, fontStyle: 'italic', marginBottom: 24, textAlign: 'center' },
    spinBtn: {
        paddingVertical: 12, paddingHorizontal: 32,
        backgroundColor: colors.sepia, borderRadius: 4,
    },
    spinBtnText: { fontFamily: fonts.uiBold, fontSize: 12, letterSpacing: 1, color: colors.ink },
    // Picking state
    scanningText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.sepia, opacity: 0.5, marginBottom: 16 },
    flickerWrap: { width: 140, height: 210, borderRadius: 4, overflow: 'hidden' },
    poster: { width: '100%', height: '100%', resizeMode: 'cover' },
    // Result state
    oracleSpoken: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.sepia, marginBottom: 16 },
    resultPosterWrap: {
        width: 140, height: 210, borderRadius: 4, overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.6, shadowRadius: 20,
        elevation: 12,
    },
    resultTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, marginTop: 12, textAlign: 'center' },
    resultReason: { fontFamily: fonts.sub, fontSize: 13, color: colors.fog, fontStyle: 'italic', marginTop: 8, textAlign: 'center' },
    rerollBtn: { marginTop: 20, paddingVertical: 8, paddingHorizontal: 16 },
    rerollText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1, color: colors.fog },
    // Close
    closeBtn: { position: 'absolute', top: 12, right: 12, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    closeBtnText: { fontFamily: fonts.ui, fontSize: 18, color: colors.fog },
});
