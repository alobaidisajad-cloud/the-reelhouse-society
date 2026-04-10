/**
 * CinematicInsights — Real analytics computed from the user's logged films.
 * Fetches TMDB credits to determine top actors, directors, and genres.
 * Nitrate Noir themed — matches the web exactly.
 */
import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Image, ActivityIndicator } from 'react-native';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
import { colors, fonts } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';

const GENRE_MAP: Record<number, string> = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
    80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
    14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
    9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie',
    53: 'Thriller', 10752: 'War', 37: 'Western',
};

interface PersonCount {
    id: number;
    name: string;
    profile_path: string | null;
    count: number;
}

interface GenreCount {
    name: string;
    count: number;
}

interface Insights {
    topActors: PersonCount[];
    topDirectors: PersonCount[];
    topGenres: GenreCount[];
    totalFilms: number;
    fetchedFilms: number;
}

export function CinematicInsights({ logs }: { logs: any[] }) {
    const [insights, setInsights] = useState<Insights | null>(null);
    const [loading, setLoading] = useState(false);

    const filmIds = useMemo(() => {
        const ids = new Set<number>();
        for (const log of logs) {
            const fid = log.filmId || log.film_id;
            if (fid) ids.add(Number(fid));
        }
        return Array.from(ids);
    }, [logs]);

    useEffect(() => {
        if (filmIds.length < 3) return;

        let cancelled = false;
        setLoading(true);

        (async () => {
            const idsToFetch = filmIds.slice(0, 60); // limit for mobile perf
            const BATCH_SIZE = 4;
            const BATCH_DELAY = 400;

            const allMovies: any[] = [];

            for (let i = 0; i < idsToFetch.length; i += BATCH_SIZE) {
                if (cancelled) return;
                const batch = idsToFetch.slice(i, i + BATCH_SIZE);
                const results = await Promise.allSettled(
                    batch.map(id => tmdb.detail(id))
                );

                for (const result of results) {
                    if (result.status === 'fulfilled' && result.value) {
                        allMovies.push(result.value);
                    }
                }

                if (i + BATCH_SIZE < idsToFetch.length) {
                    await new Promise(r => setTimeout(r, BATCH_DELAY));
                }
            }

            if (cancelled) return;

            const actorMap = new Map<number, PersonCount>();
            const directorMap = new Map<number, PersonCount>();
            const genreMap = new Map<string, number>();

            for (const movie of allMovies) {
                // Genres
                if (movie.genres) {
                    for (const g of movie.genres) {
                        genreMap.set(g.name, (genreMap.get(g.name) || 0) + 1);
                    }
                } else if (movie.genre_ids) {
                    for (const gid of movie.genre_ids) {
                        const name = GENRE_MAP[gid];
                        if (name) genreMap.set(name, (genreMap.get(name) || 0) + 1);
                    }
                }

                const credits = movie.credits;
                if (!credits) continue;

                // Top 5 billed actors per film
                if (credits.cast) {
                    for (const person of credits.cast.slice(0, 5)) {
                        const existing = actorMap.get(person.id);
                        if (existing) {
                            existing.count++;
                        } else {
                            actorMap.set(person.id, {
                                id: person.id,
                                name: person.name,
                                profile_path: person.profile_path,
                                count: 1,
                            });
                        }
                    }
                }

                // Directors
                if (credits.crew) {
                    for (const person of credits.crew) {
                        if (person.job === 'Director') {
                            const existing = directorMap.get(person.id);
                            if (existing) {
                                existing.count++;
                            } else {
                                directorMap.set(person.id, {
                                    id: person.id,
                                    name: person.name,
                                    profile_path: person.profile_path,
                                    count: 1,
                                });
                            }
                        }
                    }
                }
            }

            const topActors = Array.from(actorMap.values()).sort((a, b) => b.count - a.count).slice(0, 5);
            const topDirectors = Array.from(directorMap.values()).sort((a, b) => b.count - a.count).slice(0, 5);
            const topGenres = Array.from(genreMap.entries())
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 8);

            if (!cancelled) {
                setInsights({ topActors, topDirectors, topGenres, totalFilms: idsToFetch.length, fetchedFilms: allMovies.length });
                setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [filmIds]);

    if (filmIds.length < 3) {
        return (
            <View style={s.card}>
                <Text style={s.sectionTitle}>CINEMATIC INSIGHTS</Text>
                <Text style={s.emptyText}>Log at least 3 films to unlock your cinematic insights.</Text>
            </View>
        );
    }

    if (loading || !insights) {
        return (
            <View style={s.card}>
                <Text style={s.sectionTitle}>ANALYZING {filmIds.length} LOGGED FILMS</Text>
                <ActivityIndicator color={colors.sepia} style={{ marginVertical: 16 }} />
                <Text style={s.emptyText}>Fetching credits from TMDB...</Text>
            </View>
        );
    }

    const maxActorCount = insights.topActors[0]?.count || 1;
    const maxDirectorCount = insights.topDirectors[0]?.count || 1;
    const maxGenreCount = insights.topGenres[0]?.count || 1;

    return (
        <View style={s.container}>
            <Text style={s.metaNote}>BASED ON {insights.fetchedFilms} OF {filmIds.length} LOGGED FILMS</Text>

            {/* Top Actors */}
            {insights.topActors.length > 0 && (
                <Animated.View entering={FadeIn.duration(500)} style={s.card}>
                    <Text style={s.sectionTitle}>✦ MOST WATCHED ACTORS</Text>
                    {insights.topActors.map((actor, i) => (
                        <Animated.View key={actor.id} entering={FadeInRight.delay(i * 80).duration(400)} style={s.personRow}>
                            {/* Rank */}
                            <View style={[s.rankCircle, i === 0 && { backgroundColor: colors.sepia }]}>
                                <Text style={[s.rankText, i === 0 && { color: colors.ink }]}>{i + 1}</Text>
                            </View>
                            {/* Photo */}
                            <View style={[s.avatar, i === 0 && { borderColor: colors.sepia, borderWidth: 2 }]}>
                                {actor.profile_path ? (
                                    <Image source={{ uri: `https://image.tmdb.org/t/p/w185${actor.profile_path}` }} style={s.avatarImg} />
                                ) : (
                                    <Text style={s.avatarFallback}>✦</Text>
                                )}
                            </View>
                            {/* Name + Bar */}
                            <View style={s.personInfo}>
                                <Text style={[s.personName, i === 0 && { color: colors.parchment }]} numberOfLines={1}>{actor.name}</Text>
                                <View style={s.barTrack}>
                                    <View style={[s.barFill, { width: `${(actor.count / maxActorCount) * 100}%` }, i === 0 && { backgroundColor: colors.flicker }]} />
                                </View>
                            </View>
                            {/* Count */}
                            <Text style={[s.countText, i === 0 && { color: colors.sepia }]}>{actor.count}</Text>
                        </Animated.View>
                    ))}
                </Animated.View>
            )}

            {/* Top Directors */}
            {insights.topDirectors.length > 0 && (
                <Animated.View entering={FadeIn.delay(200).duration(500)} style={s.card}>
                    <Text style={s.sectionTitle}>✦ MOST WATCHED DIRECTORS</Text>
                    {insights.topDirectors.map((director, i) => (
                        <Animated.View key={director.id} entering={FadeInRight.delay(i * 80).duration(400)} style={s.personRow}>
                            <View style={[s.rankCircle, i === 0 && { backgroundColor: colors.sepia }]}>
                                <Text style={[s.rankText, i === 0 && { color: colors.ink }]}>{i + 1}</Text>
                            </View>
                            <View style={[s.avatar, i === 0 && { borderColor: colors.sepia, borderWidth: 2 }]}>
                                {director.profile_path ? (
                                    <Image source={{ uri: `https://image.tmdb.org/t/p/w185${director.profile_path}` }} style={s.avatarImg} />
                                ) : (
                                    <Text style={s.avatarFallback}>✦</Text>
                                )}
                            </View>
                            <View style={s.personInfo}>
                                <Text style={[s.personName, i === 0 && { color: colors.parchment }]} numberOfLines={1}>{director.name}</Text>
                                <View style={s.barTrack}>
                                    <View style={[s.barFill, { width: `${(director.count / maxDirectorCount) * 100}%` }, i === 0 && { backgroundColor: colors.flicker }]} />
                                </View>
                            </View>
                            <Text style={[s.countText, i === 0 && { color: colors.sepia }]}>{director.count}</Text>
                        </Animated.View>
                    ))}
                </Animated.View>
            )}

            {/* Genre Breakdown */}
            {insights.topGenres.length > 0 && (
                <Animated.View entering={FadeIn.delay(400).duration(500)} style={s.card}>
                    <Text style={s.sectionTitle}>✦ GENRE BREAKDOWN</Text>
                    {insights.topGenres.map((genre, i) => {
                        const pct = Math.round((genre.count / insights.totalFilms) * 100);
                        return (
                            <Animated.View key={genre.name} entering={FadeInRight.delay(i * 50).duration(300)} style={s.genreRow}>
                                <View style={s.genreHeader}>
                                    <Text style={[s.genreName, i === 0 && { color: colors.parchment }]}>{genre.name}</Text>
                                    <View style={s.genreCountWrap}>
                                        <Text style={[s.countText, i === 0 && { color: colors.sepia }]}>{genre.count}</Text>
                                        <Text style={s.pctText}>{pct}%</Text>
                                    </View>
                                </View>
                                <View style={s.barTrack}>
                                    <View style={[s.barFill, { width: `${(genre.count / maxGenreCount) * 100}%`, opacity: 1 - i * 0.08 }, i === 0 && { backgroundColor: colors.flicker }]} />
                                </View>
                            </Animated.View>
                        );
                    })}
                </Animated.View>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    container: { gap: 16 },
    metaNote: { textAlign: 'center', fontFamily: fonts.ui, fontSize: 7, letterSpacing: 2, color: colors.ash, marginBottom: 4 },
    card: {
        padding: 20, backgroundColor: colors.soot,
        borderWidth: 1, borderColor: colors.ash, borderRadius: 4,
    },
    sectionTitle: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.sepia, marginBottom: 16 },
    emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.fog, fontStyle: 'italic', textAlign: 'center' },
    // Person rows
    personRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    rankCircle: {
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: 'rgba(139,105,20,0.15)',
        alignItems: 'center', justifyContent: 'center',
    },
    rankText: { fontFamily: fonts.uiBold, fontSize: 9, color: colors.fog },
    avatar: {
        width: 36, height: 36, borderRadius: 18, overflow: 'hidden',
        borderWidth: 1, borderColor: colors.ash, backgroundColor: colors.soot,
        alignItems: 'center', justifyContent: 'center',
    },
    avatarImg: { width: '100%', height: '100%', resizeMode: 'cover' },
    avatarFallback: { fontFamily: fonts.display, fontSize: 14, color: colors.ash },
    personInfo: { flex: 1 },
    personName: { fontFamily: fonts.sub, fontSize: 13, color: colors.bone, marginBottom: 4 },
    barTrack: { height: 4, backgroundColor: colors.ash, borderRadius: 2, overflow: 'hidden' },
    barFill: { height: '100%', backgroundColor: colors.sepia, borderRadius: 2 },
    countText: { fontFamily: fonts.display, fontSize: 16, color: colors.fog, minWidth: 24, textAlign: 'right' },
    // Genre rows
    genreRow: { marginBottom: 10 },
    genreHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
    genreName: { fontFamily: fonts.sub, fontSize: 13, color: colors.bone },
    genreCountWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
    pctText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.ash },
});
