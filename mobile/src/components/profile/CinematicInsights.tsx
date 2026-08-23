/**
 * CinematicInsights — Real analytics computed from the user's logged films.
 * Fetches TMDB credits to determine top actors, directors, and genres.
 * Nitrate Noir themed — matches the web exactly.
 */
import { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
import { colors, fonts } from '@/src/theme/theme';
// The URL builder only — the fetching half of this module is no longer used here.
import { tmdb } from '@/src/lib/tmdb';
import { scaledTextProps } from '@/src/constants/textScaling';
import { tally } from './profileComputed';
import { tasteReadiness, type TasteProfile } from '@/src/constants/taste';

/**
 * Deleted with the TMDB fetch: a 19-entry GENRE_MAP that had to be kept in step
 * with TMDB by hand, a hand-rolled LRUCache, and the two module-level caches it
 * backed (GLOBAL_TMDB_CACHE, INFLIGHT_TMDB_REQUESTS). Both were exported, and
 * nothing outside this file ever imported them — they existed to survive tab
 * unmounts during a fetch storm that no longer happens. Genre names now arrive
 * spelled out from the films table, so there is no id to map.
 */

export function CinematicInsights({ taste }: { taste?: TasteProfile | null }) {
    /**
     * ── WHAT THIS USED TO DO ─────────────────────────────────────────────────
     * Fetched every film's credits from TMDB, four at a time, 400ms apart, with
     * an LRU cache and an in-flight map to survive it — and stopped at sixty:
     *
     *     const idsToFetch = filmIds.slice(0, 60);   // limit for mobile perf
     *
     * To its credit this panel DID say "BASED ON 58 OF 2481 LOGGED FILMS",
     * which is more than TasteDNA managed. But honest about a bad answer is
     * still a bad answer, and for a VISITOR to a non-Auteur profile those
     * sixty were drawn from the fifty logs that happened to have loaded — so
     * the denominator was wrong too.
     *
     * The server counts across everything now. The cache, the batching, the
     * delays, the in-flight map and the abort handling are all gone: there is
     * one payload and it is already here.
     */
    const ready = useMemo(() => tasteReadiness(taste), [taste]);

    const topActors = taste?.actors ?? [];
    const topDirectors = taste?.directors ?? [];
    const topGenres = taste?.genres ?? [];

    /**
     * No payload at all is NOT an empty archive — it is a page that has not
     * finished loading, or a request that failed. Those are different claims and
     * only one of them is ours to make.
     *
     * Without this the panel fell through to "READING YOUR ARCHIVE / Nothing
     * catalogued yet." under a spinner that would never resolve: a member whose
     * request had simply failed was told their archive was empty, in a room
     * built to show them what they had watched. Render nothing and let the rest
     * of the page speak.
     */
    if (!taste) return null;

    // Fewer than three films is not "still loading" — it is a member who has
    // not logged enough for any of this to mean anything. Zero belongs here
    // too: an empty archive is a finished answer, not a slow one.
    if (ready.total < 3) {
        return (
            <View style={s.card}>
                <Text {...scaledTextProps} style={s.sectionTitle}>CINEMATIC INSIGHTS</Text>
                <Text {...scaledTextProps} style={s.emptyText}>Log at least 3 films to unlock your cinematic insights.</Text>
            </View>
        );
    }

    /**
     * READING, not "analyzing".
     *
     * The films table fills in over time, so on the first day a member with two
     * thousand films may have thirty read. Ranking those thirty would produce a
     * confident and completely false portrait — the exact failure this whole
     * pass exists to remove, in a new place. So below the coverage floor the
     * panel says what it is doing, with the real progress.
     */
    if (!ready.ready) {
        return (
            <View style={s.card}>
                <Text {...scaledTextProps} style={s.sectionTitle}>READING YOUR ARCHIVE</Text>
                <ActivityIndicator color={colors.sepia} style={s.loaderMargin} />
                {/* An archive of 0, 1 or 2 films is handled above, so `total`
                    is at least 3 by here and the count always says something. */}
                <Text {...scaledTextProps} style={s.emptyText}>
                    {`${tally(ready.known)} of ${tally(ready.total)} films catalogued so far.`}
                </Text>
            </View>
        );
    }

    if (topActors.length === 0 && topDirectors.length === 0 && topGenres.length === 0) return null;

    const maxActorCount = topActors[0]?.count ?? 1;
    const maxDirectorCount = topDirectors[0]?.count ?? 1;
    const maxGenreCount = topGenres[0]?.count ?? 1;

    return (
        <View style={s.container}>
            {/* The old line read "BASED ON 58 OF 2481 LOGGED FILMS" — honest,
                but about a sample of sixty. This one is drawn from everything
                read so far, and once that is everything the line goes away
                rather than restating what is now simply true. */}
            {!ready.complete && (
                <Text {...scaledTextProps} style={s.metaNote}>
                    BASED ON {tally(ready.known)} OF {tally(ready.total)} FILMS
                </Text>
            )}

            {/* Top Actors */}
            {topActors.length > 0 && (
                <Animated.View entering={FadeIn.duration(500)} style={s.card}>
                    <Text {...scaledTextProps} style={s.sectionTitle}>✦ MOST WATCHED ACTORS</Text>
                    {topActors.map((actor, i) => (
                        <Animated.View key={actor.id} entering={FadeInRight.delay(i * 80).duration(400)} style={s.personRow}>
                            {/* Rank */}
                            <View style={[s.rankCircle, i === 0 && { backgroundColor: colors.sepia }]}>
                                <Text {...scaledTextProps} style={[s.rankText, i === 0 && { color: colors.ink }]}>{i + 1}</Text>
                            </View>
                            {/* Photo */}
                            <View style={[s.avatar, i === 0 && { borderColor: colors.sepia, borderWidth: 2 }]}>
                                {actor.profile_path ? (
                                <Image source={{ uri: tmdb.profile(actor.profile_path) }} style={s.avatarImg} cachePolicy="memory-disk" transition={150} />
                                ) : (
                                    <Text {...scaledTextProps} style={s.avatarFallback}>✦</Text>
                                )}
                            </View>
                            {/* Name + Bar */}
                            <View style={s.personInfo}>
                                <Text {...scaledTextProps} style={[s.personName, i === 0 && { color: colors.parchment }]} numberOfLines={1}>{actor.name}</Text>
                                <View style={s.barTrack}>
                                    <View style={[s.barFill, { width: `${(actor.count / maxActorCount) * 100}%` }, i === 0 && { backgroundColor: colors.flicker }]} />
                                </View>
                            </View>
                            {/* Count */}
                            <Text {...scaledTextProps} style={[s.countText, i === 0 && { color: colors.sepia }]}>{actor.count}</Text>
                        </Animated.View>
                    ))}
                </Animated.View>
            )}

            {/* Top Directors */}
            {topDirectors.length > 0 && (
                <Animated.View entering={FadeIn.delay(200).duration(500)} style={s.card}>
                    <Text {...scaledTextProps} style={s.sectionTitle}>✦ MOST WATCHED DIRECTORS</Text>
                    {topDirectors.map((director, i) => (
                        <Animated.View key={director.id} entering={FadeInRight.delay(i * 80).duration(400)} style={s.personRow}>
                            <View style={[s.rankCircle, i === 0 && { backgroundColor: colors.sepia }]}>
                                <Text {...scaledTextProps} style={[s.rankText, i === 0 && { color: colors.ink }]}>{i + 1}</Text>
                            </View>
                            <View style={[s.avatar, i === 0 && { borderColor: colors.sepia, borderWidth: 2 }]}>
                                {director.profile_path ? (
                                <Image source={{ uri: tmdb.profile(director.profile_path) }} style={s.avatarImg} cachePolicy="memory-disk" transition={150} />
                                ) : (
                                    <Text {...scaledTextProps} style={s.avatarFallback}>✦</Text>
                                )}
                            </View>
                            <View style={s.personInfo}>
                                <Text {...scaledTextProps} style={[s.personName, i === 0 && { color: colors.parchment }]} numberOfLines={1}>{director.name}</Text>
                                <View style={s.barTrack}>
                                    <View style={[s.barFill, { width: `${(director.count / maxDirectorCount) * 100}%` }, i === 0 && { backgroundColor: colors.flicker }]} />
                                </View>
                            </View>
                            <Text {...scaledTextProps} style={[s.countText, i === 0 && { color: colors.sepia }]}>{director.count}</Text>
                        </Animated.View>
                    ))}
                </Animated.View>
            )}

            {/* Genre Breakdown */}
            {topGenres.length > 0 && (
                <Animated.View entering={FadeIn.delay(400).duration(500)} style={s.card}>
                    <Text {...scaledTextProps} style={s.sectionTitle}>✦ GENRE BREAKDOWN</Text>
                    {topGenres.map((genre, i) => {
                        // Films READ, not films logged. A film carries two or
                        // three genres, so the counts sum to more than the
                        // archive — dividing by the archive would understate
                        // every one of them.
                        const pct = Math.round((genre.count / Math.max(ready.known, 1)) * 100);
                        return (
                            <Animated.View key={genre.name} entering={FadeInRight.delay(i * 50).duration(300)} style={s.genreRow}>
                                <View style={s.genreHeader}>
                                    <Text {...scaledTextProps} style={[s.genreName, i === 0 && { color: colors.parchment }]} numberOfLines={1}>{genre.name}</Text>
                                    <View style={s.genreCountWrap}>
                                        <Text {...scaledTextProps} style={[s.countText, i === 0 && { color: colors.sepia }]}>{genre.count}</Text>
                                        <Text {...scaledTextProps} style={s.pctText}>{pct}%</Text>
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
    metaNote: { textAlign: 'center', fontFamily: fonts.sub, fontSize: 7, letterSpacing: 2, color: colors.fog, opacity: 0.6, marginBottom: 4 },
    card: {
        padding: 20, backgroundColor: 'rgba(8,6,4,0.98)',
        borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)', borderRadius: 4,
    },
    sectionTitle: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2, color: colors.sepia, marginBottom: 16 },
    emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.fog, fontStyle: 'italic', textAlign: 'center' },
    // Person rows
    personRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    rankCircle: {
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: 'rgba(184,137,26,0.15)',
        alignItems: 'center', justifyContent: 'center',
    },
    rankText: { fontFamily: fonts.sub, fontSize: 9, color: colors.fog },
    avatar: {
        width: 36, height: 36, borderRadius: 18, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(184,137,26,0.15)', backgroundColor: '#050402',
        alignItems: 'center', justifyContent: 'center',
    },
    avatarImg: { width: '100%', height: '100%' } as import('react-native').ImageStyle,
    avatarFallback: { fontFamily: fonts.display, fontSize: 14, color: colors.ash },
    personInfo: { flex: 1 },
    personName: { fontFamily: fonts.sub, fontSize: 13, color: colors.bone, marginBottom: 4 },
    barTrack: { height: 4, backgroundColor: 'rgba(184,137,26,0.15)', borderRadius: 2, overflow: 'hidden' },
    barFill: { height: '100%', backgroundColor: colors.sepia, borderRadius: 2 },
    countText: { fontFamily: fonts.display, fontSize: 16, color: colors.fog, minWidth: 24, textAlign: 'right' },
    // Genre rows
    genreRow: { marginBottom: 10 },
    genreHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, gap: 8 },
    genreName: { fontFamily: fonts.sub, fontSize: 13, color: colors.bone, flex: 1 },
    genreCountWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
    pctText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1, color: colors.fog, opacity: 0.6 },
    loaderMargin: { marginVertical: 16 },
});
