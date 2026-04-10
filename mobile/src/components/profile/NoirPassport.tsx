import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useMemo } from 'react';
import Svg, { Circle, Text as SvgText, Line } from 'react-native-svg';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, fonts } from '@/src/theme/theme';

const { width: SCREEN_W } = Dimensions.get('window');
const STAMP_SIZE = (SCREEN_W - 64) / 2.5; // fit ~2.5 stamps per row

const PASSPORT_STAMPS = [
    { id: 'archivist', label: 'THE ARCHIVIST', sub: '100 FILMS LOGGED', glyph: '◈', test: (logs: any[]) => logs.length >= 100 },
    { id: 'devotee', label: 'THE DEVOTEE', sub: '500 FILMS LOGGED', glyph: '✦', test: (logs: any[]) => logs.length >= 500 },
    { id: 'silver_screen', label: 'SILVER SCREEN', sub: '20 FILMS PRE-1960', glyph: '†', test: (logs: any[]) => logs.filter((l: any) => l.year && parseInt(l.year) < 1960).length >= 20 },
    { id: 'masterpiece', label: 'MASTERPIECE HUNTER', sub: '10 PERFECT RATINGS', glyph: '★', test: (logs: any[]) => logs.filter((l: any) => l.rating === 5).length >= 10 },
    { id: 'vault_keeper', label: 'VAULT KEEPER', sub: 'PHYSICAL MEDIA LOGGED', glyph: '▣', test: (logs: any[]) => logs.some((l: any) => l.physicalMedia) },
    { id: 'honest_critic', label: 'HONEST CRITIC', sub: 'ABANDONED A FILM', glyph: '✕', test: (logs: any[]) => logs.some((l: any) => l.status === 'abandoned') },
    { id: 'completionist', label: 'THE COMPLETIONIST', sub: 'FILMS FROM 7 DECADES', glyph: '∞', test: (logs: any[]) => new Set(logs.filter((l: any) => l.year).map((l: any) => Math.floor(parseInt(l.year) / 10) * 10)).size >= 7 },
    { id: 'half_life', label: 'THE RETURNER', sub: 'REWATCHED A FILM', glyph: '↻', test: (logs: any[]) => { const seen = new Set(); return logs.some((l: any) => { if (seen.has(l.filmId)) return true; seen.add(l.filmId); return false; }); } },
];

function PassportStamp({ stamp, earned, index }: { stamp: { id: string; label: string; sub: string; glyph: string }; earned: boolean; index: number }) {
    const rotations = [-4, 3, -2, 5, -3, 2, -5, 4];
    const rotation = rotations[index % 8];
    const size = STAMP_SIZE;
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
                    fontFamily={fonts.ui} fontSize={size * 0.058}
                    letterSpacing={1.5} fill={colors.sepia} opacity={0.85}
                >
                    {stamp.label.length > 14 ? stamp.label.slice(0, 14) : stamp.label}
                </SvgText>
                {/* Label line 2 (if needed) */}
                {stamp.label.length > 14 && (
                    <SvgText
                        x={center} y={center * 0.78}
                        textAnchor="middle"
                        fontFamily={fonts.ui} fontSize={size * 0.058}
                        letterSpacing={1.5} fill={colors.sepia} opacity={0.85}
                    >
                        {stamp.label.slice(14).trim()}
                    </SvgText>
                )}
                {/* Sub label */}
                <SvgText
                    x={center} y={center * 1.37}
                    textAnchor="middle"
                    fontFamily={fonts.ui} fontSize={size * 0.05}
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
}

export function NoirPassport({ logs }: { logs?: any[] }) {
    const safeLogs = logs || [];

    const earned = useMemo(() =>
        PASSPORT_STAMPS.map(s => ({ ...s, earned: s.test(safeLogs) })),
        [safeLogs]);

    const earnedCount = earned.filter(s => s.earned).length;

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
                        <PassportStamp key={stamp.id} stamp={stamp} earned={stamp.earned} index={i} />
                    ))}
                </View>

                {/* Footer */}
                <View style={s.footer}>
                    <Text style={s.footerText}>STAMPS ARE ISSUED BY THE SOCIETY ARCHIVIST · NOT TRANSFERABLE · REELHOUSE ARCHIVE DEPT</Text>
                </View>
            </View>
        </Animated.View>
    );
}

const s = StyleSheet.create({
    container: { paddingVertical: 16, paddingHorizontal: 16 },
    passport: {
        borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)', borderRadius: 4,
        padding: 24, position: 'relative', overflow: 'hidden',
    },
    // Corner brackets
    cornerBracket: { position: 'absolute', width: 16, height: 16 },
    topLeft: { top: 12, left: 12, borderTopWidth: 1, borderLeftWidth: 1, borderTopColor: 'rgba(139,105,20,0.4)', borderLeftColor: 'rgba(139,105,20,0.4)' },
    topRight: { top: 12, right: 12, borderTopWidth: 1, borderRightWidth: 1, borderTopColor: 'rgba(139,105,20,0.4)', borderRightColor: 'rgba(139,105,20,0.4)' },
    bottomLeft: { bottom: 12, left: 12, borderBottomWidth: 1, borderLeftWidth: 1, borderBottomColor: 'rgba(139,105,20,0.4)', borderLeftColor: 'rgba(139,105,20,0.4)' },
    bottomRight: { bottom: 12, right: 12, borderBottomWidth: 1, borderRightWidth: 1, borderBottomColor: 'rgba(139,105,20,0.4)', borderRightColor: 'rgba(139,105,20,0.4)' },
    // Header
    header: { alignItems: 'center', marginBottom: 24, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(139,105,20,0.2)', paddingBottom: 20 },
    societyLabel: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 4, color: colors.sepia, marginBottom: 8, opacity: 0.7 },
    title: { fontFamily: fonts.display, fontSize: 28, color: colors.parchment, lineHeight: 32, marginBottom: 10 },
    counter: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 3, color: colors.fog },
    // Stamps
    stampsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingVertical: 8 },
    stampWrap: { alignItems: 'center', justifyContent: 'center' },
    // Footer
    footer: { alignItems: 'center', marginTop: 24, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(139,105,20,0.2)' },
    footerText: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 3, color: colors.fog, opacity: 0.4, textAlign: 'center' },
});
