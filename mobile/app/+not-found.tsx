/**
 * +not-found.tsx — Deep Link Catch-All
 * ─────────────────────────────────────
 * Handles malformed deep links (reelhouse://...)
 * and unmatched routes to prevent blank screens.
 * 
 * Displays a themed "Not in the Archive" screen with a
 * return-home action.
 */
import { NotInTheArchive } from '@/src/components/NotInTheArchive';

export default function NotFoundScreen() {
  return <NotInTheArchive />;
}

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
