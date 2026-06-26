/**
 * AccessibilityProvider — Global Dynamic Type & Text Scaling
 * ───────────────────────────────────────────────────────────
 * Sets global defaults for React Native Text and TextInput
 * so that ALL text respects iOS Dynamic Type and Android font scaling
 * without requiring per-component props.
 *
 * The textScaling constants (scaledTextProps, decorativeTextProps) were
 * built in T3-15 but never wired up. This provider deploys them globally.
 *
 * Usage: Wrap the root <Stack /> in _layout.tsx
 */
import { Text, TextInput, type TextProps, type TextInputProps } from 'react-native';
import { scaledTextProps } from '@/src/constants/textScaling';

// ── Apply global Text defaults ──
// React Native's Text component accepts defaultProps to set baseline
// accessibility behavior. We enable font scaling with a safety cap
// so layouts don't break at maximum accessibility settings.
//
// ⚠️ HOOK-2 — UPGRADE-FRAGILE INTERNAL PATCH.
// This relies on RN's Text/TextInput being a forwardRef object exposing a
// mutable `.render`. VERIFIED AGAINST: react-native 0.81.x (Expo SDK 54).
// On every RN/Expo SDK bump, re-verify that `(Text as any).render` is still a
// function (the `if` branch is taken, not the `defaultProps` fallback) — the
// smoke test in AccessibilityProvider.test.ts asserts the wrapper actually
// injects scaledTextProps. If RN drops `.render`, the fallback below silently
// no-ops the font cap, so the test is the early-warning signal.
const origTextRender = (Text as any).render;
if (origTextRender) {
  // RN 0.81+ uses forwardRef, so we patch render
  (Text as any).render = function (props: TextProps, ref: React.Ref<Text>) {
    return origTextRender.call(this, { ...scaledTextProps, ...props }, ref);
  };
} else {
  // Fallback: defaultProps approach for older RN internals
  const existingDefaults = (Text as any).defaultProps || {};
  (Text as any).defaultProps = { ...existingDefaults, ...scaledTextProps };
}

// ── Apply global TextInput defaults ──
const origInputRender = (TextInput as any).render;
if (origInputRender) {
  (TextInput as any).render = function (props: TextInputProps, ref: React.Ref<TextInput>) {
    return origInputRender.call(this, { ...scaledTextProps, ...props }, ref);
  };
} else {
  const existingDefaults = (TextInput as any).defaultProps || {};
  (TextInput as any).defaultProps = { ...existingDefaults, ...scaledTextProps };
}

/**
 * No-op component — the side effects above run at import time.
 * This export exists so the root layout can import this module
 * without an unused-import warning.
 */
export const ACCESSIBILITY_CONFIGURED = true;
