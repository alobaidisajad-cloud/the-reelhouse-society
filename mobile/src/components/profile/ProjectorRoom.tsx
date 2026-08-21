import { View, Text, StyleSheet, Share } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import TactileEngine from '@/src/utils/TactileEngine';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '../PressableScale';
import reelToast from '@/src/utils/reelToast';
import { scaledTextProps } from '@/src/constants/textScaling';

interface CinephileStats {
    count: number;
    level: string;
    color: string;
    progress: number;
}

interface ProjectorUser {
    username?: string;
}

const AnimatedView = Animated.createAnimatedComponent(View);

function StatDial({ count, color }: { count: number; color: string }) {
    const size = 140;
    const strokeWidth = 3;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    // Animate based on count: full circle at 100
    const progress = Math.min(count / 100, 1);

    return (
        <View style={[ds.dialWrap, { width: size, height: size }]}>
            <Svg width={size} height={size} style={{ position: 'absolute' }}>
                {/* Background track */}
                <Circle
                    cx={size / 2} cy={size / 2} r={radius}
                    fill="none" stroke="rgba(184,137,26,0.15)" strokeWidth={strokeWidth}
                />
                {/* Progress arc */}
                <Circle
                    cx={size / 2} cy={size / 2} r={radius}
                    fill="none" stroke={color} strokeWidth={strokeWidth}
                    strokeDasharray={`${circumference * progress} ${circumference * (1 - progress)}`}
                    strokeDashoffset={circumference * 0.25}
                    strokeLinecap="round"
                />
            </Svg>
            <Text {...scaledTextProps} style={[ds.dialValue, { color }]}>{count}</Text>
            <Text {...scaledTextProps} style={ds.dialLabel}>LIFETIME LOGS</Text>
        </View>
    );
}

export function ProjectorRoom({ stats, user }: { stats?: CinephileStats; user?: ProjectorUser }) {
    if (!stats) return null;

    const handleCSVExport = async () => {
        TactileEngine.mutate();
        try {
            await Share.share({
                message: `My ReelHouse Archive:\n\n${stats.count} films logged\nRanking: ${stats.level}\n\nThe ReelHouse Society`,
                title: 'ReelHouse Archive Stats',
            });
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            reelToast.error(msg);
        }
    };

    return (
        <View style={s.container}>
            {/* Stats dial */}
            <AnimatedView entering={FadeIn.duration(800)} style={s.dialWrap}>
                <View style={s.dialCard}>
                    <View style={ds.dialCenter}>
                        <StatDial count={stats.count} color={stats.color} />
                    </View>

                    <Text {...scaledTextProps} style={s.rankLabel}>RANKING</Text>
                    <Text {...scaledTextProps} style={[s.rankValue, { color: stats.color }]}>{stats.level}</Text>

                    {/* Progress bar */}
                    <View style={s.progressTrack}>
                        <View style={[s.progressFill, { width: `${stats.progress}%`, backgroundColor: stats.color }]} />
                    </View>
                </View>
            </AnimatedView>

            {/* Certificate of Obsession */}
            {stats.count > 0 && (
                <AnimatedView entering={FadeInDown.delay(200).duration(600)} style={s.certCard}>
                    <Text {...scaledTextProps} style={s.certCornerTL}>✦</Text>
                    <Text {...scaledTextProps} style={s.certCornerBR}>✦</Text>

                    <Text {...scaledTextProps} style={s.certSociety}>REELHOUSE PRESERVATION SOCIETY</Text>
                    <Text {...scaledTextProps} style={s.certTitle}>Certificate of Obsession</Text>
                    <Text {...scaledTextProps} style={s.certBody}>
                        This document certifies that the bearer has witnessed {stats.count} films and contributed to the archival history of The ReelHouse Society.
                    </Text>
                    <View style={[s.certBadge, { borderColor: stats.color }]}>
                        <Text {...scaledTextProps} style={[s.certBadgeText, { color: stats.color }]}>{stats.level}</Text>
                    </View>
                </AnimatedView>
            )}

            {/* CSV Export button */}
            <AnimatedView entering={FadeInDown.delay(400).duration(600)} style={s.exportWrap}>
                <PressableScale style={s.exportBtn} onPress={handleCSVExport} haptic accessibilityRole="button" accessibilityLabel="Share your standing">
                    <Text {...scaledTextProps} style={s.exportText}>SHARE YOUR STANDING</Text>
                </PressableScale>
            </AnimatedView>
        </View>
    );
}

const ds = StyleSheet.create({
    dialWrap: { alignItems: 'center', justifyContent: 'center' },
    dialCenter: { alignItems: 'center', marginBottom: 24 },
    dialValue: { fontFamily: fonts.display, fontSize: 36, lineHeight: 40 },
    dialLabel: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.fog, marginTop: 2 },
});

const s = StyleSheet.create({
    container: { gap: 24 },
    dialWrap: { alignItems: 'center' },
    dialCard: {
        width: '100%', alignItems: 'center', padding: 32,
        backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)', borderRadius: 4,
    },
    rankLabel: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.fog, marginBottom: 8 },
    rankValue: { fontFamily: fonts.display, fontSize: 28, marginBottom: 20 },
    progressTrack: { width: '100%', height: 4, backgroundColor: 'rgba(184,137,26,0.15)', borderRadius: 2, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 2 },

    certCard: {
        padding: 32, alignItems: 'center', backgroundColor: 'rgba(8,6,4,0.98)',
        borderWidth: 2, borderColor: colors.sepia, borderRadius: 4, position: 'relative',
    },
    certCornerTL: { position: 'absolute', top: 10, left: 12, fontFamily: fonts.display, fontSize: 32, color: colors.sepia, opacity: 0.15 },
    certCornerBR: { position: 'absolute', bottom: 10, right: 12, fontFamily: fonts.display, fontSize: 32, color: colors.sepia, opacity: 0.15 },
    certSociety: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.sepia, marginBottom: 12 },
    certTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.parchment, marginBottom: 12 },
    certBody: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, textAlign: 'center', lineHeight: 20, maxWidth: 300, marginBottom: 20 },
    certBadge: { borderWidth: 1, paddingHorizontal: 24, paddingVertical: 8, transform: [{ rotate: '-5deg' }] },
    certBadgeText: { fontFamily: fonts.sub, fontSize: 16, letterSpacing: 2 },

    exportWrap: { alignItems: 'center', marginTop: 16 },
    exportBtn: {
        paddingVertical: 14, paddingHorizontal: 32, borderWidth: 1,
        borderColor: 'rgba(184,137,26,0.3)', borderRadius: 4, backgroundColor: 'rgba(10,7,3,0.5)',
    },
    exportText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.fog },
});
