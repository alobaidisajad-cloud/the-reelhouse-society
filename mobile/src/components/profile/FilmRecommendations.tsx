/**
 * FilmRecommendations — "Films you might like" panel.
 * Uses TMDB similar movies endpoint.
 */
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, FlatList } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, fonts } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';

interface FilmRecommendationsProps {
    logs: any[];
}

export function FilmRecommendations({ logs }: FilmRecommendationsProps) {
    const router = useRouter();
    const [recs, setRecs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (logs.length < 3) return;
        let cancelled = false;
        setLoading(true);

        (async () => {
            // Pick 3 random recent logs
            const recent = logs.slice(0, 20);
            const sample = recent.sort(() => Math.random() - 0.5).slice(0, 3);
            const allSimilar: any[] = [];

            for (const log of sample) {
                const filmId = log.filmId || log.film_id;
                if (!filmId) continue;
                const detail = await tmdb.detail(Number(filmId));
                if (detail?.similar?.results) {
                    allSimilar.push(...detail.similar.results);
                }
            }

            if (cancelled) return;

            // Deduplicate and exclude already logged
            const loggedIds = new Set(logs.map((l: any) => String(l.filmId || l.film_id)));
            const seen = new Set<string>();
            const unique = allSimilar.filter(f => {
                const id = String(f.id);
                if (loggedIds.has(id) || seen.has(id)) return false;
                seen.add(id);
                return f.poster_path;
            }).sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0)).slice(0, 8);

            setRecs(unique);
            setLoading(false);
        })();

        return () => { cancelled = true; };
    }, [logs]);

    if (logs.length < 3 || recs.length === 0) return null;

    return (
        <Animated.View entering={FadeIn.duration(400)} style={s.container}>
            <Text style={s.title}>✦ FILMS YOU MIGHT LIKE</Text>
            <FlatList
                data={recs}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={item => String(item.id)}
                contentContainerStyle={{ gap: 10, paddingRight: 16 }}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        onPress={() => { Haptics.selectionAsync(); router.push(`/film/${item.id}`); }}
                        activeOpacity={0.7}
                        style={s.filmCard}
                    >
                        <Image source={{ uri: `https://image.tmdb.org/t/p/w185${item.poster_path}` }} style={s.poster} />
                        <Text style={s.filmTitle} numberOfLines={2}>{item.title}</Text>
                    </TouchableOpacity>
                )}
            />
        </Animated.View>
    );
}

const s = StyleSheet.create({
    container: { marginVertical: 16 },
    title: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.sepia, marginBottom: 12, paddingHorizontal: 16 },
    filmCard: { width: 100 },
    poster: { width: 100, height: 150, borderRadius: 4, resizeMode: 'cover', borderWidth: 1, borderColor: colors.ash, marginBottom: 6 },
    filmTitle: { fontFamily: fonts.sub, fontSize: 11, color: colors.bone, lineHeight: 14 },
});
