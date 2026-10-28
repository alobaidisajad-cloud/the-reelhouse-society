/**
 * BOLD TEXT IS FOLLOWED (P4.38, Decision 10).
 *
 * The phone's Bold Text setting reaches only the system's faces, and the house draws every word in
 * its own. So the house Text reads the setting (useBoldText) and, while it is on, draws each face
 * at its heavier weight: Courier Prime at once (its bold is the house's own), Spectral and the
 * italics once their heavier faces have loaded, which they do only when the setting is first on.
 * A face cut in one weight is named with why. The words are drawn again the moment it changes.
 */
import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { act, render } from '@testing-library/react-native';

import { Text } from '@/src/components/text';
import { BOLDER, BoldTextProvider, NOT_BOLDER } from '@/src/hooks/useBoldText';
import { fonts } from '@/src/theme/theme';

/** The faces expo-font holds: the house's own from the start, the heavier ones once loaded. */
const mockLoaded = new Set<string>();
let mockLoad: (() => void) | null = null;
jest.mock('expo-font', () => ({
  isLoaded: (face: string) => mockLoaded.has(face),
  loadAsync: (map: Record<string, number>) => new Promise<void>((done) => {
    mockLoad = () => { Object.keys(map).forEach((f) => mockLoaded.add(f)); done(); };
  }),
}));

let mockChanged: ((on: boolean) => void) | null = null;
beforeAll(() => {
  jest.spyOn(AccessibilityInfo, 'isBoldTextEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((_event: string, fn: (on: boolean) => void) => {
    mockChanged = fn;
    return { remove: () => {} };
  }) as unknown as typeof AccessibilityInfo.addEventListener);
});
afterAll(() => { jest.restoreAllMocks(); });

const FACES = [fonts.body, fonts.bodyItalic, fonts.serif, fonts.serifMedium, fonts.serifItalic, fonts.display, fonts.sub];
const drawnIn = (r: ReturnType<typeof render>, face: string) =>
  StyleSheet.flatten(r.getByText(`words in ${face}`).props.style)?.fontFamily;

const page = () => render(
  <BoldTextProvider>
    {FACES.map((face) => <Text key={face} style={{ fontFamily: face }}>{`words in ${face}`}</Text>)}
  </BoldTextProvider>,
);

it('names every house face: drawn heavier, or with why it is not', () => {
  const named = Object.values(fonts).filter((f) => !(f in BOLDER) && !(f in NOT_BOLDER));
  expect(named).toEqual([]);
});

it('follows the setting: off, then on at once, then each heavier face as it loads, then off', async () => {
  const r = page();
  await act(async () => { await Promise.resolve(); });
  // Off: every face as the house set it.
  expect(FACES.map((f) => drawnIn(r, f))).toEqual(FACES);

  // On: Courier Prime's bold is the house's own, drawn at once; the rest wait for their faces.
  await act(async () => { mockChanged?.(true); });
  expect(drawnIn(r, fonts.body)).toBe(fonts.bodyBold);
  expect(drawnIn(r, fonts.serif)).toBe(fonts.serif);

  // Loaded: each face in its heavier weight; a face cut in one weight as it was.
  await act(async () => { mockLoad?.(); });
  expect(Object.fromEntries(FACES.map((f) => [f, drawnIn(r, f)]))).toEqual({
    [fonts.body]: fonts.bodyBold,
    [fonts.bodyItalic]: 'CourierPrime_700Bold_Italic',
    [fonts.serif]: 'Spectral_600SemiBold',
    [fonts.serifMedium]: 'Spectral_700Bold',
    [fonts.serifItalic]: 'Spectral_600SemiBold_Italic',
    [fonts.display]: fonts.display,
    [fonts.sub]: fonts.sub,
  });

  // Off again: every face as it was, at once.
  await act(async () => { mockChanged?.(false); });
  expect(FACES.map((f) => drawnIn(r, f))).toEqual(FACES);
});
