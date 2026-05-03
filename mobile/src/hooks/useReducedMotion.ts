/**
 * useReducedMotion — Reactive accessibility hook.
 *
 * Wraps AccessibilityInfo.isReduceMotionEnabled in a reactive hook
 * that updates when the user toggles the setting. Used throughout
 * the app to gate animations:
 *
 * - Film Grain: disabled entirely
 * - Preloader: simplified fade instead of bloom
 * - PressableScale: instant scale instead of spring
 * - Tab bar icons: no spring animations
 * - All FadeIn/ZoomIn: replaced with instant render
 * - Calendar grid flicker: disabled
 *
 * Usage:
 *   const reduceMotion = useReducedMotion();
 *   if (reduceMotion) return <StaticView />;
 */
import { useState, useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    // Check initial state
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);

    // Listen for changes
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion
    );

    return () => subscription.remove();
  }, []);

  return reduceMotion;
}
