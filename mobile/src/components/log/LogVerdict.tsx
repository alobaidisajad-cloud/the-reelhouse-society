import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, ReduceMotion } from 'react-native-reanimated';

import { colors, fonts } from '@/src/theme/theme';
import { displayTextProps, scaledTextProps } from '@/src/constants/textScaling';
import { RATING_LABELS } from '@/src/hooks/useLogFlow';

interface Props {
    status: 'watched' | 'rewatched' | 'abandoned';
    rating: number;
}

/**
 * THE VERDICT — the house names your judgment back to you.
 *
 * Rating a film used to be answered in 8.5pt grey at the edge of the screen,
 * with the score printed a second time in the header above. It is the emotional
 * peak of the whole page, so it is now the largest thing on it.
 *
 * ── THE SLOT NEVER CHANGES HEIGHT ───────────────────────────────────────────
 * Three states share one fixed box, so nothing shifts under a member's finger
 * at the moment they touch a reel:
 *
 *   unrated    "awaiting your verdict"   + the half-reel hint
 *   rated      Masterpiece               + 4.5 / 5
 *   abandoned  Abandoned                 + nothing
 *
 * The hint lives here and ONLY while unrated — it used to sit permanently in
 * the corner, instructing forever a gesture you learn once. Now it appears at
 * exactly the moment you are about to rate, and never again after.
 *
 * ── WHY "ABANDONED" AND NOT THE REASON ──────────────────────────────────────
 * Walking out is a verdict too. The reason is not the word, because
 * "Life Got in the Way" is 19 characters — 385pt of Rye against 320pt of
 * screen — and would overflow on every phone. It stays a chip below.
 *
 * A rating is NOT required (a critique alone can seal a record), so the empty
 * state is an invitation in lower case, never a demand.
 */
export default React.memo(function LogVerdict({ status, rating }: Props) {
    const abandoned = status === 'abandoned';
    const word = abandoned ? 'Abandoned' : (rating > 0 ? RATING_LABELS[rating] : '');

    // The house's own signature: ignite. The same gesture as the Society's mark
    // at the door and the seal at the end — transform and opacity only, so it
    // is GPU-composited and costs no layout.
    const lit = useSharedValue(0);
    React.useEffect(() => {
        lit.value = 0;
        lit.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System });
    }, [word, lit]);

    const litStyle = useAnimatedStyle(() => ({
        opacity: lit.value,
        transform: [{ scale: 0.94 + lit.value * 0.06 }],
    }));

    return (
        <View style={s.slot}>
            {word ? (
                <Animated.View style={litStyle}>
                    <Text
                        style={[s.word, abandoned && s.wordAbandoned]}
                        {...displayTextProps}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                    >
                        {word}
                    </Text>
                </Animated.View>
            ) : (
                <Text style={s.waiting} {...scaledTextProps}>awaiting your verdict</Text>
            )}

            {abandoned ? (
                <View style={s.subSpacer} />
            ) : rating > 0 ? (
                <Text style={s.value} {...scaledTextProps}>
                    {rating % 1 === 0 ? rating : rating.toFixed(1)} / 5
                </Text>
            ) : (
                <Text style={s.hint} {...scaledTextProps}>TAP LEFT HALF FOR ½ REELS</Text>
            )}
        </View>
    );
});

const s = StyleSheet.create({
    // Fixed: the three states must occupy the same box or the reels move as you
    // touch them.
    slot: { minHeight: 98, alignItems: 'center', justifyContent: 'center', paddingTop: 18, paddingBottom: 4 },
    // 28pt in the house display face. Every possible word was measured at the
    // 1.2 cap on a 360dp screen — the longest, "Masterpiece" and "Unwatchable"
    // at 11 characters, needs 267pt of 320. Shrink-to-fit is the backstop.
    word: {
        fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: colors.flicker,
        textAlign: 'center', includeFontPadding: false,
        textShadowColor: 'rgba(240,232,176,0.22)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 20,
    },
    // Crimson here is SEMANTIC — loss, not rank. The provenance colours label
    // where a capability comes from; a verdict is not a capability.
    wordAbandoned: { color: colors.crimson, textShadowColor: 'rgba(180,45,45,0.25)' },
    waiting: { fontFamily: fonts.bodyItalic, fontSize: 14, color: colors.fog, opacity: 0.75, includeFontPadding: false },
    value: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.bone, marginTop: 9, includeFontPadding: false },
    hint: { fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 2, color: colors.fog, opacity: 0.85, marginTop: 9, includeFontPadding: false },
    subSpacer: { height: 20 },
});
