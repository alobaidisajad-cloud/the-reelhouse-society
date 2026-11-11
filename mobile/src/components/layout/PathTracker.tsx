import { useEffect } from 'react';
import { usePathname } from 'expo-router';
import { noteCurrentPath } from '@/src/utils/openSociety';
import { useAddressQuery } from '@/src/utils/routeParams';
import { nav } from '@/src/utils/typedRouter';

/**
 * Tells the app which screen the member is on, from the one place that sees
 * every navigation: `openSociety`, so a rope can know whether it stands on a
 * presented screen or a pushed one; and `nav`, whose history otherwise hears
 * only its own back, never the iOS swipe or Android's back button — and,
 * holding the same film four times, would REPLACE the screen the member came
 * from instead of opening the film over it.
 *
 * Its own tiny component, so the pathname changing on every navigation
 * re-renders this and nothing else. The screen's query is noted with it (a guest's rope and
 * every way in return to the screen whole: the film a log was begun for, P4.21).
 */
export function PathTracker() {
  const pathname = usePathname();
  const query = useAddressQuery();
  useEffect(() => {
    noteCurrentPath(pathname, query);
    nav.syncState(pathname);
  }, [pathname, query]);
  return null;
}
