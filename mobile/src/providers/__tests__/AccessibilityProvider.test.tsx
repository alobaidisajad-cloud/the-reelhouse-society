/**
 * AccessibilityProvider.test.tsx — HOOK-2 upgrade-fragility smoke test.
 * ─────────────────────────────────────────────────────────────────────
 * AccessibilityProvider monkey-patches React Native's internal Text.render
 * (forwardRef shape) to globally inject font-scaling caps. That patch depends
 * on an RN internal that can move between versions. This test is the early
 * warning: if an RN/Expo upgrade breaks the patch mechanism, the assertion
 * that scaled props actually reach a rendered <Text> will fail.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { scaledTextProps } from '@/src/constants/textScaling';
// Side-effect import: applies the global Text/TextInput patch at import time.
import { ACCESSIBILITY_CONFIGURED } from '../AccessibilityProvider';

describe('AccessibilityProvider (HOOK-2 patch smoke test)', () => {
  it('runs its global side effects without throwing', () => {
    expect(ACCESSIBILITY_CONFIGURED).toBe(true);
  });

  // NOTE: under the native RN runtime the provider patches `Text.render`
  // (forwardRef shape); the jest-expo JS mock has no `.render`, so here it
  // exercises the `defaultProps` fallback instead. We therefore assert the
  // OBSERVABLE behavior (props actually reach a rendered <Text>) rather than the
  // internal mechanism — the native `.render` path is documented in the provider
  // and cannot be faithfully exercised by the JS test renderer.
  it('injects the scaled font-scaling props into every rendered <Text>', () => {
    const { getByText } = render(<Text>hello</Text>);
    const node = getByText('hello');
    expect(node.props.allowFontScaling).toBe(scaledTextProps.allowFontScaling);
    expect(node.props.maxFontSizeMultiplier).toBe(scaledTextProps.maxFontSizeMultiplier);
  });

  it('still lets a component override the injected defaults', () => {
    const { getByText } = render(<Text maxFontSizeMultiplier={2}>big</Text>);
    expect(getByText('big').props.maxFontSizeMultiplier).toBe(2);
  });
});
