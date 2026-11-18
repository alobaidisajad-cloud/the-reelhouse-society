/**
 * SaidText (src/components/SaidText.tsx) — review round 12.
 *
 * A refusal drawn in red with only `accessibilityLiveRegion` was spoken on Android and never on
 * an iPhone, where that prop does nothing. SaidText speaks it on both: Android by its live region,
 * iOS by an announcement when the words appear and whenever they change.
 */
import React from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { render } from '@testing-library/react-native';
import { SaidText } from '../SaidText';

const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
const original = Platform.OS;
const onPlatform = (os: string) => Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
afterAll(() => onPlatform(original));
beforeEach(() => announce.mockClear());

describe('words that appear because something happened', () => {
  it('are spoken on an iPhone as they appear, again when they change, and not again when they do not', () => {
    onPlatform('ios');
    const r = render(<SaidText>That code is invalid or has expired.</SaidText>);
    expect(announce.mock.calls).toEqual([['That code is invalid or has expired.']]);
    r.rerender(<SaidText>That code is invalid or has expired.</SaidText>);
    expect(announce).toHaveBeenCalledTimes(1);
    r.rerender(<SaidText>The house could not be reached.</SaidText>);
    expect(announce.mock.calls).toEqual([['That code is invalid or has expired.'], ['The house could not be reached.']]);
  });

  it('are a live region, which Android speaks by itself (so it is not announced twice there)', () => {
    onPlatform('android');
    const r = render(<SaidText>The house could not register a key.</SaidText>);
    expect(r.getByText('The house could not register a key.').props.accessibilityLiveRegion).toBe('polite');
    expect(announce).not.toHaveBeenCalled();
  });
});
