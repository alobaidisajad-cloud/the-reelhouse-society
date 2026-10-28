/**
 * useBoldText — the phone's Bold Text setting, followed (WORKLIST P4.38, Decision 10).
 *
 * The house draws its words in its own faces, which the system's Bold Text does not reach. So the
 * setting is read here, and kept up as it changes; while it is on, the house Text draws each face
 * at its heavier weight. The heavier faces the house does not otherwise use are loaded only then,
 * so a member who never asks for them never waits for them; until one has loaded, its face stays
 * as it was. One listener for the whole app, however many words are drawn.
 */
import React, { createContext, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import * as Font from 'expo-font';
import { CourierPrime_700Bold_Italic } from '@expo-google-fonts/courier-prime';
import { Spectral_600SemiBold, Spectral_600SemiBold_Italic, Spectral_700Bold } from '@expo-google-fonts/spectral';

import { fonts } from '@/src/theme/theme';

/** Each house face, and the heavier one Bold Text draws it in. */
export const BOLDER: Record<string, string> = {
  [fonts.body]: fonts.bodyBold,
  [fonts.bodyItalic]: 'CourierPrime_700Bold_Italic',
  [fonts.serif]: 'Spectral_600SemiBold',
  [fonts.serifMedium]: 'Spectral_700Bold',
  [fonts.serifItalic]: 'Spectral_600SemiBold_Italic',
};

/** The faces with no heavier weight, and why each is drawn as it is. */
export const NOT_BOLDER: Record<string, string> = {
  [fonts.display]: 'Rye is cut in one weight, and its titles are already the heaviest words on the page',
  [fonts.sub]: 'Special Elite is a typewriter face cut in one weight',
  [fonts.bodyBold]: 'already the bold of Courier Prime',
};

/** The heavier faces loaded only for Bold Text. */
const ON_ASKING: Record<string, number> = {
  CourierPrime_700Bold_Italic,
  Spectral_600SemiBold,
  Spectral_600SemiBold_Italic,
  Spectral_700Bold,
};

let bold = false;
/** The heavier faces have loaded: the words are drawn again in them. */
let loaded = false;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((l) => l());
let asking: Promise<unknown> | null = null;
let reading: { remove: () => void } | null = null;

function setBold(on: boolean) {
  if (on && !asking) {
    // Loaded once; a face that fails to load stays as it was.
    asking = Font.loadAsync(ON_ASKING).then(() => { loaded = true; tell(); }, () => { asking = null; });
  }
  if (on !== bold) { bold = on; tell(); }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!reading) {
    reading = AccessibilityInfo.addEventListener('boldTextChanged', setBold);
    void AccessibilityInfo.isBoldTextEnabled().then(setBold, () => { /* read again when it changes */ });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && reading) { reading.remove(); reading = null; }
  };
}

/** Whether a face is ready to draw: one of the house's own, or one loaded for Bold Text. */
const ready = (face: string) => !(face in ON_ASKING) || Font.isLoaded(face);

/** The face a Text should draw in: its heavier one while Bold Text is on and that face is ready. */
export function boldFace(face: string, on: boolean): string {
  if (!on) return face;
  const heavier = BOLDER[face];
  return heavier && ready(heavier) ? heavier : face;
}

/** Off, on, or on with its heavier faces loaded: each a reason to draw the words again. */
const drawn = () => (bold ? (loaded ? 2 : 1) : 0);

/** Bold Text off (0), on (1), or on with its heavier faces loaded (2): drawn again at each change. */
export function useBoldText(): number {
  return useSyncExternalStore(subscribe, drawn, () => 0);
}

/** What the house Text reads, as useBoldText answers it. */
export const BoldTextContext = createContext(0);

/** The app, told of Bold Text through one subscription, not one per word drawn. */
export function BoldTextProvider({ children }: { children: React.ReactNode }) {
  return React.createElement(BoldTextContext.Provider, { value: useBoldText() }, children);
}
