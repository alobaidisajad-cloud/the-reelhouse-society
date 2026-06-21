/**
 * socialStore.ts — Social Graph Store (canonical import path)
 * T3-4: Re-exports from followStore.ts for naming consistency.
 * The store hook is `useSocialStore` — the filename should match.
 */
export { useSocialStore } from './followStore';
export type { SocialState } from './followStore';
