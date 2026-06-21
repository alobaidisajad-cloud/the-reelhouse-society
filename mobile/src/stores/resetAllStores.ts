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

type ResetHandler = () => void | Promise<void>;

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
export async function resetAllStores(): Promise<void> {
    const results = await Promise.allSettled(
        _resetHandlers.map(async (handler) => {
            try {
                await handler();
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
