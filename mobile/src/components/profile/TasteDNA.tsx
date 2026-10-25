/**
 * TasteDNA — a member's genre fingerprint, over their WHOLE archive: the films
 * table holds genres and the server counts them across everything, so this
 * reads one number set and draws it. Until that set is read, or while too
 * little of the archive is catalogued to rank honestly, it says so.
 */
import React, { memo, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import TactileEngine from '@/src/utils/TactileEngine';
import * as Sharing from 'expo-sharing';
import { Share2 } from 'lucide-react-native';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';
import { colors, fonts } from '@/src/theme/theme';
import { TasteDNAExportCanvas } from './TasteDNAExportCanvas';
import PressableScale from '../PressableScale';
import { scaledTextProps } from '@/src/constants/textScaling';
import { tally } from './profileComputed';
import { tasteReadiness, coverageNote, type TasteProfile } from '@/src/constants/taste';
import { EDGE_LIT } from '@/src/theme/light';
import { RoomRetrieving, RoomUnreachable } from './RoomParts';
import { counted } from '@/src/utils/counted';
import { Arrive } from '@/src/components/Arrive';

// Stable JS-thread wrapper so runOnJS gets a plain function reference (a bare
// TactileEngine.navigate would lose its `this` binding).
function hapticLight() { TactileEngine.navigate(); }
/** A bar's arrival, and the gap between one bar's and the next's. */
const BAR_MS = 300;
const BAR_BEAT = 60;

interface TasteDNAProps {
    /** The server's answer, over every film. Null = not read yet. */
    taste?: TasteProfile | null;
    username?: string;
    /** Padded member serial — stamped on the shared export artifact. */
    memberNo?: string | null;
    /** Your own file: the words say "your". */
    isSelf: boolean;
    /** The taste read failed. */
    failed?: boolean;
    onRetry?: () => void;
}

export const TasteDNA = memo(function TasteDNA({ taste, username, memberNo, isSelf, failed, onRetry }: TasteDNAProps) {
    const [isSharing, setIsSharing] = useState(false);
    const viewShotRef = React.useRef<ViewShotRef>(null);

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
     * percentage comes out too small.
     */
    const denominator = Math.max(ready.known, 1);

    // Each bar gives a light tick as it lands, on the beat it arrives on.
    const barsDrawn = !!taste && ready.total >= 3 && ready.ready && computedGenres.length > 0;
    useEffect(() => {
        if (!barsDrawn) return;
        const ticks = computedGenres.map((_, i) => setTimeout(hapticLight, i * BAR_BEAT + BAR_MS));
        return () => ticks.forEach(clearTimeout);
    }, [barsDrawn, computedGenres]);

    // Not read, too few films, or too little catalogued: said in the card's
    // own place, never a heading left over nothing.
    const plain = (line: React.ReactNode) => (
        <View style={s.container}>
            <Text {...scaledTextProps} style={s.title}>TASTE DNA</Text>
            {line}
        </View>
    );
    if (!taste) {
        return plain(failed
            ? <RoomUnreachable room="the fingerprint" onRetry={onRetry ?? (() => {})} />
            : <RoomRetrieving room="the fingerprint" />);
    }
    if (ready.total < 3) {
        return plain(<Text {...scaledTextProps} style={s.subtitle}>{isSelf ? 'Log at least 3 films to draw your fingerprint.' : 'Too few films logged to draw a fingerprint.'}</Text>);
    }
    if (!ready.ready) {
        return plain(<Text {...scaledTextProps} style={s.subtitle}>{`${tally(ready.known)} of ${counted(ready.total, 'film', 'films', tally)} catalogued so far.`}</Text>);
    }
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
                await Sharing.shareAsync(uri, { dialogTitle: isSelf ? 'Share your Taste DNA' : 'Share this Taste DNA' });
            }
        } catch (e) {
            if (__DEV__) console.error('Failed to export TasteDNA', e);
        } finally {
            setIsSharing(false);
        }
    };

    return (
        <Arrive name="tastedna-1" duration={500} rise={0} style={s.container}>
            <View style={s.headerRow}>
                <View>
                    <Text {...scaledTextProps} style={s.title}>TASTE DNA</Text>
                    {/* Says what it is drawn from while that is still less than
                        everything, and stops saying it the moment it is not.
                        A member should always be able to tell "your taste" from
                        "your taste so far", and the line costs one row. */}
                    <Text {...scaledTextProps} style={s.subtitle}>
                        {coverageNote(ready, tally, isSelf) ?? (isSelf ? 'Your cinematic fingerprint' : 'A cinematic fingerprint')}
                    </Text>
                </View>
                <PressableScale onPress={handleShare} style={s.shareBtn} haptic accessibilityRole="button" accessibilityLabel={isSelf ? 'Share your taste profile' : 'Share this taste profile'} accessibilityState={{ busy: isSharing }}>
                    <Share2 size={16} color={isSharing ? colors.sepia : colors.fog} />
                </PressableScale>
            </View>

            <View style={s.dnaStrip}>
                {computedGenres.map(([genre, count], i) => {
                    const pct = Math.round((count / denominator) * 100);
                    const barWidth = `${(count / maxCount) * 100}%`;
                    return (
                        <Arrive key={genre} name="taste-bar" delay={i * BAR_BEAT} duration={BAR_MS} rise={0} style={s.row}>
                            <Text {...scaledTextProps} style={s.genreLabel} numberOfLines={1} adjustsFontSizeToFit>{genre.toUpperCase()}</Text>
                            <View style={s.barTrack}>
                                <View style={[s.barFill, { width: barWidth as import('react-native').DimensionValue, backgroundColor: dnaColors[i] ?? colors.sepia }]} />
                            </View>
                            <Text {...scaledTextProps} style={s.pctLabel}>{pct}%</Text>
                        </Arrive>
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
        </Arrive>
    );
});

const s = StyleSheet.create({
    container: { ...EDGE_LIT,
        padding: 20, backgroundColor: colors.soot,
        borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)', borderRadius: 4,
        position: 'relative', overflow: 'hidden',
    },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    shareBtn: { padding: 4, opacity: 0.8 },
    title: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2, color: colors.sepia, marginBottom: 4 },
    subtitle: { fontFamily: fonts.bodyItalic, fontSize: 12, color: colors.fog, marginBottom: 16 },
    dnaStrip: { gap: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    genreLabel: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.6, color: colors.fog, minWidth: 70 },
    barTrack: { flex: 1, height: 6, backgroundColor: 'rgba(184,137,26,0.15)', borderRadius: 3, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 3 },
    pctLabel: { fontFamily: fonts.sub, fontSize: 10, color: colors.fog, minWidth: 28, textAlign: 'right' },
    helixDecor: { position: 'absolute', bottom: 6, left: 0, right: 0, height: 4, flexDirection: 'row' },
    helixDot: { position: 'absolute', width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.sepia },
});
