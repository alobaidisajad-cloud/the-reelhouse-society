import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { colors, fonts } from '@/src/theme/theme';
import { ReelRating } from '@/src/components/Decorative';
import { tmdb } from '@/src/lib/tmdb';

export function FilmLogRow({ log, onPress, isOwnProfile }: { log: any; onPress?: () => void; isOwnProfile?: boolean }) {
    const posterUri = log.poster_path ? tmdb.poster(log.poster_path, 'w92') : null;
    return (
        <TouchableOpacity style={s.container} onPress={onPress} activeOpacity={0.7}>
            {posterUri ? (
                <Image source={{ uri: posterUri }} style={s.poster} />
            ) : (
                <View style={[s.poster, { backgroundColor: colors.ash }]} />
            )}
            <View style={s.info}>
                <Text style={s.title}>{log.film_title}</Text>
                <View style={s.meta}>
                    <Text style={s.year}>{log.year}</Text>
                    {log.rating > 0 && <ReelRating rating={log.rating} size={10} />}
                </View>
                {log.review && <Text style={s.review} numberOfLines={2}>"{log.review}"</Text>}
            </View>
        </TouchableOpacity>
    );
}

const s = StyleSheet.create({
    container: { flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.ash },
    poster: { width: 44, height: 66, borderRadius: 4, marginRight: 16 },
    info: { flex: 1, justifyContent: 'center' },
    title: { fontFamily: fonts.display, fontSize: 16, color: colors.parchment },
    meta: { flexDirection: 'row', gap: 12, marginTop: 4, marginBottom: 8, alignItems: 'center' },
    year: { fontFamily: fonts.ui, fontSize: 10, color: colors.sepia, letterSpacing: 2 },
    review: { fontFamily: fonts.body, fontSize: 12, color: colors.bone, fontStyle: 'italic' },
});
