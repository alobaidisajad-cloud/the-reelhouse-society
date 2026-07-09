import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import React, { useMemo, memo } from 'react';
import Svg, { Circle, Text as SvgText, Line } from 'react-native-svg';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, fonts } from '@/src/theme/theme';

interface PassportLog {
    filmId?: number;
    year?: number | string;
    rating: number;
    physicalMedia?: string | null;
    status?: string;
}

export interface ProfileAnalyticsPayload {
    stamps?: {
        total_logs: number;
        pre_1960_count: number;
        perfect_ratings_count: number;
        has_physical_media: boolean;
        has_abandoned: boolean;
        decades_logged_count: number;
        has_rewatched: boolean;
    };
    dna?: any;
    autopsy_math?: any;
}


const PASSPORT_STAMPS = [
    { id: 'archivist', label: 'THE ARCHIVIST', sub: '100 FILMS LOGGED', glyph: '◈', test: (logs: PassportLog[]) => logs.length >= 100 },
    { id: 'devotee', label: 'THE DEVOTEE', sub: '500 FILMS LOGGED', glyph: '✦', test: (logs: PassportLog[]) => logs.length >= 500 },
    { id: 'silver_screen', label: 'SILVER SCREEN', sub: '20 FILMS PRE-1960', glyph: '†', test: (logs: PassportLog[]) => {
        let count = 0;
        for (const l of logs) {
            if (!l.year) continue;
            const y = parseInt(String(l.year), 10);
            if (!isNaN(y) && y < 1960) {
                if (++count >= 20) return true;
            }
        }
        return false;
    } },
    { id: 'masterpiece', label: 'MASTERPIECE HUNTER', sub: '10 PERFECT RATINGS', glyph: '★', test: (logs: PassportLog[]) => {
        let count = 0;
        for (const l of logs) {
            if (l.rating === 5) {
                if (++count >= 10) return true;
            }
        }
        return false;
    } },
    { id: 'vault_keeper', label: 'VAULT KEEPER', sub: 'PHYSICAL MEDIA LOGGED', glyph: '▣', test: (logs: PassportLog[]) => {
        for (const l of logs) {
            if (l.physicalMedia) return true;
        }
        return false;
    } },
    { id: 'honest_critic', label: 'HONEST CRITIC', sub: 'ABANDONED A FILM', glyph: '✕', test: (logs: PassportLog[]) => {
        for (const l of logs) {
            if (l.status === 'abandoned') return true;
        }
        return false;
    } },
    { id: 'completionist', label: 'THE COMPLETIONIST', sub: 'FILMS FROM 7 DECADES', glyph: '∞', test: (logs: PassportLog[]) => {
        const decades = new Set<number>();
        for (const l of logs) {
            if (!l.year) continue;
            const y = parseInt(String(l.year), 10);
            if (!isNaN(y) && y >= 1880) {
                decades.add(Math.floor(y / 10) * 10);
                if (decades.size >= 7) return true;
            }
        }
        return false;
    } },
    { id: 'half_life', label: 'THE RETURNER', sub: 'REWATCHED A FILM', glyph: '↻', test: (logs: PassportLog[]) => { 
        const seen = new Set<number>(); 
        for (const l of logs) {
            if (!l.filmId) continue;
            if (seen.has(l.filmId)) return true;
            seen.add(l.filmId);
        }
        return false;
    } },
];

const PassportStamp = memo(function PassportStamp({ stamp, earned, index, size }: { stamp: { id: string; label: string; sub: string; glyph: string }; earned: boolean; index: number; size: number }) {
    const rotations = [-4, 3, -2, 5, -3, 2, -5, 4];
    const rotation = rotations[index % 8];
    const center = size / 2;
    const outerR = center * 0.93;
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
                {/* Label line 1 */}
                <SvgText
                    x={center} y={center * 0.63}
                    textAnchor="middle"
                    fontFamily={fonts.sub} fontSize={size * 0.058}
                    letterSpacing={1.5} fill={colors.sepia} opacity={0.85}
                >
                    {stamp.label.length > 14 ? stamp.label.slice(0, 14) : stamp.label}
                </SvgText>
                {/* Label line 2 (if needed) */}
                {stamp.label.length > 14 && (
                    <SvgText
                        x={center} y={center * 0.78}
                        textAnchor="middle"
                        fontFamily={fonts.sub} fontSize={size * 0.058}
                        letterSpacing={1.5} fill={colors.sepia} opacity={0.85}
                    >
                        {stamp.label.slice(14).trim()}
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

export const NoirPassport = memo(function NoirPassport({ logs, analytics }: { logs?: PassportLog[], analytics?: ProfileAnalyticsPayload | null }) {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const safeLogs = logs ?? [];

    const earned = useMemo(() => {
        if (analytics?.stamps) {
            const s = analytics.stamps;
            return PASSPORT_STAMPS.map(stamp => {
                let isEarned = false;
                switch (stamp.id) {
                    case 'archivist': isEarned = s.total_logs >= 100; break;
                    case 'devotee': isEarned = s.total_logs >= 500; break;
                    case 'silver_screen': isEarned = s.pre_1960_count >= 20; break;
                    case 'masterpiece': isEarned = s.perfect_ratings_count >= 10; break;
                    case 'vault_keeper': isEarned = s.has_physical_media; break;
                    case 'honest_critic': isEarned = s.has_abandoned; break;
                    case 'completionist': isEarned = s.decades_logged_count >= 7; break;
                    case 'half_life': isEarned = s.has_rewatched; break;
                }
                return { ...stamp, earned: isEarned };
            });
        }
        return PASSPORT_STAMPS.map(s => ({ ...s, earned: s.test(safeLogs) }));
    }, [safeLogs, analytics]);

    const earnedCount = earned.filter(s => s.earned).length;

    const { width } = useWindowDimensions();
    const stampSize = (width - 64) / 2.5;

    return (
        <Animated.View entering={FadeIn.duration(600)} style={s.container}>
            <View style={s.passport}>
                {/* Corner brackets */}
                {(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const).map(corner => (
                    <View key={corner} style={[s.cornerBracket, s[corner]]} />
                ))}

                {/* Header */}
                <View style={s.header}>
                    <Text style={s.societyLabel}>THE REELHOUSE SOCIETY</Text>
                    <Text style={s.title}>Cinematic Passport</Text>
                    <Text style={s.counter}>{earnedCount} of {PASSPORT_STAMPS.length} STAMPS EARNED</Text>
                </View>

                {/* Stamps grid */}
                <View style={s.stampsGrid}>
                    {earned.map((stamp, i) => (
                        <PassportStamp key={stamp.id} stamp={stamp} earned={stamp.earned} index={i} size={stampSize} />
                    ))}
                </View>

                {/* Footer */}
                <View style={s.footer}>
                    <Text style={s.footerText}>STAMPS ARE ISSUED BY THE SOCIETY ARCHIVIST · NOT TRANSFERABLE · REELHOUSE ARCHIVE DEPT</Text>
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
    societyLabel: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 4, color: colors.sepia, marginBottom: 8, opacity: 0.8 },
    title: { fontFamily: fonts.display, fontSize: 28, color: colors.parchment, lineHeight: 32, marginBottom: 10 },
    counter: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 3, color: colors.fog },
    // Stamps
    stampsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingVertical: 8 },
    stampWrap: { alignItems: 'center', justifyContent: 'center' },
    // Footer
    footer: { alignItems: 'center', marginTop: 24, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(184,137,26,0.2)' },
    footerText: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 3, color: colors.fog, opacity: 0.5, textAlign: 'center' },
});
