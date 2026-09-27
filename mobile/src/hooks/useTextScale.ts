/**
 * useTextScale / useLineScale — how much larger than designed the phone is
 * drawing text, so a BOX that holds text can grow with it.
 * ─────────────────────────────────────────────────────────────────────────────
 * React Native grows type by itself. It never grows a box: a `height`, a
 * `minHeight`, a rail that reserves two lines. A box that reserves room for
 * text must be multiplied by one of these, or the text outgrows it at a large
 * setting — and it did, three times:
 *
 *   · the cast rail's names ran 7pt past its end;
 *   · a filmography title's second line was cut clean off ("In the Mood for");
 *   · a one-line and a two-line caption stopped sharing a baseline.
 *
 * ── WHICH ONE ────────────────────────────────────────────────────────────────
 * What React Native 0.81 (new architecture) actually grows, read from its source:
 *
 *   font size                 × min(setting, ceiling)   both platforms
 *   a SET lineHeight   iOS    × min(setting, ceiling)   RCTAttributedTextUtils.mm
 *                      Android × setting, NO ceiling    TextAttributeProps.setLineHeight
 *
 *   useTextScale  — for lines with no set `lineHeight`: their height comes from
 *                   the font, and the font stops at the ceiling everywhere.
 *   useLineScale  — for lines with a set `lineHeight`: on Android it keeps
 *                   growing past the ceiling (to 2× at Android's largest
 *                   setting), and a box sized by the ceiling cuts it.
 *
 * Android 14 grows large sizes a little less than linearly; this grows them
 * linearly, so a box is never smaller than what Android draws.
 *
 * ── BOXES, NEVER TYPE ────────────────────────────────────────────────────────
 * Multiplying a font size or a line height by either scales that text TWICE.
 * The essay did exactly that and was set at nearly twice its leading.
 * `theTextBoxGrowsWithItsText.test.ts` forbids it, and forbids reading the
 * setting anywhere but this file.
 *
 * `useWindowDimensions`, not `PixelRatio.getFontScale()`: the second reads once
 * and goes stale when a member changes the setting while the app is open.
 */
import { useSyncExternalStore } from 'react';
import { Dimensions, Platform, useWindowDimensions } from 'react-native';
import { scaledTextProps } from '@/src/constants/textScaling';

/**
 * The setting itself, live, for the app's Text (src/components/text), which
 * runs inside EVERY word on screen. ONE listener for the whole app: a hook
 * that subscribed each text to window changes would multiply the work of every
 * render by the number of words. A member who changes the setting while the
 * app is open is seen by every text at once.
 */
let fontScale = Dimensions.get('window').fontScale || 1;
const listeners = new Set<() => void>();
Dimensions.addEventListener('change', ({ window }) => {
  const next = window.fontScale || 1;
  if (next === fontScale) return;
  fontScale = next;
  listeners.forEach((l) => l());
});
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const readFontScale = () => fontScale;

/** The member's text-size setting, as every Text sees it. */
export function useFontScale(): number {
  return useSyncExternalStore(subscribe, readFontScale, readFontScale);
}

/** The factor a line with no set lineHeight grows by: the font's, capped. */
export function useTextScale(ceiling: number = scaledTextProps.maxFontSizeMultiplier): number {
  const { fontScale } = useWindowDimensions();
  return Math.min(fontScale || 1, ceiling);
}

/** The factor a SET lineHeight grows by — past the ceiling on Android. */
export function useLineScale(ceiling: number = scaledTextProps.maxFontSizeMultiplier): number {
  const { fontScale } = useWindowDimensions();
  const f = fontScale || 1;
  return Platform.OS === 'android' ? f : Math.min(f, ceiling);
}
