/**
 * BillingSwitch — monthly or yearly, the member's call.
 *
 * A pair of radios, read as one group. The saving is worked out from the prices
 * the tickets below are showing (societyPricing.savePercent) and is simply not
 * printed when those prices do not support it.
 *
 * The two halves touch, so neither may reach into the other: PressableScale's
 * default 15pt hit margin on both would overlap in the middle and the later one
 * would take every tap near the seam. Their margins are vertical only.
 */
import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import { deckLabelProps } from '@/src/constants/textScaling';
import type { Billing } from './societyPricing';

export const BillingSwitch = memo(function BillingSwitch({
  billing, save, onChange,
}: {
  billing: Billing;
  /** Whole percent saved by choosing a year, or null to claim nothing. */
  save: number | null;
  onChange: (b: Billing) => void;
}) {
  return (
    <View style={s.wrap} accessibilityRole="radiogroup" accessibilityLabel="How you pay">
      {(['monthly', 'annual'] as const).map((p) => {
        const on = billing === p;
        return (
          <PressableScale
            key={p}
            style={[s.seg, on && s.segOn]}
            onPress={() => { if (!on) onChange(p); }}
            hitSlop={{ top: 6, bottom: 6 }}
            haptic="selection"
            pressedScale={0.98}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={p === 'monthly' ? 'Pay monthly' : save ? `Pay yearly, and save ${save} percent` : 'Pay yearly'}
          >
            <Text style={[s.label, on && s.labelOn]} {...deckLabelProps}>{p === 'monthly' ? 'MONTHLY' : 'YEARLY'}</Text>
            {p === 'annual' && save ? (
              <View style={[s.save, on ? s.saveOn : s.saveOff]}>
                <Text style={[s.saveText, on ? s.saveTextOn : s.saveTextOff]} {...deckLabelProps}>SAVE {save}%</Text>
              </View>
            ) : null}
          </PressableScale>
        );
      })}
    </View>
  );
});

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 20,
    borderWidth: 1, borderColor: colors.sepiaBorderStrong, backgroundColor: colors.inkwell,
  },
  // Tight on purpose: at the largest text on the smallest phone, YEARLY and its
  // SAVE badge share ~154pt, and every point of padding is a point of type.
  seg: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 4 },
  segOn: { backgroundColor: colors.sepia },
  label: { fontFamily: fonts.sub, fontSize: 12, letterSpacing: 2.5, color: colors.bone, includeFontPadding: false, flexShrink: 1 },
  labelOn: { color: colors.ink },
  save: { borderWidth: 1, paddingHorizontal: 5, paddingVertical: 2 },
  saveOn: { borderColor: colors.ink },
  saveOff: { borderColor: colors.marqueeGold },
  saveText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.5, includeFontPadding: false },
  saveTextOn: { color: colors.ink },
  saveTextOff: { color: colors.marqueeGold },
});
