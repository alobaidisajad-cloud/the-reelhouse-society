/**
 * PurchaseDock — the box-office window, always in reach.
 *
 * Docked at the foot of the Society page: the price and period of the chosen
 * ticket in one line, then one button. It follows the chosen ticket, so there
 * is never a second button on the page arguing with it.
 *
 * The page reserves `DOCK_HEIGHT` + the home-indicator inset below its scroll
 * (the docked-bar law), so the last line of the small print can always be
 * scrolled clear of the window instead of living under it.
 */
import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import { deckLabelProps, scaledTextProps } from '@/src/constants/textScaling';

/** Summary line + button + footnote + padding, at the default text size. */
export const DOCK_HEIGHT = 11 + 18 + 9 + 52 + 8 + 16 + 12;
/** The fade that lets the page run under the window rather than stop at it. */
const FADE = 32;

export const PurchaseDock = memo(function PurchaseDock({
  summary, cta, spoken, auteur, busy, onBuy, bottomInset,
}: {
  summary: string;
  cta: string;
  spoken: string;
  auteur: boolean;
  busy: boolean;
  onBuy: () => void;
  bottomInset: number;
}) {
  return (
    <View style={[s.dock, { paddingBottom: Math.max(bottomInset, 12) + 4 }]}>
      <LinearGradient colors={['rgba(10,9,6,0)', colors.ink]} style={s.fade} pointerEvents="none" />
      <Text style={s.summary} {...scaledTextProps} maxFontSizeMultiplier={1.2} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{summary}</Text>
      <PressableScale
        style={s.btn}
        onPress={onBuy}
        disabled={busy}
        haptic="medium"
        pressedScale={0.98}
        hitSlop={null}
        accessibilityRole="button"
        accessibilityLabel={busy ? 'Processing purchase' : spoken}
        accessibilityState={{ disabled: busy, busy }}
      >
        <LinearGradient
          colors={auteur ? [colors.crimson, colors.bloodAged] : [colors.marqueeGold, colors.sepia]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <Text style={[s.btnText, auteur && s.btnTextAuteur]} {...deckLabelProps}>{busy ? 'PROCESSING…' : cta}</Text>
      </PressableScale>
      <Text style={s.sub} {...scaledTextProps} maxFontSizeMultiplier={1.2} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Cancel any time. No hard feelings.</Text>
    </View>
  );
});

const s = StyleSheet.create({
  dock: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 16, paddingTop: 11,
    backgroundColor: colors.ink,
    borderTopWidth: 1, borderTopColor: colors.sepiaBorder,
  },
  fade: { position: 'absolute', left: 0, right: 0, top: -FADE - 1, height: FADE },
  summary: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.parchment, textAlign: 'center', marginBottom: 9 },
  btn: { minHeight: 52, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 12 },
  btnText: { fontFamily: fonts.sub, fontSize: 13, letterSpacing: 2.5, color: colors.ink, includeFontPadding: false },
  btnTextAuteur: { color: colors.silverScreen },
  sub: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.fog, textAlign: 'center', marginTop: 8 },
});
