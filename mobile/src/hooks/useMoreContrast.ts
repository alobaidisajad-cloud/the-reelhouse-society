/**
 * useMoreContrast — the phone's Increase Contrast, followed (WORKLIST P4.38, Decision 10).
 *
 * iOS calls it Increase Contrast (darker system colours), Android high-contrast text. The house
 * draws its words in its own inks, which neither reaches. So the setting is read here, and kept up
 * as it changes; while it is on, the house Text draws each quiet ink one step brighter, and a word
 * dimmed by its opacity at full strength. One listener for the whole app, however many words are drawn.
 */
import React, { createContext, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

import { colors } from '@/src/theme/theme';

/** Each quiet ink, and the brighter one it is drawn in while more contrast is asked for. */
export const BRIGHTER: Record<string, string> = {
  [colors.fogQuiet]: colors.fog,
  [colors.fog]: colors.bone,
  [colors.bone]: colors.parchment,
};

let more = false;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((l) => l());
let reading: { remove: () => void } | null = null;

function setMore(on: boolean) {
  if (on !== more) { more = on; tell(); }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!reading) {
    const ios = Platform.OS === 'ios';
    reading = AccessibilityInfo.addEventListener(ios ? 'darkerSystemColorsChanged' : 'highTextContrastChanged', setMore);
    const ask = ios ? AccessibilityInfo.isDarkerSystemColorsEnabled : AccessibilityInfo.isHighTextContrastEnabled;
    // Its answer arrives when it arrives; read again when the setting changes.
    void ask().then(setMore, () => {});
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && reading) { reading.remove(); reading = null; }
  };
}

/** Whether more contrast is asked for: drawn again when it changes. */
export function useMoreContrast(): boolean {
  return useSyncExternalStore(subscribe, () => more, () => false);
}

/** An ink as it is drawn: one step brighter while more contrast is asked for, if it is a quiet one. */
export function brighter(ink: unknown, on: boolean): unknown {
  return on && typeof ink === 'string' && ink in BRIGHTER ? BRIGHTER[ink] : ink;
}

/** What the house Text reads, as useMoreContrast answers it. */
export const MoreContrastContext = createContext(false);

/** The app, told of Increase Contrast through one subscription, not one per word drawn. */
export function MoreContrastProvider({ children }: { children: React.ReactNode }) {
  return React.createElement(MoreContrastContext.Provider, { value: useMoreContrast() }, children);
}
