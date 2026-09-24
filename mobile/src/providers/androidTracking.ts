/**
 * androidTracking — a tracked label is as wide on Android as on iOS.
 * ─────────────────────────────────────────────────────────────────────────────
 * The house sets its labels in spaced capitals — `CERTIFIED`, `14 HRS. AGO`,
 * `✦ ARCHIVIST` — and measures them to fit. React Native 0.81 (new
 * architecture) draws that spacing two different ways:
 *
 *   iOS      as written, in points, at every text size   RCTAttributedTextUtils.mm
 *   Android  × the member's text size, with NO ceiling    TextAttributeProps.getLetterSpacing
 *
 * So at Android's largest setting a label is 1.35× its size — the app's
 * ceiling holds for the letters — but spaced 2× as wide, and labels measured
 * to fit on iOS ran off the screen, under their neighbours, and broke
 * mid-word ("RECORD", "14 HRS. AGO", "JUL 21, 2026", "✦ ARCHIVIST").
 *
 * The fix is exact, not approximate: spacing is a few points, and Android
 * grows anything under 8sp linearly (its non-linear curve starts at 8sp), so
 * handing it `spacing ÷ setting` makes it draw exactly `spacing` — iOS's number.
 *
 * Applied in AccessibilityProvider's one wrapper around every <Text>, so no
 * label has to know. A text that does not scale (`allowFontScaling={false}`) is
 * drawn by Android as written and is left alone.
 *
 * One edge it cannot see: a FROZEN text nested inside a scaling one inherits
 * the parent's corrected spacing and draws it unscaled — tighter. Nothing in the
 * app nests a spaced frozen text in a spaced scaling one.
 */
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';

/**
 * The style to append so Android draws this text's letter spacing as iOS does,
 * or null when nothing needs to change.
 */
export function androidTracking(
  style: StyleProp<TextStyle>,
  allowFontScaling: boolean | undefined,
  setting: number,
): TextStyle | null {
  if (allowFontScaling === false || !(setting > 0) || setting === 1) return null;
  const spacing = (StyleSheet.flatten(style) as TextStyle | undefined)?.letterSpacing;
  if (typeof spacing !== 'number' || spacing === 0) return null;
  return { letterSpacing: spacing / setting };
}
