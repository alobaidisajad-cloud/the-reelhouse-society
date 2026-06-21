import { router, Href } from 'expo-router';
/**
 * typedRouter.ts — Type-Safe Navigation Helper
 * ──────────────────────────────────────────────
 * Wraps expo-router's push/replace with proper Href typing
 * so we never need `(router.push as any)` anywhere in the codebase.
 *
 * Usage:
 *   import { nav } from '@/src/utils/typedRouter';
 *   nav.push('/film/123');
 *   nav.push('/social-modal', { userId: '...', type: 'followers' });
 *   nav.replace('/(tabs)');
 *   nav.back();  // safe back with fallback to tabs
 */

import { registerStoreReset } from '@/src/stores/resetAllStores';

const MAX_CIRCULAR_DEPTH = 3;
const pushHistory: string[] = [];

export const nav = {
  push: (path: string, params?: Record<string, string>) => {
    const baseRoute = path.split('?')[0];

    // Detect circular patterns (e.g., User -> Film -> User -> Film)
    const occurrences = pushHistory.filter(p => p === baseRoute).length;

    if (occurrences >= MAX_CIRCULAR_DEPTH) {
      // Force replace to break the infinite stack
      (router.replace as any)((params ? { pathname: path, params } : path) as Href);
      
      // Update history without growing it
      const lastIdx = pushHistory.lastIndexOf(baseRoute);
      if (lastIdx > -1) {
        pushHistory.splice(lastIdx, 1);
      }
      pushHistory.push(baseRoute);
    } else {
      pushHistory.push(baseRoute);
      if (pushHistory.length > 20) pushHistory.shift();
      (router.push as any)((params ? { pathname: path, params } : path) as Href);
    }
  },

  replace: (path: string, params?: Record<string, string>) => {
    const baseRoute = path.split('?')[0];
    if (pushHistory.length > 0) {
      pushHistory[pushHistory.length - 1] = baseRoute;
    } else {
      pushHistory.push(baseRoute);
    }
    (router.replace as any)((params ? { pathname: path, params } : path) as Href);
  },

  back: () => {
    pushHistory.pop();
    if (router.canGoBack()) {
      router.back();
    } else {
      pushHistory.length = 0;
      (router.replace as any)('/(tabs)' as Href);
    }
  },

  canGoBack: () => router.canGoBack(),

  dismiss: () => {
    pushHistory.pop();
    if (router.canDismiss()) {
      router.dismiss();
    } else {
      pushHistory.length = 0;
      (router.replace as any)('/(tabs)' as Href);
    }
  },

  // Native Navigation Tracking
  // Handles iOS swipe-back and Android hardware back button which bypass nav.back()
  // Called from a global layout effect tracking usePathname()
  syncState: (pathname: string) => {
    const baseRoute = pathname.split('?')[0];
    if (pushHistory.length === 0) return;

    const lastIdx = pushHistory.lastIndexOf(baseRoute);
    if (lastIdx !== -1 && lastIdx < pushHistory.length - 1) {
      // Native pop detected! User swiped back. Truncate our JS history.
      pushHistory.length = lastIdx + 1;
    } else if (pushHistory[pushHistory.length - 1] !== baseRoute) {
      // Deep link or un-tracked navigation
      pushHistory.push(baseRoute);
      if (pushHistory.length > 20) pushHistory.shift();
    }
  },
};

// Clear navigation history on logout to prevent
// cross-session circular-nav detection false positives.
registerStoreReset(() => {
    pushHistory.length = 0;
});
