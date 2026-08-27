/**
 * FilmScrollHeader — the control this page was missing.
 *
 * ── THE FAULT IT FIXES ──────────────────────────────────────────────────────
 * The floating back button fades to `opacity: 0` once you scroll past the
 * backdrop, and NOTHING replaces it. On a page over two thousand points long
 * that leaves a member with no way back but an edge swipe — which does not
 * exist on Android — and nothing on screen saying which film they are reading.
 *
 * So this fades IN across the same fifty points the floating control fades out
 * over. It REPLACES that control rather than joining it: at no scroll position
 * are both at full strength, and at no scroll position are both gone.
 *
 * It carries the film's name because orientation is the other half of the
 * problem. Eight sections deep into a page of critiques and provider chips,
 * "which film is this" is a real question.
 */
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import type { StyleProp, ViewStyle } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';

import { colors, fonts } from '@/src/theme/theme';
import { scaledTextProps } from '@/src/constants/textScaling';
import PressableScale from '@/src/components/PressableScale';

/** The bar under the status area. The safe-area inset is added by the caller. */
export const HEADER_BAR_HEIGHT = 52;

interface FilmScrollHeaderProps {
  title: string;
  onBack: () => void;
  topInset: number;
  /** Drives the cross-fade with the floating back button. */
  animatedStyle: StyleProp<ViewStyle>;
  /**
   * True while the action tray is open. The tray sets
   * `accessibilityViewIsModal`, which is iOS-only — on Android a screen reader
   * would otherwise talk straight past an open modal to this back button.
   */
  hiddenFromReader?: boolean;
}

export const FilmScrollHeader = memo(function FilmScrollHeader({
  title, onBack, topInset, animatedStyle, hiddenFromReader = false,
}: FilmScrollHeaderProps) {
  return (
    <Animated.View
      testID="film-scroll-header"
      importantForAccessibility={hiddenFromReader ? 'no-hide-descendants' : 'auto'}
      style={[s.header, { paddingTop: topInset, height: topInset + HEADER_BAR_HEIGHT }, animatedStyle]}
      // While it is faded out it must not swallow taps meant for the page
      // beneath it — the whole top of the film's backdrop lives under here.
      pointerEvents="box-none"
    >
      <View style={s.bar} pointerEvents="box-none">
        <PressableScale
          onPress={onBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="film-header-back"
        >
          <View style={s.back}><ArrowLeft size={16} color={colors.sepia} strokeWidth={1.5} /></View>
        </PressableScale>

        <Text {...scaledTextProps} style={s.title} numberOfLines={1}>
          {title.toUpperCase()}
        </Text>

        {/* Balances the back button so the title sits truly centred rather than
            optically shifted left by 36 points. */}
        <View style={s.spacer} />
      </View>
    </Animated.View>
  );
});

const s = StyleSheet.create({
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50,
    backgroundColor: 'rgba(10,9,6,0.96)',
    borderBottomWidth: 1, borderBottomColor: colors.sepiaBorder,
  },
  bar: {
    height: HEADER_BAR_HEIGHT, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, gap: 12,
  },
  back: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.sepiaBorder, backgroundColor: colors.surface,
  },
  title: {
    flex: 1, textAlign: 'center', minWidth: 0,
    fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2, color: colors.parchment,
    includeFontPadding: false,
  },
  spacer: { width: 36 },
});
