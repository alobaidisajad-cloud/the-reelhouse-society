/**
 * resetAllStores.ts — Centralized Store Cleanup
 * ────────────────────────────────────────────────────────
 * Replaces fragile lazy-require() pattern in auth.ts logout.
 * Each store registers its own cleanup handler here, inverting
 * the dependency direction so auth.ts never imports domain stores.
 *
 * Usage in auth.ts: `import { resetAllStores } from './resetAllStores'; await resetAllStores();`
 * Usage in stores:  `import { registerStoreReset } from './resetAllStores'; registerStoreReset(resetFn);`
 */

/**
 * Receives the member being signed out.
 *
 * Several stores cache to disk under a per-member key (`reelhouse_following_<id>`
 * and friends). Those handlers cannot look the id up themselves: logout clears
 * the auth store FIRST so sign-out is visually instant, so by the time handlers
 * run there is no current member. Passing it in is what lets a store erase what
 * it wrote instead of the erasure being maintained by hand in auth.ts — which is
 * how three caches came to be written and never cleared.
 *
 * Null when the id is unknown; a handler must tolerate that and skip its
 * per-member keys rather than delete under an "undefined" key.
 */
type ResetHandler = (previousUserId: string | null) => void | Promise<void>;

const _resetHandlers: ResetHandler[] = [];

/**
 * Register a cleanup handler that will run on logout.
 * Called by each domain store during module initialization.
 */
export function registerStoreReset(handler: ResetHandler): void {
    _resetHandlers.push(handler);
}

/**
 * Execute all registered cleanup handlers.
 * Called by auth.ts logout() after signing out from Supabase.
 * Errors in individual handlers are caught to ensure all handlers run.
 */
export async function resetAllStores(previousUserId: string | null = null): Promise<void> {
    const results = await Promise.allSettled(
        _resetHandlers.map(async (handler) => {
            try {
                await handler(previousUserId);
            } catch (e) {
                return Promise.reject(e);
            }
        })
    );

    if (__DEV__) {
        const failed = results.filter(r => r.status === 'rejected');
        if (failed.length > 0) {
            console.warn(`[resetAllStores] ${failed.length}/${results.length} handlers failed`);
        }
    }
}
