/**
 * concurrencyScope.ts — Structured Concurrency for Store Fetches
 * ──────────────────────────────────────────────────────────────
 * Provides a shared AbortController that all store-level
 * fetch operations pass to Supabase queries. On logout (or any
 * full reset), the scope is cancelled — immediately aborting all
 * in-flight reads, preventing:
 *   1. Wasted bandwidth from stale requests completing after logout
 *   2. Store writes to a now-empty state (race condition)
 *   3. Delayed logout UX on slow connections (up to 15s)
 *
 * Usage in domain slices:
 *   import { storeFetchScope } from '@/src/utils/concurrencyScope';
 *   const { data } = await query.abortSignal(storeFetchScope.signal);
 */

import { registerStoreReset } from '../stores/resetAllStores';

class ConcurrencyScope {
    private controller = new AbortController();

    /** The current AbortSignal — pass this to Supabase .abortSignal() */
    get signal(): AbortSignal {
        return this.controller.signal;
    }

    /**
     * Cancel all in-flight operations and create a fresh controller.
     * Safe to call multiple times — each call creates a new scope.
     */
    cancel(): void {
        this.controller.abort();
        this.controller = new AbortController();
    }
}

/** Singleton scope for all store-level fetch operations */
export const storeFetchScope = new ConcurrencyScope();

// Wire into the global reset registry — all in-flight fetches abort on logout
registerStoreReset(() => storeFetchScope.cancel());
