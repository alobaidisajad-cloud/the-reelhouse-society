/**
 * RatingLegend — Visual legend for the ReelHouse rating scale.
 */
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, fonts } from '@/src/theme/theme';

const RATINGS = [
    { reels: 1, label: 'Abysmal', desc: 'A cinematic affront.' },
    { reels: 2, label: 'Below Average', desc: 'Has moments, but mostly fails.' },
    { reels: 3, label: 'Decent', desc: 'Competent work. Nothing transcendent.' },
    { reels: 4, label: 'Excellent', desc: 'Essential viewing. Near-masterwork.' },
    { reels: 5, label: 'Masterpiece', desc: 'Permanent addition to the canon.' },
];

export function RatingLegend() {
    return (
        <Animated.View entering={FadeIn.duration(400)} style={s.container}>
            <Text style={s.title}>THE REEL SCALE</Text>
            {RATINGS.map((r, i) => (
                <View key={r.reels} style={s.row}>
                    <View style={s.reelsWrap}>
                        {Array.from({ length: 5 }).map((_, j) => (
                            <Text key={j} style={[s.reel, j < r.reels ? s.reelFilled : s.reelEmpty]}>◉</Text>
                        ))}
                    </View>
                    <View style={s.labelWrap}>
                        <Text style={s.label}>{r.label}</Text>
                        <Text style={s.desc}>{r.desc}</Text>
                    </View>
                </View>
            ))}
        </Animated.View>
    );
}

const s = StyleSheet.create({
    container: { padding: 20, backgroundColor: colors.soot, borderWidth: 1, borderColor: colors.ash, borderRadius: 4 },
    title: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.sepia, marginBottom: 16, textAlign: 'center' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    reelsWrap: { flexDirection: 'row', gap: 2, minWidth: 70 },
    reel: { fontSize: 12 },
    reelFilled: { color: colors.sepia },
    reelEmpty: { color: colors.ash },
    labelWrap: { flex: 1 },
    label: { fontFamily: fonts.sub, fontSize: 13, color: colors.parchment, marginBottom: 2 },
    desc: { fontFamily: fonts.body, fontSize: 11, color: colors.fog, fontStyle: 'italic' },
});
