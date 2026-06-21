/**
 * limits.ts — Named Constants for System Limits
 * ══════════════════════════════════════════════════
 * Extracts all magic numbers from stores, services, and utils
 * into a single source of truth. Every constant has a JSDoc comment
 * explaining its purpose and where it's consumed.
 */

/** Queue and offline sync limits */
export const QUEUE_LIMITS = {
  /** Maximum mutations in the offline queue before oldest are dropped */
  MAX_QUEUE_SIZE: 1000,
  /** Show warning toast when queue reaches this threshold */
  QUEUE_WARNING_THRESHOLD: 90,
  /** Maximum dead-letter mutations stored per flush cycle */
  MAX_DEAD_LETTERS_PER_FLUSH: 10,
  /** Maximum total dead-letter mutations retained in MMKV */
  MAX_DEAD_LETTERS_TOTAL: 50,
  /** Mutations older than this (ms) are pruned on flush — 7 days */
  STALE_THRESHOLD_MS: 7 * 24 * 60 * 60 * 1000,
  /** Mutations processed per chunk before jittered backoff */
  CHUNK_SIZE: 5,
} as const;

/** Pagination and data fetching limits */
export const FETCH_LIMITS = {
  /** Messages fetched per Lounge page load */
  MESSAGES_PER_PAGE: 100,
  /** Maximum lounges returned in browse query */
  LOUNGES_BROWSE_LIMIT: 50,
  /** Maximum pages for hydrateFollowing before circuit-breaking */
  MAX_HYDRATE_PAGES: 10,
  /** Maximum pages for endorsement hydration */
  MAX_ENDORSEMENT_PAGES: 5,
} as const;

/** User input length constraints */
export const INPUT_LIMITS = {
  /** Maximum characters for a lounge chat message */
  MAX_MESSAGE_LENGTH: 500,
  /** Maximum characters for a film review */
  MAX_REVIEW_LENGTH: 5000,
  /** Maximum characters for a user bio */
  MAX_BIO_LENGTH: 500,
  /** Maximum characters for a lounge room description */
  MAX_LOUNGE_DESCRIPTION: 2000,
} as const;

/** Memory and cache management */
export const CACHE_LIMITS = {
  /** Maximum entries in the lounge message dedup Set before eviction */
  MESSAGE_DEDUP_SET_CAP: 5000,
  /** Entries retained after eviction (keep most recent) */
  MESSAGE_DEDUP_SET_RETAIN: 3000,
  /** Maximum accumulated films in discover store before trim */
  DISCOVER_FILMS_CAP: 500,
  /** Films retained when trimming discover store for persistence */
  DISCOVER_FILMS_PERSIST_CAP: 100,
  /** Maximum films trimmed on memory warning */
  DISCOVER_FILMS_MEMORY_CAP: 50,
} as const;

/** Circuit breaker configuration */
export const CIRCUIT_BREAKER = {
  /** Base delay for exponential backoff (ms) */
  BACKOFF_BASE_MS: 2000,
  /** Maximum delay cap for circuit breaker (ms) */
  BACKOFF_MAX_MS: 60000,
  /** Maximum jitter added to backoff (ms) */
  JITTER_MAX_MS: 1000,
  /** Inter-chunk delay base (ms) */
  CHUNK_DELAY_BASE_MS: 500,
  /** Inter-chunk jitter range (ms) */
  CHUNK_DELAY_JITTER_MS: 500,
} as const;
