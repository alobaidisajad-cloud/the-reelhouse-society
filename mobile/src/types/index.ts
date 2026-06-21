/**
 * src/types/index.ts — Barrel Re-export
 * ──────────────────────────────────────
 * Unified entry point for all domain types.
 * 
 * Strategy: "Strangler Fig" pattern.
 *   - The monolith `../types.ts` remains the source of truth.
 *   - This barrel re-exports everything for new consumers.
 *   - Domain files (`film.ts`, `social.ts`, `tmdb.ts`, `ui.ts`)
 *     provide scoped access for domain-specific imports.
 *   - Existing 45+ imports from `../../types` continue working.
 *   - New code should prefer `@/src/types/film` or `@/src/types`.
 */
export * from './film.types';
export * from './social.types';
export * from './tmdb.types';
export * from './ui.types';
export * from './profile.types';
export type { User, UserPreferences } from '../schemas/user';
