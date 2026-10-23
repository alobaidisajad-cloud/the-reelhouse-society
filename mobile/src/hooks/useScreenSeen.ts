/**
 * useScreenSeen — whether the screen this sits in is the one in front.
 *
 * useIsFocused, but at home outside a navigator too (a modal of its own, the crash net,
 * a test), where it answers seen: nothing is in front of it. It changes only on focus and
 * blur, so a component reading it draws again only then.
 */
import { useContext, useEffect, useState } from 'react';
import { NavigationContext } from '@react-navigation/native';

export function useScreenSeen(): boolean {
  const navigation = useContext(NavigationContext);
  const [seen, setSeen] = useState(() => navigation?.isFocused() ?? true);
  useEffect(() => {
    if (!navigation) return;
    setSeen(navigation.isFocused());
    const focused = navigation.addListener('focus', () => setSeen(true));
    const blurred = navigation.addListener('blur', () => setSeen(false));
    return () => { focused(); blurred(); };
  }, [navigation]);
  return seen;
}
