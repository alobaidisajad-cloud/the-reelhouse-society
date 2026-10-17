import { View } from 'react-native';
import { usePathname } from 'expo-router';
import { E2E_BUILD } from '@/src/utils/e2eTrace';

/**
 * The route the app stands on, for the route walk alone (e2e/walk-routes.mjs, WORKLIST P0.86): in
 * the E2E build, an unseen point whose id names the path, drawn once the preloader has gone (the
 * root layout draws it then). The walk waits for the mark of the route it opened before it
 * captures, so a capture is of that route, drawn, and a link that lands elsewhere fails by name.
 * Every other build draws nothing.
 */
export function routeMarkOf(pathname: string): string {
  const words = pathname.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return words ? `e2e-route-${words}` : 'e2e-route';
}

export function E2ERouteMark() {
  const pathname = usePathname();
  if (!E2E_BUILD) return null;
  return (
    // In the tree Maestro reads (Android's accessibility tree, so never hidden from it, as run
    // 39010069408's first mark was): with no words and no action, a screen reader passes it by.
    <View
      testID={routeMarkOf(pathname)}
      collapsable={false}
      pointerEvents="none"
      accessible={false}
      style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 1 }}
    />
  );
}
