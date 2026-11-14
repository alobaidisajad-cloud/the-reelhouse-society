/**
 * A tab icon's choosing, on the house's curve (src/theme/motion.ts): no bounce. The chosen one
 * grows a little, lights, and wears a dot beneath it.
 *
 * Each choosing rests on plain styles once its motion is past, and one that stalled is drawn anew
 * (drawnAnew, under `key`): a tab left lit, or the chosen one left dim and without its dot, would
 * tell the member they stand somewhere they do not.
 */
import React from 'react';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { arrive, MS } from '@/src/theme/motion';
import { ARRIVAL_GRACE_MS, drawnAnew } from '@/src/hooks/useArrival';
import { e2eTrace } from '@/src/utils/e2eTrace';

/** Where a tab's choosing rests, as plain styles. */
export const ICON_CHOSEN = { transform: [{ scale: 1.15 }], opacity: 1 } as const;
export const ICON_PASSED = { transform: [{ scale: 1 }], opacity: 0.35 } as const;
export const DOT_CHOSEN = { transform: [{ scale: 1 }], opacity: 1 } as const;
export const DOT_PASSED = { transform: [{ scale: 0 }], opacity: 0 } as const;

/** How long a choosing may take before it is set where it rests. */
export const TAB_CHOOSING_MS = Math.max(MS.quick, MS.base) + ARRIVAL_GRACE_MS;

export function useTabIconMotion(focused: boolean) {
  const scale = useSharedValue(focused ? 1.15 : 1);
  const iconOpacity = useSharedValue(focused ? 1 : 0.35);
  const dotScale = useSharedValue(focused ? 1 : 0);
  // Drawn where it rests from its first frame: a choosing moves only when the focus changes.
  const [restsOn, setRestsOn] = React.useState<boolean | null>(focused);
  const [rescues, setRescues] = React.useState(0);
  const born = React.useRef(true);

  React.useEffect(() => {
    if (born.current) {
      born.current = false;
      return undefined;
    }
    setRestsOn(null);
    scale.value = withTiming(focused ? 1.15 : 1, { duration: MS.quick, easing: arrive() });
    iconOpacity.value = withTiming(focused ? 1 : 0.35, { duration: MS.base });
    dotScale.value = withTiming(focused ? 1 : 0, { duration: MS.quick, easing: arrive() });
    const rest = setTimeout(() => {
      const dot = dotScale.value;
      const icon = iconOpacity.value;
      if (dot !== (focused ? 1 : 0) || icon !== (focused ? 1 : 0.35)) {
        e2eTrace('tab.choosing.rescued', { focused, dot, icon });
        setRescues((n) => n + 1);
        scale.value = focused ? 1.15 : 1;
        iconOpacity.value = focused ? 1 : 0.35;
        dotScale.value = focused ? 1 : 0;
      }
      setRestsOn(focused);
    }, TAB_CHOOSING_MS);
    return () => clearTimeout(rest);
  }, [focused, scale, iconOpacity, dotScale]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: iconOpacity.value,
  }));
  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dotScale.value }],
    opacity: dotScale.value,
  }));
  const rests = restsOn === focused;
  return {
    iconStyle: rests ? (focused ? ICON_CHOSEN : ICON_PASSED) : iconStyle,
    dotStyle: rests ? (focused ? DOT_CHOSEN : DOT_PASSED) : dotStyle,
    key: drawnAnew(rescues),
  };
}
