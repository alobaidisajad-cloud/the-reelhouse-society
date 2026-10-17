import { createContext, useContext } from 'react';
import { View } from 'react-native';
import { usePathname } from 'expo-router';
import { E2E_BUILD } from '@/src/utils/e2eTrace';

/**
 * The route the app stands on, for the route walk alone (e2e/walk-routes.mjs, WORKLIST P0.86): in
 * the E2E build, an unseen point whose id names the path, drawn inside every route (by
 * toastScreenLayout, which every stack passes each screen through) once the preloader has gone
 * (PreloaderGone, from the root layout). The walk
 * waits for the mark of the route it opened before it captures, so a capture is of that route,
 * drawn, and a link that lands elsewhere fails by name. Inside each screen, never beside the
 * stack: a modal is a window of its own, and Maestro reads the window in front alone (run
 * 39016139854 found no mark over the login modal). Every other build draws nothing.
 */
export function routeMarkOf(pathname: string): string {
  const words = pathname.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return words ? `e2e-route-${words}` : 'e2e-route';
}

/** Whether the preloader has gone, from the root layout that draws it. */
export const PreloaderGone = createContext(false);

export function E2ERouteMark() {
  const pathname = usePathname();
  const gone = useContext(PreloaderGone);
  if (!E2E_BUILD || !gone) return null;
  return (
    // In the tree Maestro reads (Android's accessibility tree, so never hidden from it, as run
    // 39010069408's first mark was): with no words and no action, a screen reader passes it by.
    // Halfway down the screen's edge: at its top corner, under the status bar, Android called it
    // invisible to the user (run 39016141904), and Maestro waits only for what is visible.
    <View
      testID={routeMarkOf(pathname)}
      collapsable={false}
      pointerEvents="none"
      accessible={false}
      style={{ position: 'absolute', top: '50%', left: 0, width: 2, height: 2 }}
    />
  );
}
