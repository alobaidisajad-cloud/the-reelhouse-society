/**
 * TasteDNA — Visual taste fingerprint display.
 * Shows genre preferences as a DNA-style bar visualization.
 */
import React, { memo, useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeInRight, runOnJS } from 'react-native-reanimated';
import TactileEngine from '@/src/utils/TactileEngine';
import * as Sharing from 'expo-sharing';
import { Share2 } from 'lucide-react-native';
import ViewShot from 'react-native-view-shot';
import { colors, fonts } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import { GLOBAL_TMDB_CACHE, INFLIGHT_TMDB_REQUESTS } from './CinematicInsights';
import { FilmSchema } from '@/src/lib/schemas';
import { TasteDNAExportCanvas } from './TasteDNAExportCanvas';
import PressableScale from '../PressableScale';

// Stable JS-thread wrapper so runOnJS gets a plain function reference (a bare
// TactileEngine.navigate would lose its `this` binding).
function hapticLight() { TactileEngine.navigate(); }

interface TasteDNALog {
    filmId?: number;
    film_id?: number;
    genre_ids?: number[];
}

interface TasteDNAProps {
    logs: TasteDNALog[];
    username?: string;
    /** Padded member serial — stamped on the shared export artifact. */
    memberNo?: string | null;
}

const GENRE_MAP: Record<number, string> = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
    80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
    14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
    9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
    53: 'Thriller', 10752: 'War', 37: 'Western',
};

export const TasteDNA = memo(function TasteDNA({ logs, username, memberNo }: TasteDNAProps) {
    const [computedGenres, setComputedGenres] = useState<[string, number][]>([]);
    const [totalResolvedFilms, setTotalResolvedFilms] = useState(0);
    const [isSharing, setIsSharing] = useState(false);
    const viewShotRef = React.useRef<ViewShot>(null);

    const filmIds = useMemo(() => {
        const ids = new Set<number>();
        for (const log of logs) {
            const fid = log.filmId ?? log.film_id;
            if (fid) ids.add(Number(fid));
        }
        return Array.from(ids);
    }, [logs]);

    useEffect(() => {
        if (filmIds.length < 5) {
            setComputedGenres([]);
            return;
        }

        let cancelled = false;

        (async () => {
            const idsToFetch = filmIds.slice(0, 60);
            const BATCH_SIZE = 4;
            const BATCH_DELAY = 400;

            const idsToNetworkFetch: number[] = [];
            for (const id of idsToFetch) {
                if (!GLOBAL_TMDB_CACHE.has(id)) {
                    idsToNetworkFetch.push(id);
                }
            }

            for (let i = 0; i < idsToNetworkFetch.length; i += BATCH_SIZE) {
                if (cancelled) return;
                const batch = idsToNetworkFetch.slice(i, i + BATCH_SIZE);
                const results = await Promise.allSettled(
                    batch.map(id => {
                        if (INFLIGHT_TMDB_REQUESTS.has(id)) {
                            return INFLIGHT_TMDB_REQUESTS.get(id)!;
                        }
                        const promise = tmdb.detail(id).finally(() => {
                            INFLIGHT_TMDB_REQUESTS.delete(id);
                        });
                        INFLIGHT_TMDB_REQUESTS.set(id, promise);
                        return promise;
                    })
                );

                for (let j = 0; j < results.length; j++) {
                    const result = results[j];
                    if (result.status === 'fulfilled' && result.value) {
                        const parsed = FilmSchema.safeParse(result.value);
                        if (parsed.success) {
                            GLOBAL_TMDB_CACHE.set(batch[j], parsed.data as any); // using as any since map expects TMDBMovie, but FilmSchema is parsed safely. 
                        } else {
                            console.warn(`[TasteDNA] Malformed TMDB payload for ID ${batch[j]}`);
                        }
                    }
                }
                if (i + BATCH_SIZE < idsToNetworkFetch.length) {
                    await new Promise(r => setTimeout(r, BATCH_DELAY));
                }
            }

            if (cancelled) return;

            const genreCounts = new Map<string, number>();
            let resolvedCount = 0;
            for (const id of idsToFetch) {
                const movie = GLOBAL_TMDB_CACHE.get(id);
                if (!movie) continue;
                
                let hasGenre = false;
                if (movie.genres && movie.genres.length > 0) {
                    hasGenre = true;
                    for (const g of movie.genres) {
                        genreCounts.set(g.name, (genreCounts.get(g.name) ?? 0) + 1);
                    }
                } else if (movie.genre_ids && movie.genre_ids.length > 0) {
                    hasGenre = true;
                    for (const gid of movie.genre_ids) {
                        const name = GENRE_MAP[gid];
                        if (name) genreCounts.set(name, (genreCounts.get(name) ?? 0) + 1);
                    }
                }
                if (hasGenre) resolvedCount++;
            }

            const sorted = Array.from(genreCounts.entries())
                .sort(([, a], [, b]) => b - a)
                .slice(0, 6);

            setComputedGenres(sorted);
            setTotalResolvedFilms(resolvedCount);
        })();

        return () => { cancelled = true; };
    }, [filmIds]);

    if (computedGenres.length === 0) return null;

    const maxCount = computedGenres[0][1];

    // Generate "DNA" color from genre position
    const dnaColors = [colors.tarnish, '#A67B17', '#C4921E', '#D4A825', '#E0BC3A', '#F0D050'];

    const handleShare = async () => {
        if (isSharing || !viewShotRef.current) return;
        try {
            TactileEngine.mutate();
            setIsSharing(true);
            const uri = await viewShotRef.current.capture?.();
            if (uri) {
                await Sharing.shareAsync(uri, { dialogTitle: 'Share your Taste DNA' });
            }
        } catch (e) {
            if (__DEV__) console.error('Failed to export TasteDNA', e);
        } finally {
            setIsSharing(false);
        }
    };

    return (
        <Animated.View entering={FadeIn.duration(500)} style={s.container}>
            <View style={s.headerRow}>
                <View>
                    <Text style={s.title}>TASTE DNA</Text>
                    <Text style={s.subtitle}>Your cinematic fingerprint</Text>
                </View>
                <PressableScale onPress={handleShare} style={s.shareBtn} haptic>
                    <Share2 size={16} color={isSharing ? colors.sepia : colors.fog} />
                </PressableScale>
            </View>

            <View style={s.dnaStrip}>
                {computedGenres.map(([genre, count], i) => {
                    const pct = Math.round((count / Math.max(totalResolvedFilms, 1)) * 100);
                    const barWidth = `${(count / maxCount) * 100}%`;
                    const anim = FadeInRight.delay(i * 60).duration(300).withCallback((finished) => {
                        if (finished) {
                            runOnJS(hapticLight)();
                        }
                    });
                    return (
                        <Animated.View key={genre} entering={anim} style={s.row}>
                            <Text style={s.genreLabel} numberOfLines={1} adjustsFontSizeToFit>{genre.toUpperCase()}</Text>
                            <View style={s.barTrack}>
                                <View style={[s.barFill, { width: barWidth as import('react-native').DimensionValue, backgroundColor: dnaColors[i] ?? colors.sepia }]} />
                            </View>
                            <Text style={s.pctLabel}>{pct}%</Text>
                        </Animated.View>
                    );
                })}
            </View>

            <View style={s.helixDecor}>
                {Array.from({ length: 12 }).map((_, i) => (
                    <View key={i} style={[s.helixDot, { opacity: 0.1 + (i % 3) * 0.15, left: `${(i / 12) * 100}%` }]} />
                ))}
            </View>

            {/* Offscreen High-Fidelity Canvas for Lumière Export */}
            <TasteDNAExportCanvas ref={viewShotRef} genres={computedGenres} username={username} memberNo={memberNo} />
        </Animated.View>
    );
});

const s = StyleSheet.create({
    container: {
        padding: 20, backgroundColor: 'rgba(8,6,4,0.98)',
        borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)', borderRadius: 4,
        position: 'relative', overflow: 'hidden',
    },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    shareBtn: { padding: 4, opacity: 0.8 },
    title: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2, color: colors.sepia, marginBottom: 4 },
    subtitle: { fontFamily: fonts.body, fontSize: 12, color: colors.fog, fontStyle: 'italic', marginBottom: 16 },
    dnaStrip: { gap: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    genreLabel: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1, color: colors.fog, minWidth: 70 },
    barTrack: { flex: 1, height: 6, backgroundColor: 'rgba(184,137,26,0.15)', borderRadius: 3, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 3 },
    pctLabel: { fontFamily: fonts.sub, fontSize: 8, color: colors.fog, minWidth: 28, textAlign: 'right' },
    helixDecor: { position: 'absolute', bottom: 6, left: 0, right: 0, height: 4, flexDirection: 'row' },
    helixDot: { position: 'absolute', width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.sepia },
});
