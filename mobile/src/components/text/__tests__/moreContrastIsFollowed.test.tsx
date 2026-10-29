/**
 * INCREASE CONTRAST IS FOLLOWED (P4.38, Decision 10).
 *
 * The phone's Increase Contrast (iOS) and high-contrast text (Android) reach only the system's
 * own colours, and the house draws every word in its own inks. So the house Text reads the setting
 * (useMoreContrast) and, while it is on, draws each quiet ink one step brighter and a dimmed word
 * at full strength. The words are drawn again the moment it changes.
 */
import React from 'react';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
import { act, render } from '@testing-library/react-native';

import { Text } from '@/src/components/text';
import { BRIGHTER, MoreContrastProvider } from '@/src/hooks/useMoreContrast';
import { colors } from '@/src/theme/theme';

let mockChanged: { event: string; fn: (on: boolean) => void } | null = null;
beforeAll(() => {
  jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isHighTextContrastEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((event: string, fn: (on: boolean) => void) => {
    mockChanged = { event, fn };
    return { remove: () => {} };
  }) as unknown as typeof AccessibilityInfo.addEventListener);
});
afterAll(() => { jest.restoreAllMocks(); });

const drawn = (r: ReturnType<typeof render>, words: string) => StyleSheet.flatten(r.getByText(words).props.style);

const page = () => render(
  <MoreContrastProvider>
    <Text style={{ color: colors.fogQuiet }}>quietest</Text>
    <Text style={{ color: colors.fog }}>quiet</Text>
    <Text style={{ color: colors.bone }}>second</Text>
    <Text style={{ color: colors.parchment }}>first</Text>
    <Text style={{ color: colors.sepia, opacity: 0.6 }}>dimmed</Text>
  </MoreContrastProvider>,
);

it('each quiet ink has a brighter one, and none is its own', () => {
  expect(Object.keys(BRIGHTER).length).toBeGreaterThanOrEqual(3);
  for (const [ink, up] of Object.entries(BRIGHTER)) expect(up).not.toBe(ink);
});

it('off, every ink is as written', async () => {
  const r = page();
  await act(async () => { await Promise.resolve(); });
  expect(drawn(r, 'quiet').color).toBe(colors.fog);
  expect(drawn(r, 'dimmed').opacity).toBe(0.6);
});

it('on, each quiet ink is a step brighter, a dimmed word at full strength, and the brightest untouched; off again, as written', async () => {
  const r = page();
  await act(async () => { await Promise.resolve(); });
  expect(mockChanged?.event).toBe(Platform.OS === 'ios' ? 'darkerSystemColorsChanged' : 'highTextContrastChanged');
  await act(async () => { mockChanged!.fn(true); });
  expect(drawn(r, 'quietest').color).toBe(colors.fog);
  expect(drawn(r, 'quiet').color).toBe(colors.bone);
  expect(drawn(r, 'second').color).toBe(colors.parchment);
  expect(drawn(r, 'first').color).toBe(colors.parchment);
  expect(drawn(r, 'dimmed').opacity).toBe(1);
  expect(drawn(r, 'dimmed').color).toBe(colors.sepia);
  await act(async () => { mockChanged!.fn(false); });
  expect(drawn(r, 'quiet').color).toBe(colors.fog);
  expect(drawn(r, 'dimmed').opacity).toBe(0.6);
});

it('a phone that already has it on is read so from the start', async () => {
  jest.mocked(AccessibilityInfo.isDarkerSystemColorsEnabled).mockResolvedValueOnce(true);
  jest.mocked(AccessibilityInfo.isHighTextContrastEnabled).mockResolvedValueOnce(true);
  // Every page above is gone, so this one subscribes afresh, and the setting is asked again.
  const r = page();
  await act(async () => { await Promise.resolve(); });
  expect(drawn(r, 'quiet').color).toBe(colors.bone);
  await act(async () => { mockChanged!.fn(false); });
});
