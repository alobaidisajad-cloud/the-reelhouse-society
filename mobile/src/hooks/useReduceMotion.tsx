/**
 * useReduceMotion — the phone's Reduce Motion, followed as it changes (P4.40).
 *
 * Reanimated's own useReducedMotion is the setting as it stood when the app launched, read once:
 * a member who turned Reduce Motion on with the app open was still moved, until they quit it.
 * So the setting at launch is where this starts, and each change the phone reports after it wins.
 * MotionFollowsTheSetting, at the root, hands the same answer to Reanimated, so the animations it
 * runs by the system's word follow it too.
 */
import React, { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { ReducedMotionConfig, ReduceMotion, useReducedMotion } from 'react-native-reanimated';

/** The setting as the phone last reported it, once it has changed since launch; null until then. */
let changed: boolean | null = null;
const listeners = new Set<() => void>();
let reading: { remove: () => void } | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!reading) {
    reading = AccessibilityInfo.addEventListener('reduceMotionChanged', (on: boolean) => {
      if (on === changed) return;
      changed = on;
      listeners.forEach((l) => l());
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && reading) { reading.remove(); reading = null; }
  };
}

/** Whether to move less: the setting now, not as it was at launch. */
export function useReduceMotion(): boolean {
  const atLaunch = useReducedMotion();
  const now = useSyncExternalStore(subscribe, () => changed, () => null);
  return now ?? atLaunch;
}

/** Reanimated told the setting as it is now: its animations that follow the system follow this. */
export function MotionFollowsTheSetting() {
  const still = useReduceMotion();
  return <ReducedMotionConfig mode={still ? ReduceMotion.Always : ReduceMotion.Never} />;
}
