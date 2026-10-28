/**
 * HouseBlur — the house's one frosted glass (WORKLIST P4.38, Decision 10).
 *
 * With the phone's Reduce Transparency on, a member has asked for no see-through grounds: the
 * glass is drawn as a solid ground of the house's ink instead, its children on it as before. The
 * setting is read once for every glass on screen, and followed the moment it changes. Every blur
 * in the app is drawn through here (everyBlurFollowsTheSetting).
 */
import React, { forwardRef, useSyncExternalStore } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { BlurView, type BlurViewProps } from 'expo-blur';

import { colors } from '@/src/theme/theme';

let reduced = false;
const listeners = new Set<() => void>();
let reading: { remove: () => void } | null = null;

function setReduced(on: boolean) {
  if (on === reduced) return;
  reduced = on;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!reading) {
    reading = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduced);
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setReduced, () => { /* read again when it changes */ });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && reading) { reading.remove(); reading = null; }
  };
}

/** Whether the phone's Reduce Transparency is on; drawn again the moment it changes. */
export function useReduceTransparency(): boolean {
  return useSyncExternalStore(subscribe, () => reduced, () => false);
}

export const HouseBlur = forwardRef<View, BlurViewProps>(function HouseBlur(props, ref) {
  const solid = useReduceTransparency();
  // One ref for either: what the glass is drawn as takes it (an animated glass sets its props through it).
  if (!solid) return <BlurView ref={ref as unknown as React.Ref<BlurView>} {...props} />;
  const { intensity: _intensity, tint: _tint, experimentalBlurMethod: _method, style, children, ...rest } = props;
  return <View ref={ref} {...rest} style={[style, { backgroundColor: colors.ink }]}>{children}</View>;
});
