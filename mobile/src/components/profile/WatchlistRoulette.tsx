/**
 * WatchlistRoulette — "The Oracle's Choice"
 * The Archive spins through your saved reels and strikes one for tonight.
 *
 * The pick is a true, uniform coin-flip — every reel equally likely, never
 * predictable. The *verdict line* is what's perceptive: it's derived from the
 * chosen film's era, so the Oracle always says something true about the pick
 * without ever knowing what it'll land on.
 *
 * Nitrate soul: the flicker and the reveal sit inside a film gate (sprocket
 * perforations), and the verdict settles in on the developing-plate curve —
 * timing only, never a spring (the house no-bounce law).
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withTiming, Easing, interpolate } from 'react-native-reanimated';
import TactileEngine from '@/src/utils/TactileEngine';
import { useRouter } from 'expo-router';
import { colors, fonts } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import PressableScale from '../PressableScale';
import { decorativeTextProps, scaledTextProps } from '@/src/constants/textScaling';

interface RouletteFilm {
    id?: number;
    filmId?: number;
    title?: string;
    name?: string;
    poster_path?: string | null;
    poster?: string | null;
    year?: number | null;
}

// The house curve — weighted card stock settling, no overshoot.
const CURVE = Easing.bezier(0.33, 0, 0.15, 1);

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// Always-true lines for when a film carries no year — they never claim a
// specific the Oracle can't back up.
const FATE_LINES = [
    'The archive has chosen.',
    'It is time to face the unknown.',
    'Destined for tonight’s atmosphere.',
    'A cinematic blind spot, repaired.',
];

const decadeLabel = (y: number) => `’${String(Math.floor(y / 10) * 10).slice(2)}s`;

/**
 * The verdict — honest to the film fate landed on. Never predictable, because
 * the film itself is drawn at random; only the wording follows from its era.
 */
function oracleVerdict(film: RouletteFilm): string {
    const y = typeof film.year === 'number' && film.year > 1870 ? film.year : null;
    if (y == null) return pick(FATE_LINES);

    const now = new Date().getFullYear();
    if (y >= now - 1) return pick([
        'Fresh from the projector.',
        'Barely dry from the developing bath.',
    ]);
    if (y <= 1929) return pick([
        'From the silent age — the Society’s own era.',
        'A relic of nitrate and shadow.',
    ]);
    if (y <= 1959) return pick([
        'A classic, pulled from the golden vault.',
        `A ${decadeLabel(y)} reel, luminous still.`,
    ]);
    if (y <= 1989) return pick([
        `A ghost from the ${decadeLabel(y)}, surfacing tonight.`,
        `The ${decadeLabel(y)} calls you back.`,
    ]);
    return pick([
        `A ${decadeLabel(y)} obsession, unearthed.`,
        `The ${decadeLabel(y)} demands your eyes.`,
    ]);
}

// A single sprocket strip — the edge of a frame in the gate.
function Perforations({ count = 9 }: { count?: number }) {
    return (
        <View style={s.perfStrip}>
            {Array.from({ length: count }).map((_, i) => (
                <View key={i} style={s.perfHole} />
            ))}
        </View>
    );
}

export function WatchlistRoulette({ visible, watchlist, onClose, onSelect }: {
    visible?: boolean;
    watchlist?: RouletteFilm[];
    onClose?: () => void;
    onSelect?: (id: number) => void;
}) {
    const router = useRouter();
    const [picking, setPicking] = useState(false);
    const [result, setResult] = useState<RouletteFilm | null>(null);
    const [reason, setReason] = useState('');
    const [flickerItem, setFlickerItem] = useState<RouletteFilm | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isMounted = useRef(true);

    // The developing-plate reveal — opacity + a faint settle, timing only.
    const reveal = useSharedValue(0);
    const plateStyle = useAnimatedStyle(() => ({
        opacity: reveal.value,
        transform: [{ scale: interpolate(reveal.value, [0, 1], [1.04, 1]) }],
    }));
    useEffect(() => {
        if (result) {
            reveal.value = 0;
            reveal.value = withTiming(1, { duration: 520, easing: CURVE });
        }
    }, [result, reveal]);

    // Clean up on unmount
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []);

    const spin = useCallback(() => {
        if (!watchlist || watchlist.length === 0) return;
        setPicking(true);
        setResult(null);
        TactileEngine.navigate();

        // If exactly 1 film, resolve instantly without the spin loop
        if (watchlist.length === 1) {
            setResult(watchlist[0]);
            setReason(oracleVerdict(watchlist[0]));
            setPicking(false);
            TactileEngine.success();
            return;
        }

        const target = watchlist[Math.floor(Math.random() * watchlist.length)];

        let ticks = 0;
        if (intervalRef.current) clearInterval(intervalRef.current);

        intervalRef.current = setInterval(() => {
            // Prevent unmounted component state updates if aggressively dismissed
            if (!isMounted.current) {
                if (intervalRef.current) clearInterval(intervalRef.current);
                return;
            }

            ticks++;
            setFlickerItem(watchlist[Math.floor(Math.random() * watchlist.length)]);

            // Haptic tick every few frames
            if (ticks % 3 === 0) {
                TactileEngine.navigate();
            }

            if (ticks > 30) {
                if (intervalRef.current) clearInterval(intervalRef.current);
                setResult(target);
                setReason(oracleVerdict(target));
                setPicking(false);
                // Heavy clunk on lock-in
                TactileEngine.success();
            }
        }, 50); // 20fps projector simulation
    }, [watchlist]);

    const handleSelect = useCallback(() => {
        TactileEngine.selection();
        if (!result) return;
        const filmId = result.id ?? result.filmId;
        onClose?.();
        setResult(null);
        if (onSelect) {
            onSelect(filmId as number);
        } else {
            (router.push as any)(`/film/${filmId}` as never);
        }
    }, [result, onSelect, onClose, router]);

    // Don't render if not visible or empty
    if (!visible || !watchlist || watchlist.length === 0) return null;

    const posterUri = (item: RouletteFilm | null) => {
        const path = item?.poster_path ?? item?.poster;
        return path ? tmdb.poster(path, 'w342') : null;
    };

    return (
        <Modal statusBarTranslucent visible transparent animationType="fade" onRequestClose={() => { TactileEngine.selection(); onClose?.(); }}>
            <Pressable style={s.overlay} onPress={() => { TactileEngine.selection(); onClose?.(); }} accessibilityRole="button" accessibilityLabel="Close the oracle">
                <Pressable style={s.card} onPress={() => {}} accessible={false}>

                    {/* IDLE — Summon */}
                    {!picking && !result && (
                        <Animated.View entering={FadeIn.duration(400)} style={s.centerContent}>
                            <Text {...decorativeTextProps} style={s.reelGlyph}>{'◉ ◉ ◉'}</Text>
                            {/* eslint-disable-next-line react/no-unescaped-entities */}
                            <Text {...scaledTextProps} style={s.title}>The Oracle's Choice</Text>
                            {/* eslint-disable-next-line react/no-unescaped-entities */}
                            <Text {...scaledTextProps} style={s.subtitle}>Can't decide? Let the Archive choose tonight's obsession.</Text>
                            <PressableScale style={s.spinBtn} onPress={spin} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} haptic="medium" accessibilityRole="button" accessibilityLabel="Consult the oracle — pick a film from your watchlist">
                                <Text {...scaledTextProps} style={s.spinBtnText}>{'✦ CONSULT THE ORACLE'}</Text>
                            </PressableScale>
                        </Animated.View>
                    )}

                    {/* PICKING — the film gate */}
                    {picking && (
                        <View style={s.centerContent}>
                            <Text {...scaledTextProps} style={s.scanningText}>SCANNING THE ARCHIVES</Text>
                            <View style={s.gate}>
                                <Perforations />
                                <View style={s.gateWindow}>
                                    {flickerItem && posterUri(flickerItem) ? (
                                        <Image
                                            source={{ uri: posterUri(flickerItem)! }}
                                            style={s.poster}
                                            blurRadius={3}
                                        />
                                    ) : (
                                        <View style={s.posterBlank} />
                                    )}
                                </View>
                                <Perforations />
                            </View>
                            <Text {...scaledTextProps} style={s.gateFooter}>the reel spins…</Text>
                        </View>
                    )}

                    {/* RESULT — the verdict */}
                    {!picking && result && (
                        <Animated.View entering={FadeIn.duration(400)} style={s.centerContent}>
                            <Text {...scaledTextProps} style={s.oracleSpoken}>THE ORACLE HAS SPOKEN</Text>
                            <View style={s.gate}>
                                <Perforations />
                                <Animated.View style={[s.gateWindow, s.resultPosterWrap, plateStyle]}>
                                    {posterUri(result) ? (
                                        <Image source={{ uri: posterUri(result)! }} style={s.poster} cachePolicy="memory-disk" transition={150} />
                                    ) : (
                                        <View style={[s.posterBlank, s.posterBlankResult]}>
                                            <Text {...scaledTextProps} style={s.posterBlankTitle} numberOfLines={3}>{result.title ?? result.name}</Text>
                                        </View>
                                    )}
                                </Animated.View>
                                <Perforations />
                            </View>
                            <Text {...scaledTextProps} style={s.resultTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{result.title ?? result.name}</Text>
                            {/* eslint-disable-next-line react/no-unescaped-entities */}
                            <Text {...scaledTextProps} style={s.resultReason}>"{reason}"</Text>
                            <View style={s.verdictActions}>
                                <PressableScale style={s.seeFilmBtn} onPress={handleSelect} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} haptic="medium" accessibilityRole="button" accessibilityLabel={`See ${result.title ?? result.name}`}>
                                    <Text {...scaledTextProps} style={s.seeFilmText}>{'SEE THE FILM →'}</Text>
                                </PressableScale>
                                <PressableScale style={s.rerollBtn} onPress={spin} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} haptic accessibilityRole="button" accessibilityLabel="Re-roll the Oracle">
                                    <Text {...scaledTextProps} style={s.rerollText}>{'↻ RE-ROLL'}</Text>
                                </PressableScale>
                            </View>
                        </Animated.View>
                    )}

                    {/* Close button */}
                    <PressableScale style={s.closeBtn} onPress={() => { onClose?.(); }} hitSlop={{top:15,bottom:15,left:15,right:15}} haptic accessibilityRole="button" accessibilityLabel="Close the oracle">
                        <Text {...scaledTextProps} style={s.closeBtnText}>{'✕'}</Text>
                    </PressableScale>
                </Pressable>
            </Pressable>
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
        backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)',
        borderTopWidth: 2, borderTopColor: colors.sepia, borderRadius: 8,
        position: 'relative', overflow: 'hidden',
    },
    centerContent: { alignItems: 'center', zIndex: 1 },
    reelGlyph: { fontFamily: fonts.display, fontSize: 22, color: colors.sepiaSubtle, marginBottom: 12, letterSpacing: 4 },
    title: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment, marginBottom: 8, textAlign: 'center' },
    subtitle: { fontFamily: fonts.sub, fontSize: 13, color: colors.fog, fontStyle: 'italic', marginBottom: 24, textAlign: 'center' },
    spinBtn: {
        paddingVertical: 12, paddingHorizontal: 32,
        backgroundColor: colors.sepia, borderRadius: 4,
    },
    spinBtnText: { fontFamily: fonts.sub, fontSize: 12, letterSpacing: 2, color: colors.ink },

    // ── The film gate (sprocket-framed window) ──
    gate: { flexDirection: 'row', alignItems: 'stretch', gap: 6 },
    perfStrip: {
        width: 12, justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 6,
    },
    perfHole: {
        width: 6, height: 8, borderRadius: 1.5,
        backgroundColor: 'rgba(0,0,0,0.55)',
        borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(184,137,26,0.18)',
    },
    gateWindow: { width: 140, height: 210, borderRadius: 3, overflow: 'hidden' },
    poster: { width: '100%', height: '100%' },
    posterBlank: { width: '100%', height: '100%', backgroundColor: colors.soot, opacity: 0.5 },
    posterBlankResult: { opacity: 1, alignItems: 'center', justifyContent: 'center', padding: 12, borderWidth: 1, borderColor: colors.sepiaBorder },
    posterBlankTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.parchment, textAlign: 'center' },

    // Picking
    scanningText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.sepia, opacity: 0.7, marginBottom: 16 },
    gateFooter: { fontFamily: fonts.body, fontSize: 10, letterSpacing: 1, color: colors.fog, marginTop: 14, opacity: 0.7 },

    // Result
    oracleSpoken: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.sepia, marginBottom: 16 },
    resultPosterWrap: {
        shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.6, shadowRadius: 20,
        elevation: 12,
    },
    resultTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, marginTop: 16, textAlign: 'center' },
    resultReason: { fontFamily: fonts.sub, fontSize: 13, color: colors.fog, fontStyle: 'italic', marginTop: 8, textAlign: 'center' },
    verdictActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 },
    seeFilmBtn: {
        paddingVertical: 9, paddingHorizontal: 18,
        borderWidth: 1, borderColor: colors.sepia, backgroundColor: colors.sepiaFaint, borderRadius: 3,
    },
    seeFilmText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.5, color: colors.sepia },
    rerollBtn: { paddingVertical: 9, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.ash, borderRadius: 3 },
    rerollText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.5, color: colors.fog },

    // Close
    closeBtn: { position: 'absolute', top: 12, right: 12, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    closeBtnText: { fontFamily: fonts.sub, fontSize: 18, color: colors.fog },
});
