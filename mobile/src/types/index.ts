/**
 * src/types/index.ts — Barrel Re-export
 * ──────────────────────────────────────
 * Unified entry point for all domain types.
 *
 * The original monolithic `types.ts` has been fully split into the domain
 * modules below; the canonical definitions live in the `*.types.ts` files.
 * Import from `@/src/types` for everything, or from a specific module
 * (e.g. `@/src/types/film.types`) when you want a narrow surface.
 */
export * from './film.types';
export * from './social.types';
export * from './tmdb.types';
export * from './ui.types';
export * from './profile.types';
export type { User, UserPreferences } from '../schemas/user';
