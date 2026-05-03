/**
 * networkError.ts — Shared network error detection utility.
 * ────────────────────────────────────────────────────────
 * O-01 AUDIT FIX: Centralizes the "is this a network/offline error?"
 * check that was duplicated across logSlice.ts and archiveSlice.ts.
 * Used to route failed mutations to the offline queue.
 */

/**
 * Returns true if the error appears to be a network connectivity failure
 * (as opposed to a Supabase/PostgREST semantic error).
 */
export function isNetworkError(e: unknown): boolean {
    const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
    return msg.includes('fetch') || msg.includes('network') || msg.includes('offline');
}
