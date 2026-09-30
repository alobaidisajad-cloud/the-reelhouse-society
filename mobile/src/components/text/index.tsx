/**
 * The app's Text and TextInput — the only ones it uses.
 * ─────────────────────────────────────────────────────────────────────────────
 * Every word the app draws goes through here (ESLint refuses Text and
 * TextInput from 'react-native' anywhere else), so three promises hold for all
 * of them, on a phone, not only in tests (the third, below, for Text):
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
 * 3. An ornament is not read aloud. A screen reader NAMES a symbol — ✦ is
 *    "black four-pointed star" — so "✦ FOUNDING MEMBER" was heard as a star
 *    before the words, and a Text that was only ornament (a ✦ between two
 *    rules, a lone · between two facts) was a stop that said nothing else.
 *    Found on 39 sites across the captured screens; decorativeTextProps, the
 *    name that suggests otherwise, only stops the text growing.
 *
 *    So a Text is named by its words alone, and one with no words — only
 *    ornament, or only a separator — is hidden. A label, or hiding, that the
 *    Text sets itself always wins. Anything else (a "+", a member's own "(),")
 *    is left as it is: a control named only by a symbol still needs its own
 *    label, and the captures' NAMELESS check says when one does not.
 */
const ORNAMENT = /[←-⇿∀-⋿⌀-⏿■-◿☀-➿⤀-⯿]/u;
const ORNAMENTS = /[←-⇿∀-⋿⌀-⏿■-◿☀-➿⤀-⯿]/gu;
const ONLY_SEPARATORS = /^[\s·•—–|/…]+$/u;
const HAS_WORDS = /[\p{L}\p{N}]/u;

/** A Text's words as one string, through nested Texts; null if it holds anything else. */
function wordsOf(children: React.ReactNode): string | null {
  if (children == null || typeof children === 'boolean') return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) {
    let out = '';
    for (const c of children) {
      const w = wordsOf(c);
      if (w === null) return null;
      out += w;
    }
    return out;
  }
  if (React.isValidElement(children)) {
    return wordsOf((children.props as { children?: React.ReactNode }).children);
  }
  return null;
}

/** The props that say how a screen reader should take this Text, when it does not say itself. */
function spoken(props: TextProps): Partial<TextProps> | null {
  if (props.accessibilityLabel != null || props.accessibilityElementsHidden != null
    || props.importantForAccessibility != null || props.accessible === false) return null;
  const words = wordsOf(props.children);
  if (!words) return null;
  const ornate = ORNAMENT.test(words);
  if (!ornate && !ONLY_SEPARATORS.test(words)) return null;
  const said = ornate ? words.replace(ORNAMENTS, '').replace(/\s+/g, ' ').trim() : '';
  if (!HAS_WORDS.test(said)) {
    return { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };
  }
  return { accessibilityLabel: said };
}

/**
 * Each name is a component AND the type of its ref, as React Native's were —
 * so `useRef<TextInput>(null)` still means what it meant.
 */
export type Text = React.ComponentRef<typeof RNText>;
export const Text = forwardRef<Text, TextProps>(function Text(props, ref) {
  const scale = useFontScale();
  const said = spoken(props);
  return <RNText ref={ref} {...housed(said ? { ...props, ...said } : props, scale)} />;
});

export type TextInput = React.ComponentRef<typeof RNTextInput>;
export const TextInput = forwardRef<TextInput, TextInputProps>(function TextInput(props, ref) {
  const scale = useFontScale();
  return <RNTextInput ref={ref} {...housed(props, scale)} />;
});

export type { TextProps, TextInputProps };
