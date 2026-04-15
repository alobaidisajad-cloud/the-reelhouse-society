/**
 * MarqueeBoard — Animated trending films marquee for home tab.
 */
import React, { useEffect, useRef, useCallback, memo } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, fonts } from '@/src/theme/theme';

const { width: SCREEN_W } = Dimensions.get('window');

interface MarqueeFilm {
    id: number;
    title?: string;
    poster_path?: string | null;
    release_date?: string;
    [key: string]: unknown;
}

interface MarqueeProps {
    films: MarqueeFilm[];
}

export const MarqueeBoard = memo(function MarqueeBoard({ films }: MarqueeProps) {
    const scrollX = useRef(new Animated.Value(0)).current;
    const router = useRouter();

    const handleFilmPress = useCallback((filmId: number) => {
        Haptics.selectionAsync();
        router.push(`/film/${filmId}`);
    }, [router]);

    const items = films.slice(0, 10);
    if (items.length === 0) return null;

    const ITEM_W = 200;
    const TOTAL_W = items.length * ITEM_W;

    useEffect(() => {
        const animation = Animated.loop(
            Animated.timing(scrollX, {
                toValue: -TOTAL_W,
                duration: items.length * 4000,
                useNativeDriver: true,
            })
        );
        animation.start();
        return () => animation.stop();
    }, [items.length]);

    return (
        <View style={s.container}>
            <Text style={s.eyebrow}>NOW SHOWING</Text>
            <View style={s.marqueeWrap}>
                <Animated.View style={[s.marqueeTrack, { transform: [{ translateX: scrollX }] }]}>
                    {/* Double items for seamless loop */}
                    {[...items, ...items].map((film, i) => (
                        <TouchableOpacity
                            key={`${film.id}-${i}`}
                            style={s.filmItem}
                            onPress={() => handleFilmPress(film.id)}
                            activeOpacity={0.8}
                        >
                            {film.poster_path && (
                                <Image
                                    source={{ uri: `https://image.tmdb.org/t/p/w154${film.poster_path}` }}
                                    style={s.poster}
                                    contentFit="cover"
                                />
                            )}
                            <View style={s.filmInfo}>
                                <Text style={s.filmTitle} numberOfLines={1}>{film.title}</Text>
                                <Text style={s.filmYear}>{film.release_date?.slice(0, 4)}</Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </Animated.View>
            </View>
            <View style={s.fadeMask} pointerEvents="none" />
        </View>
    );
});

const s = StyleSheet.create({
    container: {
        paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.ash,
        overflow: 'hidden',
    },
    eyebrow: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 3, color: colors.sepia, paddingHorizontal: 16, marginBottom: 12 },
    marqueeWrap: { overflow: 'hidden', height: 80 },
    marqueeTrack: { flexDirection: 'row' },
    filmItem: { width: 200, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8 },
    poster: { width: 44, height: 66, borderRadius: 3, borderWidth: 1, borderColor: colors.ash },
    filmInfo: { flex: 1 },
    filmTitle: { fontFamily: fonts.sub, fontSize: 12, color: colors.bone, marginBottom: 2 },
    filmYear: { fontFamily: fonts.ui, fontSize: 9, color: colors.fog, letterSpacing: 1 },
    fadeMask: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 40, backgroundColor: colors.ink, opacity: 0.8 },
});
