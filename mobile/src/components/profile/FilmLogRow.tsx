import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import { ReelRating } from '@/src/components/Decorative';
import { tmdb } from '@/src/lib/tmdb';

interface FilmLogRowData {
    id: string;
    film_title: string;
    poster_path?: string | null;
    year?: number | null;
    rating: number;
    review?: string | null;
}

interface FilmLogRowProps {
    log: FilmLogRowData;
    onPress?: () => void;
    isOwnProfile?: boolean;
}

export const FilmLogRow = memo(function FilmLogRow({ log, onPress, isOwnProfile }: FilmLogRowProps) {
    const posterUri = log.poster_path ? tmdb.poster(log.poster_path, 'w92') : null;
    return (
        <PressableScale style={s.container} onPress={() => { onPress?.(); }} pressedScale={0.98} haptic="selection">
            {posterUri ? (
                <Image source={{ uri: posterUri }} style={s.poster} contentFit="cover" cachePolicy="memory-disk" recyclingKey={`log-${log.id}`} />
            ) : (
                <View style={[s.poster, s.posterPlaceholder]} />
            )}
            <View style={s.info}>
                <Text style={s.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{log.film_title}</Text>
                <View style={s.meta}>
                    <Text style={s.year}>{log.year}</Text>
                    {log.rating > 0 && <ReelRating rating={log.rating} size={10} />}
                </View>
                {/* eslint-disable-next-line react/no-unescaped-entities */}
                {log.review && <Text style={s.review} numberOfLines={2}>"{log.review}"</Text>}
            </View>
        </PressableScale>
    );
});

const s = StyleSheet.create({
    container: { flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.ash },
    poster: { width: 44, height: 66, borderRadius: 4, marginRight: 16 },
    info: { flex: 1, justifyContent: 'center' },
    title: { fontFamily: fonts.display, fontSize: 16, color: colors.parchment },
    meta: { flexDirection: 'row', gap: 12, marginTop: 4, marginBottom: 8, alignItems: 'center' },
    year: { fontFamily: fonts.ui, fontSize: 10, color: colors.sepia, letterSpacing: 2 },
    review: { fontFamily: fonts.body, fontSize: 12, color: colors.bone, fontStyle: 'italic' },
    posterPlaceholder: { backgroundColor: colors.ash },
});
