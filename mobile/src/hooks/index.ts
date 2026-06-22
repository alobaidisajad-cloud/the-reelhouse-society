/**
 * hooks/index.ts — Barrel Export
 * ═══════════════════════════════════
 * Single import point for all custom hooks.
 * Import from '@/src/hooks' instead of individual files.
 */
export { useAmbientGlow } from './useAmbientGlow';
export { useAnalytics } from './useAnalytics';
export { useAuthThrottle } from './useAuthThrottle';
export { useBanCheck } from './useBanCheck';
export { useDebouncedSearch } from './useDebouncedSearch';
export { useDeviceThrottling } from './useDeviceThrottling';
export { useEditProfile } from './useEditProfile';
export { useEntitlement } from './useEntitlement';
export { useCommunityFeed, useFollowingFeed, useStacksFeed } from './useFeeds';
export { useFilmAnimations } from './useFilmAnimations';
export { useFilmDetail } from './useFilmDetail';
export { useOfflineAware } from './useOfflineAware';
export { useParallaxBreathing } from './useParallaxBreathing';
export { useProfileData } from './useProfileData';
export { useReducedMotion } from './useReducedMotion';
export { useReportUser } from './useReportUser';
export { useStableSubscription } from './useStableSubscription';
export { useStaggeredPrefetch } from './useStaggeredPrefetch';
export { useStreak } from './useStreak';
export { useUniversalSearch } from './useUniversalSearch';
export { useUpdateUser } from './useUpdateUser';
// Note: useAuthFlow and useLogFlow are intentionally excluded —
// they export complex interfaces and should be imported directly.

