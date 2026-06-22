/**
 * WeeklyChallenge — Weekly film challenge component.
 */
 
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import TactileEngine from '@/src/utils/TactileEngine';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';

const CHALLENGES = [
    { title: 'THE FIRST TIMER', desc: 'Watch a film from a country you\'ve never explored.', glyph: '🌍' },
    { title: 'THE DEEP CUT', desc: 'Log a film with fewer than 1,000 votes on TMDB.', glyph: '💎' },
    { title: 'THE CLASSIC', desc: 'Watch and log a film released before 1970.', glyph: '📽' },
    { title: 'THE MARATHON', desc: 'Watch 3 films directed by the same person.', glyph: '🎬' },
    { title: 'THE CRITIC', desc: 'Write a review of 100+ words for any film.', glyph: '✍️' },
    { title: 'THE REVISIONIST', desc: 'Rewatch a film you rated below 3 reels.', glyph: '↻' },
];

export function WeeklyChallenge() {
    const router = useRouter();
    // Pick challenge based on week number
    const weekNum = Math.floor((Date.now() / (7 * 24 * 60 * 60 * 1000)));
    const challenge = CHALLENGES[weekNum % CHALLENGES.length];

    return (
        <Animated.View entering={FadeIn.duration(500)} style={s.container}>
            <View style={s.header}>
                <Text style={s.eyebrow}>✦ WEEKLY CHALLENGE</Text>
                <Text style={s.weekNum}>WEEK {weekNum % 52 + 1}</Text>
            </View>

            <Text style={s.glyph}>{challenge.glyph}</Text>
            <Text style={s.title}>{challenge.title}</Text>
            <Text style={s.desc}>{challenge.desc}</Text>

            <PressableScale
                style={s.acceptBtn}
                onPress={() => { TactileEngine.navigate(); (router.push as any)('/(tabs)/darkroom' as any); }}
                pressedScale={0.95}
            >
                <Text style={s.acceptText}>ACCEPT CHALLENGE</Text>
            </PressableScale>
        </Animated.View>
    );
}

const s = StyleSheet.create({
    container: {
        padding: 24, backgroundColor: colors.soot,
        borderWidth: 1, borderColor: colors.sepia, borderRadius: 4,
        alignItems: 'center',
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 16 },
    eyebrow: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.sepia },
    weekNum: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.fog },
    glyph: { fontSize: 40, marginBottom: 12 },
    title: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, marginBottom: 8, textAlign: 'center' },
    desc: { fontFamily: fonts.body, fontSize: 13, color: colors.fog, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
    acceptBtn: { borderWidth: 1, borderColor: colors.sepia, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 4 },
    acceptText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 2, color: colors.sepia },
});
