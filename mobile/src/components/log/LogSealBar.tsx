import React from 'react';
import { Text, StyleSheet, Image } from 'react-native';
import Animated, { useAnimatedStyle, useAnimatedKeyboard } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import TactileEngine from '@/src/utils/TactileEngine';
import { scaledTextProps } from '@/src/constants/textScaling';
import { validateLogSubmission } from '@/src/hooks/useLogFlow';
import { buildFilingMark } from '@/src/components/log/logRecord';

const MARK = require('../../../assets/images/reelhouse-logo.png');

/** Height of the bar itself, so the scroll can end above it. */
export const SEAL_BAR_HEIGHT = 104;

interface Props {
    status: 'watched' | 'rewatched' | 'abandoned';
    rating: number;
    review: string;
    abandonedReason: string;
    date: string;
    watchedWith: string;
    physicalMedia: string;
    submitting: boolean;
    sealed: boolean;
    isEditing: boolean;
    onSeal: () => void;
}

/**
 * THE SEAL — docked, and honest.
 *
 * The act this whole page exists for used to be a button at the end of a very
 * long scroll. It is fixed to the foot of the sheet now: the wax is on the desk
 * from the moment you sit down.
 *
 * ── IT NEVER FAILS ──────────────────────────────────────────────────────────
 * Sealability comes from `validateLogSubmission` — the SAME function the save
 * path calls — so the bar can never disagree with what actually happens. Until
 * a record is worth sealing the press is dim and the line above states what is
 * wanted; there is no error to throw. (The toast remains as a backstop, since
 * the press is still live: a dim control that cannot be pressed is its own
 * confusion.)
 *
 * ── THE LINE IS THE RECORD'S OWN MARK ───────────────────────────────────────
 * Once sealable it shows `buildFilingMark` — the very function that draws the
 * filing mark on the finished record. Not a summary resembling it: the same
 * code. You cannot see one thing here and get another there.
 *
 * ── IT GETS OUT OF THE WAY WHILE YOU WRITE ──────────────────────────────────
 * Driven by `useAnimatedKeyboard`, not keyboard events, because the scroll uses
 * `keyboardDismissMode="interactive"` — dragging dismisses the keyboard
 * CONTINUOUSLY, and a bar driven by events would sit still and then jump. This
 * one rides the drag, on the UI thread.
 */
export default React.memo(function LogSealBar({
    status, rating, review, abandonedReason, date, watchedWith, physicalMedia,
    submitting, sealed, isEditing, onSeal,
}: Props) {
    const insets = useSafeAreaInsets();
    const keyboard = useAnimatedKeyboard();

    const blockReason = validateLogSubmission(status, rating, review, abandonedReason);
    const ready = blockReason === null;

    // Writing deserves the whole sheet. The bar returns the moment you look up.
    const barStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: keyboard.height.value > 0 ? SEAL_BAR_HEIGHT + insets.bottom : 0 }],
        opacity: keyboard.height.value > 0 ? 0 : 1,
    }));

    const mark = buildFilingMark({
        watched_date: date,
        watched_with: watchedWith,
        physical_media: physicalMedia,
    });

    const line = ready
        ? mark.map(e => e.value).join('  ·  ')
        : status === 'abandoned'
            ? 'WHY DID YOU STOP?'
            : 'A VERDICT, OR A FEW WORDS';

    const label = sealed
        ? '✦ RECORD SEALED'
        : submitting
            ? 'SEALING RECORD…'
            : isEditing ? 'RESEAL THE RECORD' : 'SEAL THE RECORD';

    return (
        <Animated.View style={[s.bar, { paddingBottom: insets.bottom + 14 }, barStyle]}>
            <Text style={s.line} numberOfLines={1} {...scaledTextProps}>
                {ready ? 'FILED · ' : ''}{line}
            </Text>
            <PressableScale
                testID="submit-log-button"
                style={[s.press, !ready && s.pressDim, sealed && s.pressSealed]}
                onPress={() => { TactileEngine.mutate(); onSeal(); }}
                disabled={submitting}
                hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
                pressedScale={0.97}
                accessibilityRole="button"
                // The reason travels in the LABEL: `accessibilityLiveRegion` is
                // Android-only, so announcing the dim state is not portable, and a
                // button that reads "Seal the record" while doing nothing is a
                // dead end for anyone who cannot see that it is dim.
                accessibilityLabel={ready ? label : `${label}. ${blockReason}`}
                accessibilityState={{ disabled: submitting }}
            >
                <Image source={MARK} style={s.mark} resizeMode="contain" />
                <Text style={s.pressText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{label}</Text>
            </PressableScale>
        </Animated.View>
    );
});

const s = StyleSheet.create({
    bar: {
        position: 'absolute', left: 0, right: 0, bottom: 0,
        backgroundColor: colors.soot,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.sepiaBorder,
        paddingHorizontal: 20, paddingTop: 12,
    },
    line: {
        fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 2.4, color: colors.fog,
        textAlign: 'center', marginBottom: 11, includeFontPadding: false,
    },
    press: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
        backgroundColor: colors.sepia, borderRadius: 4, paddingVertical: 15,
    },
    // Dim, not disabled — the line above says what is wanted, and the press
    // still answers so nobody is left tapping a control that ignores them.
    pressDim: { opacity: 0.38 },
    pressSealed: { backgroundColor: colors.flicker },
    mark: { width: 16, height: 16 },
    pressText: {
        fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.ink,
        includeFontPadding: false,
    },
});
