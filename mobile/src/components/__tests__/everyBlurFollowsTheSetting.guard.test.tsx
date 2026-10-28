/**
 * EVERY BLUR FOLLOWS REDUCE TRANSPARENCY (P4.38, Decision 10).
 *
 * Nineteen files drew expo-blur's frosted glass, and none read the phone's Reduce Transparency:
 * a member who asked for no see-through grounds still read their sheets, bars and doors over a
 * blurred screen. Every glass is now drawn through HouseBlur, which draws a solid ground of the
 * house's ink while the setting is on, and the glass again the moment it is off. This file holds
 * every blur to it, read from each file's code (comments removed), and draws it both ways.
 */
import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { act, render } from '@testing-library/react-native';

import { readCode } from '@/test-utils/readCode';
import { files, rel } from '@/test-utils/universe';
import { HouseBlur } from '@/src/components/HouseBlur';
import { Text } from '@/src/components/text';
import { colors } from '@/src/theme/theme';

jest.mock('expo-blur', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return { BlurView: (p: object) => ReactLocal.createElement(View, { ...p, testID: 'frosted-glass' }) };
});

let mockChanged: ((on: boolean) => void) | null = null;
beforeAll(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((_event: string, fn: (on: boolean) => void) => {
    mockChanged = fn;
    return { remove: () => {} };
  }) as unknown as typeof AccessibilityInfo.addEventListener);
});
afterAll(() => { jest.restoreAllMocks(); });

describe('every blur', () => {
  const census = files('appCode', { ext: ['.ts', '.tsx'] }).map(rel).map((f) => ({ f, code: readCode(f) }));

  it('is drawn through HouseBlur: none reaches expo-blur but it', () => {
    expect(census.filter(({ f, code }) => /from 'expo-blur'/.test(code) && f !== 'src/components/HouseBlur.tsx').map(({ f }) => f)).toEqual([]);
    // The sheets, bars and doors that draw one are found: the search page's among them.
    const drawing = census.filter(({ code }) => /<HouseBlur\b|createAnimatedComponent\(HouseBlur\)/.test(code)).map(({ f }) => f);
    expect(drawing.length).toBeGreaterThanOrEqual(18);
    expect(drawing).toContain('app/(modals)/search-modal.tsx');
  });
});

describe('the glass', () => {
  it('is frosted while the setting is off, solid ink while it is on, and frosted again at once', async () => {
    const r = render(<HouseBlur testID="glass" intensity={60} tint="dark" style={{ flex: 1 }}><Text>the door</Text></HouseBlur>);
    await act(async () => { await Promise.resolve(); });
    expect(r.queryAllByTestId('frosted-glass')).toHaveLength(1);

    await act(async () => { mockChanged?.(true); });
    expect(r.queryAllByTestId('frosted-glass')).toHaveLength(0);
    const ground = r.getByTestId('glass');
    expect(StyleSheet.flatten(ground.props.style)).toMatchObject({ flex: 1, backgroundColor: colors.ink });

    await act(async () => { mockChanged?.(false); });
    expect(r.queryAllByTestId('frosted-glass')).toHaveLength(1);
    expect(r.getByText('the door')).toBeTruthy();
  });
});
