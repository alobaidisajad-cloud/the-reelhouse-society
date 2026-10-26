/**
 * useScreenSeen — whether the screen this sits in is the one in front.
 *
 * useIsFocused, but at home outside a navigator too (a modal of its own, the crash net,
 * a test), where it answers seen: nothing is in front of it. It changes only on focus and
 * blur, so a component reading it draws again only then. Read from the navigator itself,
 * as React reads any store outside it: never a frame behind.
 */
import { useCallback, useContext, useSyncExternalStore } from 'react';
import { NavigationContext } from "expo-router/react-navigation";

export function useScreenSeen(): boolean {
  const navigation = useContext(NavigationContext);
  const subscribe = useCallback((changed: () => void) => {
    if (!navigation) return () => {};
    const focused = navigation.addListener('focus', changed);
    const blurred = navigation.addListener('blur', changed);
    return () => { focused(); blurred(); };
  }, [navigation]);
  const seen = useCallback(() => navigation?.isFocused() ?? true, [navigation]);
  return useSyncExternalStore(subscribe, seen);
}
