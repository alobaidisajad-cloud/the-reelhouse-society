/**
 * The app's Text and TextInput — the only ones it uses.
 * ─────────────────────────────────────────────────────────────────────────────
 * Every word the app draws goes through here (ESLint refuses Text and
 * TextInput from 'react-native' anywhere else), so two promises hold for all
 * of them, on a phone, not only in tests:
 *
 *   1. It grows with the member's text size — up to 1.35×, unless it sets a
 *      ceiling of its own (`maxFontSizeMultiplier`, or `allowFontScaling={false}`
 *      to freeze it). Past 1.35 the house's labels, measured to fit, break.
 *   2. On Android its letter spacing is drawn as iOS draws it (androidTracking).
 *      Android multiplies spacing by the setting with no ceiling, so at 2× a
 *      spaced label is twice as wide as on iOS and runs out of its cell.
 *
 * ── WHY A MODULE, AND NOT A PATCH ────────────────────────────────────────────
 * Both promises used to be made by AccessibilityProvider, which patched
 * `Text.render` — or, when that did not exist, set `Text.defaultProps`. In
 * React Native 0.81 Text is a plain function component with no `.render`, and
 * React 19's `jsx()` ignores defaultProps on function components. So neither
 * ever ran on a phone: every Text without its own ceiling grew to the system's
 * largest size (3.1× on iOS), and Android spaced every label ×2. The tests
 * could not see it, because the test renderer's Text is a class, and a class
 * DOES read defaultProps. An explicit component cannot be skipped.
 */
import React, { forwardRef } from 'react';
import {
  Platform,
  // The one place these may come from 'react-native' (eslint.config.js).
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
} from 'react-native';
import { scaledTextProps } from '@/src/constants/textScaling';
import { useFontScale } from '@/src/hooks/useTextScale';
import { androidTracking } from '@/src/providers/androidTracking';

/** Props as the phone should receive them: the house ceiling unless the text sets its own, and iOS's spacing on Android. */
function housed<P extends TextProps | TextInputProps>(props: P, scale: number): P {
  const merged = { ...scaledTextProps, ...props } as P;
  if (Platform.OS === 'android') {
    const fix = androidTracking(merged.style, merged.allowFontScaling, scale);
    if (fix) return { ...merged, style: [merged.style, fix] };
  }
  return merged;
}

/**
 * Each name is a component AND the type of its ref, as React Native's were —
 * so `useRef<TextInput>(null)` still means what it meant.
 */
export type Text = React.ComponentRef<typeof RNText>;
export const Text = forwardRef<Text, TextProps>(function Text(props, ref) {
  const scale = useFontScale();
  return <RNText ref={ref} {...housed(props, scale)} />;
});

export type TextInput = React.ComponentRef<typeof RNTextInput>;
export const TextInput = forwardRef<TextInput, TextInputProps>(function TextInput(props, ref) {
  const scale = useFontScale();
  return <RNTextInput ref={ref} {...housed(props, scale)} />;
});

export type { TextProps, TextInputProps };
