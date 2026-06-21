/**
 * Standardized cache keys for MMKV storage and other persistence layers.
 */
export const CACHE_KEYS = {
  /**
   * Primary offline-first user cache
   * Used in auth.ts, auth-callback.tsx, edit-profile.tsx, etc.
   */
  USER: (userId: string) => `ironvault_user_cache_${userId}`,
  
  QUERY_CACHE: 'REELHOUSE_QUERY_CACHE',
  OFFLINE_MUTATIONS: 'reelhouse-offline-mutations',
  LAST_USER_ID: 'last_user_id',
  FEED_CACHE: 'nitrate_memory_feed',
} as const;

