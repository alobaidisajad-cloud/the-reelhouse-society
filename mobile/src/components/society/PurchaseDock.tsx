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

/**
 * The window's parts — the SAME numbers its styles use, so its height is their
 * sum and cannot drift from what is drawn (the docked-bar law; a test adds up
 * the rendered window and compares). The home-indicator inset is added by the
 * page on top of this, at the size the device reports.
 *
 * Text lines are fixed by lineHeight, which does not grow with Dynamic Type,
 * and both are one line (numberOfLines 1, shrink to fit), so the height holds
 * at every text size.
 */
export const DOCK = {
  rule: 1,
  padTop: 11,
  summary: 18,
  summaryGap: 9,
  button: 52,
  subGap: 8,
  sub: 16,
  /** Below the footnote, over the home indicator's own inset. */
  padBottom: 4,
  /** The least the window sits above the screen's edge on a phone with no inset. */
  minInset: 12,
} as const;
export const DOCK_HEIGHT = DOCK.rule + DOCK.padTop + DOCK.summary + DOCK.summaryGap + DOCK.button + DOCK.subGap + DOCK.sub + DOCK.padBottom;
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
    <View testID="purchase-dock" style={[s.dock, { paddingBottom: Math.max(bottomInset, DOCK.minInset) + DOCK.padBottom }]}>
      <LinearGradient colors={['rgba(13,11,9,0)', colors.ink]} style={s.fade} pointerEvents="none" />
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
    paddingHorizontal: 16, paddingTop: DOCK.padTop,
    backgroundColor: colors.ink,
    borderTopWidth: DOCK.rule, borderTopColor: colors.sepiaBorder,
  },
  fade: { position: 'absolute', left: 0, right: 0, top: -FADE - DOCK.rule, height: FADE },
  summary: { fontFamily: fonts.body, fontSize: 13, lineHeight: DOCK.summary, color: colors.parchment, textAlign: 'center', marginBottom: DOCK.summaryGap },
  // A fixed height, not a minimum: the window's height is a sum, and a button
  // allowed to grow would make it a guess.
  btn: { height: DOCK.button, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 12 },
  btnText: { fontFamily: fonts.sub, fontSize: 13, letterSpacing: 2.5, color: colors.ink, includeFontPadding: false },
  btnTextAuteur: { color: colors.silverScreen },
  sub: { fontFamily: fonts.body, fontSize: 12, lineHeight: DOCK.sub, color: colors.fog, textAlign: 'center', marginTop: DOCK.subGap },
});
