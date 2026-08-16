import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '@/src/theme/theme';
import { AUTOPSY_INIT } from '@/src/hooks/useLogFlow';
import AutopsyGauge from '@/src/components/AutopsyGauge';
import PressableScale from '@/src/components/PressableScale';
import { scaledTextProps } from '@/src/constants/textScaling';

const AUTOPSY_LABELS: Record<string, string> = {
    story: 'STORY', script: 'SCRIPT/DIALOGUE', acting: 'ACTING/CHAR',
    cinematography: 'CINEMATOGRAPHY', editing: 'EDITING/PACING', sound: 'SOUND DESIGN',
};

interface Props {
    isAuteur: boolean;
    autopsy: Record<string, number | null>;
    setAutopsy: (v: Record<string, number | null>) => void;
}

/**
 * THE AUTOPSY — six axes, taken apart.
 *
 * ── WHAT IS AND IS NOT A SCORE ──────────────────────────────────────────────
 * Axes start as `null`, never 0, and only become a number when a notch is
 * tapped. So "scored everything zero" and "never opened it" are genuinely
 * different, a deliberate 0 survives, and the payload derives "autopsied" from
 * rated axes alone — no open/close state can phantom-save an untouched autopsy.
 * (The web editor does the opposite: its axes are `number`, it flags the log
 * the moment the panel opens, and it prints a stored 0 as "-". That is where
 * all-zero autopsies come from.)
 *
 * ── THE LABEL SITS ABOVE THE CHANNEL ────────────────────────────────────────
 * It used to sit beside it, eating 90 of the 350 available points and leaving
 * each of eleven notches ~18.5 × 20pt — a coin toss between 6 and 7, on the
 * feature the Auteur rank is sold on. Stacked, the channel takes the full
 * width: 30 × 44pt per notch, nearly four times the area, with no gesture to
 * fight the scroll and no overlap between rows.
 *
 * Curatorial Control is no longer here. It changes the record's FACE, so it
 * belongs on the docket's poster, which is where it now lives.
 */
export default React.memo(function AuteurToolkit({ isAuteur, autopsy, setAutopsy }: Props) {
    return (
        <View>
            <Text style={st.editHint} {...scaledTextProps}>
                TAP A NOTCH TO FILE A SCORE — A DELIBERATE 0 COUNTS. TAP IT AGAIN TO WITHDRAW.
            </Text>

            {Object.keys(AUTOPSY_INIT).map(axis => {
                const rated = typeof autopsy[axis] === 'number';
                const val = autopsy[axis];
                const label = AUTOPSY_LABELS[axis] || axis.toUpperCase();
                return (
                    <View key={axis} style={st.axisRow}>
                        <View style={st.axisHead}>
                            <Text style={st.axisLabel} numberOfLines={1} {...scaledTextProps}>{label}</Text>
                            <Text style={[st.axisValue, !rated && st.axisValueUnrated]} {...scaledTextProps}>{rated ? String(val) : '—'}</Text>
                        </View>
                        <View style={st.axisTrack} accessibilityLabel={`${label}, ${rated ? `scored ${val} of 10` : 'not scored'}`}>
                            {[0,1,2,3,4,5,6,7,8,9,10].map(v => (
                                <PressableScale
                                    key={v}
                                    onPress={() => { setAutopsy({ ...autopsy, [axis]: val === v ? null : v }); }}
                                    style={[st.axisNotch, rated && v <= (val as number) && st.axisNotchOn]}
                                    // 13pt each side of an 18pt channel makes the target
                                    // 44pt tall. Left/right stay at 1: the notches are 2pt
                                    // apart, and an overlap always goes to the LATER one.
                                    hitSlop={{ top: 13, bottom: 13, left: 1, right: 1 }}
                                    haptic="light"
                                    pressedScale={0.92}
                                    disabled={!isAuteur}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: val === v }}
                                    accessibilityLabel={`${label} score ${v}${val === v ? ' — tap to withdraw' : ''}`}
                                />
                            ))}
                        </View>
                    </View>
                );
            })}

            {/* Exactly what a reader will see. The _v marker tells the gauge these
                zeros are deliberate verdicts rather than untouched axes. */}
            <View style={st.gaugeWrap}><AutopsyGauge autopsy={{ _v: 2, ...autopsy }} /></View>
        </View>
    );
});

const st = StyleSheet.create({
    editHint: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 1, color: colors.fog, opacity: 0.8, marginBottom: 14, lineHeight: 11, includeFontPadding: false },
    axisRow: { marginBottom: 12 },
    axisHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 },
    axisLabel: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2, color: colors.fog, flexShrink: 1, includeFontPadding: false },
    axisValue: { fontFamily: fonts.sub, fontSize: 12, color: colors.bone, includeFontPadding: false },
    axisValueUnrated: { color: colors.fog, opacity: 0.6 },
    // The channel: a dark strip of film. The published autopsy on the record and
    // the feed card is the same object, so what you author looks like what you
    // make. Full width now that the label sits above it.
    axisTrack: {
        flexDirection: 'row', gap: 2, height: 18, borderRadius: 2, overflow: 'hidden',
        backgroundColor: colors.inkwell, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.sepiaBorder,
    },
    axisNotch: { flex: 1, backgroundColor: colors.ash },
    axisNotchOn: { backgroundColor: colors.bloodReel },
    gaugeWrap: { marginTop: 8 },
});
