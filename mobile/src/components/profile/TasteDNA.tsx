/**
 * TasteDNA — a member's genre fingerprint, over their WHOLE archive.
 *
 * ── WHAT THIS USED TO DO ─────────────────────────────────────────────────────
 * It fetched films from TMDB one at a time, from the phone, in batches of four
 * with a 400ms pause between them, and stopped at sixty:
 *
 *     const idsToFetch = filmIds.slice(0, 60);   // limit for mobile perf
 *
 * Sixty is roughly what a handset can pull before the page feels broken. So a
 * member with five thousand films saw a "cinematic fingerprint" drawn from
 * sixty of them, and nothing on screen said so. For a VISITOR looking at a
 * non-Auteur profile it was worse: those sixty were drawn from the fifty logs
 * that happened to have loaded.
 *
 * It cannot be fixed on the phone — the data has to be ours. It is now: the
 * films table holds genres, and the server counts them across everything.
 *
 * The whole fetch-batch-cache-retry apparatus is gone. This component reads one
 * number set and draws it.
 */
import React, { memo, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeInRight, runOnJS } from 'react-native-reanimated';
import TactileEngine from '@/src/utils/TactileEngine';
import * as Sharing from 'expo-sharing';
import { Share2 } from 'lucide-react-native';
import ViewShot from 'react-native-view-shot';
import { colors, fonts } from '@/src/theme/theme';
import { TasteDNAExportCanvas } from './TasteDNAExportCanvas';
import PressableScale from '../PressableScale';
import { scaledTextProps } from '@/src/constants/textScaling';
import { tally } from './profileComputed';
import { tasteReadiness, coverageNote, type TasteProfile } from '@/src/constants/taste';

// Stable JS-thread wrapper so runOnJS gets a plain function reference (a bare
// TactileEngine.navigate would lose its `this` binding).
function hapticLight() { TactileEngine.navigate(); }

interface TasteDNAProps {
    /** The server's answer, over every film. Null = not read yet. */
    taste?: TasteProfile | null;
    username?: string;
    /** Padded member serial — stamped on the shared export artifact. */
    memberNo?: string | null;
}

export const TasteDNA = memo(function TasteDNA({ taste, username, memberNo }: TasteDNAProps) {
    const [isSharing, setIsSharing] = useState(false);
    const viewShotRef = React.useRef<ViewShot>(null);

    const ready = useMemo(() => tasteReadiness(taste), [taste]);

    /** Top six, as before — the shape of the strip is unchanged. */
    const computedGenres = useMemo<[string, number][]>(
        () => (taste?.genres ?? []).slice(0, 6).map((g) => [g.name, g.count] as [string, number]),
        [taste],
    );

    /**
     * The denominator for the percentages.
     *
     * `films_known`, not the sum of genre counts: a film carries two or three
     * genres, so summing them gives a number larger than the archive and every
     * percentage comes out too small. It used to count "films we resolved",
     * which meant the same thing for sixty films and nothing at all beyond.
     */
    const denominator = Math.max(ready.known, 1);

    // Nothing logged, or nothing read yet — the parent decides what to say.
    if (!ready.ready || computedGenres.length === 0) return null;

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
                    <Text {...scaledTextProps} style={s.title}>TASTE DNA</Text>
                    {/* Says what it is drawn from while that is still less than
                        everything, and stops saying it the moment it is not.
                        A member should always be able to tell "your taste" from
                        "your taste so far", and the line costs one row. */}
                    <Text {...scaledTextProps} style={s.subtitle}>
                        {coverageNote(ready, tally) ?? 'Your cinematic fingerprint'}
                    </Text>
                </View>
                <PressableScale onPress={handleShare} style={s.shareBtn} haptic accessibilityRole="button" accessibilityLabel="Share your taste profile" accessibilityState={{ busy: isSharing }}>
                    <Share2 size={16} color={isSharing ? colors.sepia : colors.fog} />
                </PressableScale>
            </View>

            <View style={s.dnaStrip}>
                {computedGenres.map(([genre, count], i) => {
                    const pct = Math.round((count / denominator) * 100);
                    const barWidth = `${(count / maxCount) * 100}%`;
                    const anim = FadeInRight.delay(i * 60).duration(300).withCallback((finished) => {
                        if (finished) {
                            runOnJS(hapticLight)();
                        }
                    });
                    return (
                        <Animated.View key={genre} entering={anim} style={s.row}>
                            <Text {...scaledTextProps} style={s.genreLabel} numberOfLines={1} adjustsFontSizeToFit>{genre.toUpperCase()}</Text>
                            <View style={s.barTrack}>
                                <View style={[s.barFill, { width: barWidth as import('react-native').DimensionValue, backgroundColor: dnaColors[i] ?? colors.sepia }]} />
                            </View>
                            <Text {...scaledTextProps} style={s.pctLabel}>{pct}%</Text>
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
