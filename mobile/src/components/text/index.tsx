/**
 * The app's Text and TextInput — the only ones it uses.
 * ─────────────────────────────────────────────────────────────────────────────
 * Every word the app draws goes through here (ESLint refuses Text and
 * TextInput from 'react-native' anywhere else), so four promises hold for all
 * of them, on a phone, not only in tests (the third and fourth, below, for Text),
 * and the E2E build hears every cut (the fifth):
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
import React, { createContext, forwardRef, useContext, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  // The one place these may come from 'react-native' (eslint.config.js).
  Text as RNText,
  TextInput as RNTextInput,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type TextInputProps,
  type TextLayoutEventData,
  type TextProps,
  type TextStyle,
} from 'react-native';
// React Native's own: whether a Text stands inside another (its own Text reads the same).
import TextAncestorContext from 'react-native/Libraries/Text/TextAncestorContext';
import { scaledTextProps, TYPE_FLOOR } from '@/src/constants/textScaling';
import { useFontScale } from '@/src/hooks/useTextScale';
import { androidTracking } from '@/src/providers/androidTracking';
import { cutOf, stillCut, type Box, type LaidLine } from '@/src/utils/cutText';
import { E2E_BUILD, e2eTrace } from '@/src/utils/e2eTrace';

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
 * Whether the Text a nested one stands in grows with the text size. React Native
 * hands a nested Text its parent's scaling (it drops a nested `allowFontScaling`,
 * and a nested Text with no `maxFontSizeMultiplier` takes the parent's), so a
 * nested Text gets nothing of the house's: the house ceiling on it let a word
 * outgrow a frozen or lower-capped line around it. Only Android's spacing needs
 * to know, and it follows the parent.
 */
const ParentScales = createContext(true);

function nestedProps(props: TextProps, parentScales: boolean, scale: number): TextProps {
  if (Platform.OS !== 'android' || !parentScales) return props;
  const fix = androidTracking(props.style, true, scale);
  return fix ? { ...props, style: [props.style, fix] } : props;
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
 * 4. A word that shrinks to fit stops at the type floor. `minimumFontScale` is
 *    a fraction of the size drawn, so 0.75 of a 10pt label is 7.5pt: a word
 *    below the floor every word a member reads is held to. So the fraction is
 *    raised to what keeps the drawn size at TYPE_FLOOR or above, at the size
 *    the phone actually draws; a word set below the floor by design (a 9pt
 *    badge) never shrinks below its own size.
 */
export function flooredMinimumScale(props: TextProps, scale: number): number | undefined {
  const asked = props.minimumFontScale;
  if (!props.adjustsFontSizeToFit || asked == null) return asked;
  const size = StyleSheet.flatten(props.style)?.fontSize;
  if (!size) return asked;
  const cap = props.maxFontSizeMultiplier ?? scaledTextProps.maxFontSizeMultiplier;
  const grown = props.allowFontScaling === false ? 1 : cap >= 1 ? Math.min(scale, cap) : scale;
  const floor = Math.min(TYPE_FLOOR, size);
  return Math.min(1, Math.max(asked, floor / (size * Math.max(grown, 1))));
}

/**
 * 5. In the E2E build alone, a Text that may lose words by its own settings (a numberOfLines, or
 *    shrinking to fit) says so when it does (`text.cut`, src/utils/cutText.ts): the largest-text
 *    run fails on a cut no one has judged (e2e/cut-text-judges.mjs); not the bold-text run, whose
 *    drawing this measure cannot follow (e2e/variants.json says why). Its own
 *    onLayout and onTextLayout still run; any other build adds nothing.
 *
 *    Android lays the lines it reports out again at the box's width in points, turned to pixels
 *    and rounded down (React Native's TextLayoutManager), and at bold text its report and its
 *    drawing differ by more than that: "E2E_WRITER", drawn whole, was reported cut 56 times (run
 *    39004285239), and still at a pixel wider (run 39010071533). So a Text that seems to have
 *    ended early is laid out once more, unseen, with no limit of lines and no width of its own (its
 *    twin): its lines' widths are its words' natural length, and the cut is said only if that,
 *    at the smallest size the Text may shrink to, is longer than its box's lines (stillCut). A Text
 *    inside another has no box of its own and no twin: it is the outer Text's to say.
 */
const TWIN: TextStyle = { position: 'absolute', left: -10000, top: 0, opacity: 0 };

function useCutSaid(props: TextProps, drawn: TextProps): { handlers: Partial<TextProps> | null; twin: React.ReactNode } {
  const box = useRef<Box | null>(null);
  const lines = useRef<LaidLine[] | null>(null);
  const said = useRef('');
  const [doubted, setDoubted] = useState<Box | null>(null);
  const nested = useContext(TextAncestorContext) === true;
  const mayCut = E2E_BUILD && !nested && (props.numberOfLines != null || props.adjustsFontSizeToFit === true);
  const words = mayCut ? wordsOf(props.children) : null;
  if (!words) return { handlers: null, twin: null };
  const say = (cut: string | null, count: number) => {
    const key = cut ? `${cut}:${words}` : '';
    if (key === said.current) return;
    said.current = key;
    if (cut) e2eTrace('text.cut', { words: words.slice(0, 80), cut, lines: count, numberOfLines: props.numberOfLines ?? null });
  };
  const judge = () => {
    if (!lines.current) return;
    const cut = cutOf(words, lines.current, box.current);
    if (cut === 'ended early' && box.current) {
      const b = box.current;
      if (doubted?.width !== b.width || doubted.height !== b.height) setDoubted(b);
      return;
    }
    say(cut, lines.current.length);
  };
  const {
    onLayout: _l, onTextLayout: _t, testID: _id, onPress: _p, onLongPress: _lp,
    numberOfLines: _n, adjustsFontSizeToFit: _a, minimumFontScale: _m, ellipsizeMode: _e, ...look
  } = drawn;
  // The smallest size it may shrink to; one that shrinks with no floor of its own goes down to 4pt, and is never cut.
  const scale = props.adjustsFontSizeToFit ? (drawn.minimumFontScale ?? 0) : 1;
  const twin = doubted ? (
    <RNText
      {...look}
      style={[drawn.style, TWIN]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onTextLayout={(e) => {
        const natural = e.nativeEvent.lines.reduce((sum, l) => sum + l.width, 0);
        say(stillCut(natural, doubted.width, props.numberOfLines ?? 1, scale) ? 'ended early' : null, props.numberOfLines ?? 1);
      }}
    />
  ) : null;
  return {
    twin,
    handlers: {
      onLayout: (e: LayoutChangeEvent) => {
        box.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
        judge();
        props.onLayout?.(e);
      },
      onTextLayout: (e: NativeSyntheticEvent<TextLayoutEventData>) => {
        lines.current = e.nativeEvent.lines;
        judge();
        props.onTextLayout?.(e);
      },
    },
  };
}

/**
 * Each name is a component AND the type of its ref, as React Native's were —
 * so `useRef<TextInput>(null)` still means what it meant.
 */
export type Text = React.ComponentRef<typeof RNText>;
export const Text = forwardRef<Text, TextProps>(function Text(props, ref) {
  const scale = useFontScale();
  const nested = useContext(TextAncestorContext) === true;
  const parentScales = useContext(ParentScales);
  const said = spoken(props);
  const own = said ? { ...props, ...said } : props;
  const housedProps = nested ? nestedProps(own, parentScales, scale) : housed(own, scale);
  const minimumFontScale = flooredMinimumScale(housedProps, scale);
  const shown = minimumFontScale !== undefined ? { ...housedProps, minimumFontScale } : housedProps;
  // A frozen Text tells the Texts inside it, which take its scaling; a scaling one need not (the default).
  const scales = nested ? parentScales : shown.allowFontScaling !== false;
  const drawn = !scales && typeof shown.children !== 'string'
    ? { ...shown, children: <ParentScales.Provider value={false}>{shown.children}</ParentScales.Provider> }
    : shown;
  const cut = useCutSaid(props, drawn);
  const text = <RNText ref={ref} {...drawn} {...cut.handlers} />;
  return cut.twin ? <>{text}{cut.twin}</> : text;
});

export type TextInput = React.ComponentRef<typeof RNTextInput>;
export const TextInput = forwardRef<TextInput, TextInputProps>(function TextInput(props, ref) {
  const scale = useFontScale();
  return <RNTextInput ref={ref} {...housed(props, scale)} />;
});

export type { TextProps, TextInputProps };
