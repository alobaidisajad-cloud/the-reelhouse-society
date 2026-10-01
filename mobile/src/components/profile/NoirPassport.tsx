import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Text } from '@/src/components/text';
import React, { useMemo, memo } from 'react';
import Svg, { Circle, Text as SvgText, Line } from 'react-native-svg';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, fonts } from '@/src/theme/theme';
import { scaledTextProps } from '@/src/constants/textScaling';
import { RoomRetrieving, RoomUnreachable } from './RoomParts';

/** get_public_profile_analytics: the member's record over the WHOLE history. */
export interface ProfileAnalyticsPayload {
    stamps?: {
        total_logs: number;
        pre_1960_count: number;
        perfect_ratings_count: number;
        has_physical_media: boolean | null;
        has_abandoned: boolean | null;
        decades_logged_count: number;
        has_rewatched: boolean;
        /** From 20261002_01: absent until it is applied. */
        reviews_count?: number;
        genres_count?: number;
        busiest_day_count?: number;
        unrated_count?: number;
    };
    dna?: any;
    autopsy_math?: any;
    /** Present instead of the record when the viewer may not read it. */
    error?: string;
}

type Stamps = NonNullable<ProfileAnalyticsPayload['stamps']>;

/** A stamp's label in up to two lines of 14, broken between words, never inside one. */
export function stampLines(label: string, width = 14): [string, string] {
    if (label.length <= width) return [label, ''];
    const cut = label.lastIndexOf(' ', width);
    return cut > 0 ? [label.slice(0, cut), label.slice(cut + 1)] : [label, ''];
}


/** Each stamp, earned from the member's whole record (the server's count). */
const PASSPORT_STAMPS: { id: string; label: string; sub: string; glyph: string; earned: (s: Stamps) => boolean }[] = [
    { id: 'archivist', label: 'THE ARCHIVIST', sub: '100 FILMS LOGGED', glyph: '◈', earned: (s) => s.total_logs >= 100 },
    { id: 'devotee', label: 'THE DEVOTEE', sub: '500 FILMS LOGGED', glyph: '✦', earned: (s) => s.total_logs >= 500 },
    { id: 'silver_screen', label: 'SILVER SCREEN', sub: '20 FILMS PRE-1960', glyph: '†', earned: (s) => s.pre_1960_count >= 20 },
    { id: 'masterpiece', label: 'MASTERPIECE HUNTER', sub: '10 PERFECT RATINGS', glyph: '★', earned: (s) => s.perfect_ratings_count >= 10 },
    { id: 'vault_keeper', label: 'THE COLLECTOR', sub: 'PHYSICAL MEDIA LOGGED', glyph: '▣', earned: (s) => !!s.has_physical_media },
    { id: 'honest_critic', label: 'HONEST CRITIC', sub: 'ABANDONED A FILM', glyph: '✕', earned: (s) => !!s.has_abandoned },
    { id: 'completionist', label: 'THE COMPLETIONIST', sub: 'FILMS FROM 7 DECADES', glyph: '∞', earned: (s) => s.decades_logged_count >= 7 },
    { id: 'half_life', label: 'THE RETURNER', sub: 'REWATCHED A FILM', glyph: '↻', earned: (s) => !!s.has_rewatched },
];

const PassportStamp = memo(function PassportStamp({ stamp, earned, index, size }: { stamp: { id: string; label: string; sub: string; glyph: string }; earned: boolean; index: number; size: number }) {
    const rotations = [-4, 3, -2, 5, -3, 2, -5, 4];
    const rotation = rotations[index % 8];
    const center = size / 2;
    const outerR = center * 0.93;
    const [line1, line2] = stampLines(stamp.label);
    const innerR = center * 0.8;

    return (
        <Animated.View
            entering={FadeIn.delay(index * 80).duration(400)}
            style={[
                s.stampWrap,
                {
                    width: size, height: size,
                    opacity: earned ? 1 : 0.18,
                    transform: [{ rotate: `${rotation}deg` }],
                },
            ]}
        >
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Circle
                    cx={center} cy={center} r={outerR}
                    fill="none" stroke={colors.sepia} strokeWidth={2}
                    strokeDasharray={`${size * 0.07} ${size * 0.025} ${size * 0.125} ${size * 0.017} ${size * 0.05} ${size * 0.033} ${size * 0.167} ${size * 0.017}`}
                    opacity={0.9}
                />
                <Circle
                    cx={center} cy={center} r={innerR}
                    fill="none" stroke={colors.sepia} strokeWidth={0.8}
                    opacity={0.5}
                />
                {/* Glyph */}
                <SvgText
                    x={center} y={center * 0.97}
                    textAnchor="middle" alignmentBaseline="central"
                    fontFamily={fonts.display} fontSize={size * 0.2}
                    fill={colors.sepia} opacity={0.95}
                >
                    {stamp.glyph}
                </SvgText>
                {/* The label's first line */}
                <SvgText
                    x={center} y={center * 0.63}
                    textAnchor="middle"
                    fontFamily={fonts.sub} fontSize={size * 0.058}
                    letterSpacing={1.5} fill={colors.sepia} opacity={0.85}
                >
                    {line1}
                </SvgText>
                {/* Its second, when it needs one */}
                {!!line2 && (
                    <SvgText
                        x={center} y={center * 0.78}
                        textAnchor="middle"
                        fontFamily={fonts.sub} fontSize={size * 0.058}
                        letterSpacing={1.5} fill={colors.sepia} opacity={0.85}
                    >
                        {line2}
                    </SvgText>
                )}
                {/* Sub label */}
                <SvgText
                    x={center} y={center * 1.37}
                    textAnchor="middle"
                    fontFamily={fonts.sub} fontSize={size * 0.05}
                    letterSpacing={1} fill={colors.sepia} opacity={0.6}
                >
                    {stamp.sub}
                </SvgText>
                {/* Decorative lines */}
                <Line x1={center * 0.33} y1={center * 0.92} x2={center * 0.47} y2={center * 0.97} stroke={colors.sepia} strokeWidth={0.8} opacity={0.2} />
                <Line x1={center * 1.53} y1={center * 1.05} x2={center * 1.67} y2={center} stroke={colors.sepia} strokeWidth={0.8} opacity={0.15} />
            </Svg>
        </Animated.View>
    );
});

/**
 * The passport, stamped from the member's whole record. Until that record has
 * been read it says so (and, if it could not be, offers to ask again): stamps
 * are never guessed from the logs that happened to load.
 */
export const NoirPassport = memo(function NoirPassport({ analytics, failed, onRetry }: {
    analytics?: ProfileAnalyticsPayload | null;
    /** The record's read failed. */
    failed?: boolean;
    onRetry?: () => void;
}) {
    const stamps = analytics?.stamps;
    const earned = useMemo(
        () => (stamps ? PASSPORT_STAMPS.map((stamp) => ({ ...stamp, earned: stamp.earned(stamps) })) : []),
        [stamps],
    );

    const earnedCount = earned.filter(s => s.earned).length;

    const { width } = useWindowDimensions();
    const stampSize = (width - 64) / 2.5;

    if (!stamps) {
        return (
            <View style={s.container}>
                {failed || analytics
                    ? <RoomUnreachable room="the passport" onRetry={onRetry ?? (() => {})} />
                    : <RoomRetrieving room="the passport" />}
            </View>
        );
    }

    return (
        <Animated.View entering={FadeIn.duration(600)} style={s.container}>
            <View style={s.passport}>
                {/* Corner brackets */}
                {(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const).map(corner => (
                    <View key={corner} style={[s.cornerBracket, s[corner]]} />
                ))}

                {/* Header */}
                <View style={s.header}>
                    <Text {...scaledTextProps} style={s.societyLabel}>THE REELHOUSE SOCIETY</Text>
                    <Text {...scaledTextProps} style={s.title}>Cinematic Passport</Text>
                    <Text {...scaledTextProps} style={s.counter}>{earnedCount} of {PASSPORT_STAMPS.length} STAMPS EARNED</Text>
                </View>

                {/* Stamps grid */}
                <View style={s.stampsGrid}>
                    {earned.map((stamp, i) => (
                        <PassportStamp key={stamp.id} stamp={stamp} earned={stamp.earned} index={i} size={stampSize} />
                    ))}
                </View>

                {/* Footer */}
                <View style={s.footer}>
                    <Text {...scaledTextProps} style={s.footerText}>STAMPS ARE ISSUED BY THE SOCIETY ARCHIVIST · NOT TRANSFERABLE · REELHOUSE ARCHIVE DEPT</Text>
                </View>
            </View>
        </Animated.View>
    );
});

const s = StyleSheet.create({
    container: { paddingVertical: 16, paddingHorizontal: 16 },
    passport: {
        borderWidth: 1, borderColor: 'rgba(184,137,26,0.3)', borderRadius: 4,
        padding: 24, position: 'relative', overflow: 'hidden',
    },
    // Corner brackets
    cornerBracket: { position: 'absolute', width: 16, height: 16 },
    topLeft: { top: 12, left: 12, borderTopWidth: 1, borderLeftWidth: 1, borderTopColor: 'rgba(184,137,26,0.4)', borderLeftColor: 'rgba(184,137,26,0.4)' },
    topRight: { top: 12, right: 12, borderTopWidth: 1, borderRightWidth: 1, borderTopColor: 'rgba(184,137,26,0.4)', borderRightColor: 'rgba(184,137,26,0.4)' },
    bottomLeft: { bottom: 12, left: 12, borderBottomWidth: 1, borderLeftWidth: 1, borderBottomColor: 'rgba(184,137,26,0.4)', borderLeftColor: 'rgba(184,137,26,0.4)' },
    bottomRight: { bottom: 12, right: 12, borderBottomWidth: 1, borderRightWidth: 1, borderBottomColor: 'rgba(184,137,26,0.4)', borderRightColor: 'rgba(184,137,26,0.4)' },
    // Header
    header: { alignItems: 'center', marginBottom: 24, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(184,137,26,0.2)', paddingBottom: 20 },
    societyLabel: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 4, color: colors.sepia, marginBottom: 8 },
    title: { fontFamily: fonts.display, fontSize: 28, color: colors.parchment, lineHeight: 32, marginBottom: 10 },
    counter: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 3, color: colors.fog },
    // Stamps
    stampsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingVertical: 8 },
    stampWrap: { alignItems: 'center', justifyContent: 'center' },
    // Footer
    footer: { alignItems: 'center', marginTop: 24, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(184,137,26,0.2)' },
    footerText: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 3, color: colors.fogQuiet, textAlign: 'center' },
});
