/**
 * TasteDNA — Visual taste fingerprint display.
 * Shows genre preferences as a DNA-style bar visualization.
 */
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
import { colors, fonts } from '@/src/theme/theme';

interface TasteDNAProps {
    logs: any[];
}

const GENRE_MAP: Record<number, string> = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
    80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
    14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
    9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
    53: 'Thriller', 10752: 'War', 37: 'Western',
};

export function TasteDNA({ logs }: TasteDNAProps) {
    if (logs.length < 5) return null;

    // Compute genre distribution from logs
    const genreCounts = new Map<string, number>();
    for (const log of logs) {
        if (log.genre_ids) {
            for (const gid of log.genre_ids) {
                const name = GENRE_MAP[gid];
                if (name) genreCounts.set(name, (genreCounts.get(name) || 0) + 1);
            }
        }
    }

    const sorted = Array.from(genreCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 6);

    if (sorted.length === 0) return null;

    const maxCount = sorted[0][1];

    // Generate "DNA" color from genre position
    const dnaColors = ['#8B6914', '#A67B17', '#C4921E', '#D4A825', '#E0BC3A', '#F0D050'];

    return (
        <Animated.View entering={FadeIn.duration(500)} style={s.container}>
            <Text style={s.title}>TASTE DNA</Text>
            <Text style={s.subtitle}>Your cinematic fingerprint</Text>

            <View style={s.dnaStrip}>
                {sorted.map(([genre, count], i) => {
                    const pct = Math.round((count / logs.length) * 100);
                    const barWidth = `${(count / maxCount) * 100}%`;
                    return (
                        <Animated.View key={genre} entering={FadeInRight.delay(i * 60).duration(300)} style={s.row}>
                            <Text style={s.genreLabel}>{genre.toUpperCase()}</Text>
                            <View style={s.barTrack}>
                                <View style={[s.barFill, { width: barWidth as any, backgroundColor: dnaColors[i] || colors.sepia }]} />
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
        </Animated.View>
    );
}

const s = StyleSheet.create({
    container: {
        padding: 20, backgroundColor: colors.soot,
        borderWidth: 1, borderColor: colors.ash, borderRadius: 4,
        position: 'relative', overflow: 'hidden',
    },
    title: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.sepia, marginBottom: 4 },
    subtitle: { fontFamily: fonts.body, fontSize: 12, color: colors.fog, fontStyle: 'italic', marginBottom: 16 },
    dnaStrip: { gap: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    genreLabel: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.fog, minWidth: 70 },
    barTrack: { flex: 1, height: 6, backgroundColor: colors.ash, borderRadius: 3, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 3 },
    pctLabel: { fontFamily: fonts.ui, fontSize: 8, color: colors.fog, minWidth: 28, textAlign: 'right' },
    helixDecor: { position: 'absolute', bottom: 6, left: 0, right: 0, height: 4, flexDirection: 'row' },
    helixDot: { position: 'absolute', width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.sepia },
});
