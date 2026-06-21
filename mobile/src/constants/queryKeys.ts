/**
 * queryKeys.ts — Centralized TanStack Query Key Factory
 * ──────────────────────────────────────────────────────
 * Replaces scattered string literal query keys
 * with typed factory functions for compile-time safety and easy
 * bulk invalidation.
 *
 * Pattern: Each domain gets a factory object with hierarchical keys.
 * Usage: queryKeys.film.detail(123) → ['film', 123]
 *        queryKeys.feed.community() → ['feed', 'community']
 */

export const queryKeys = {
  film: {
    all: ['film'] as const,
    detail: (filmId: number) => ['film', filmId] as const,
    reviews: (filmId: number) => ['film', filmId, 'reviews'] as const,
    credits: (filmId: number) => ['film', filmId, 'credits'] as const,
  },
  feed: {
    all: ['feed'] as const,
    community: () => ['feed', 'community'] as const,
    // Parameterized factory for full inline key consolidation
    following: (followingCount: number) => ['feed', 'following', followingCount] as const,
    stacks: (filter: string, search: string, followingCount: number) => ['feed', 'stacks', filter, search, followingCount] as const,
  },
  log: {
    all: ['log'] as const,
    detail: (logId: string) => ['log', logId] as const,
    comments: (logId: string) => ['log', logId, 'comments'] as const,
  },
  user: {
    // Dedicated user key factory for auth store cache
    detail: (userId: string) => ['user', userId] as const,
  },
  profile: {
    all: ['profile'] as const,
    detail: (userId: string) => ['profile', userId] as const,
    logs: (userId: string) => ['profile', userId, 'logs'] as const,
    lists: (userId: string) => ['profile', userId, 'lists'] as const,
    followers: (userId: string) => ['profile', userId, 'followers'] as const,
    following: (userId: string) => ['profile', userId, 'following'] as const,
  },
  dossier: {
    all: ['dossier'] as const,
    feed: () => ['dossier', 'feed'] as const,
    detail: (dossierId: string) => ['dossier', dossierId] as const,
    comments: (dossierId: string) => ['dossier', dossierId, 'comments'] as const,
  },
  stack: {
    all: ['stack'] as const,
    detail: (stackId: string) => ['stack', stackId] as const,
    comments: (stackId: string) => ['stack', stackId, 'comments'] as const,
  },
  lounge: {
    all: ['lounge'] as const,
    detail: (loungeId: string) => ['lounge', loungeId] as const,
    messages: (loungeId: string) => ['lounge', loungeId, 'messages'] as const,
  },
  tmdb: {
    all: ['tmdb'] as const,
    path: (path: string) => ['tmdb', path] as const,
    search: (query: string) => ['tmdb', 'search', query] as const,
    trending: () => ['tmdb', 'trending'] as const,
    details: (filmId: number) => ['tmdb', filmId] as const,
  },
  // Missing domain factories for full coverage
  social: {
    pulse: () => ['socialPulse'] as const,
  },
  search: {
    universal: (query: string) => ['universalSearch', query] as const,
  },
  critique: {
    featured: () => ['featuredCritique'] as const,
  },
  watchlist: {
    all: ['watchlist'] as const,
  },
  archive: {
    all: ['archive'] as const,
  },
  notification: {
    all: ['notification'] as const,
  },
} as const;
