/**
 * networkError.ts — Shared network error detection utility.
 * ────────────────────────────────────────────────────────
 * Centralizes the "is this a network/offline error?"
 * check that was duplicated across logSlice.ts and archiveSlice.ts.
 * Used to route failed mutations to the offline queue.
 */

/**
 * Returns true if the error appears to be a network connectivity failure
 * (as opposed to a Supabase/PostgREST semantic error).
 */
export function isNetworkError(e: unknown): boolean {
    const msg = (typeof e === 'object' && e !== null && 'message' in e) 
        ? String((e as any).message) 
        : (e instanceof Error ? e.message : String(e));
    const status = (typeof e === 'object' && e !== null && 'status' in e) ? (e as any).status : null;
    const code = (typeof e === 'object' && e !== null && 'code' in e) ? (e as any).code : null;
    const errLower = msg.toLowerCase();
    
    return (
        errLower.includes('fetch') || 
        errLower.includes('network') || 
        errLower.includes('offline') ||
        errLower.includes('timeout') ||
        status === 502 || status === 503 || status === 504 ||
        code === '57014' || code === '08000' || code === '08003' || code === '08006'
    );
}
