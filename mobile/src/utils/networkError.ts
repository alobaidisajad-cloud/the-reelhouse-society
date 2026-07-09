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

/**
 * Returns true for an authorization / row-level-security rejection — a permanent
 * "you're not allowed" (distinct from connectivity or a transient blip). PostgREST
 * returns HTTP 403 with Postgres SQLSTATE 42501 when an RLS policy blocks a write,
 * e.g. a member who limits who may certify/annotate their content. Callers use this
 * to show a specific, honest message instead of a generic failure.
 */
export function isForbiddenError(e: unknown): boolean {
    if (typeof e !== 'object' || e === null) return false;
    const status = 'status' in e ? Number((e as any).status) : NaN;
    const code = 'code' in e ? String((e as any).code) : '';
    const msg = 'message' in e ? String((e as any).message).toLowerCase() : '';
    return status === 403 || code === '42501' || msg.includes('row-level security');
}

/**
 * Retryable Postgres SQLSTATEs — the server reached the DB but the statement
 * failed transiently and is safe to retry: serialization failure, deadlock,
 * lock-not-available, resource limits, and cannot-connect-now.
 */
const TRANSIENT_PG_CODES = new Set(['40001', '40P01', '55P03', '53300', '53400', '57P03']);

/**
 * Returns true for transient SERVER failures that should be RETRIED rather than
 * dead-lettered. Distinct from isNetworkError (connectivity): these requests
 * reached the server but failed temporarily — request timeout (408), rate
 * limiting (429), 5xx server errors, or a retryable Postgres code. A queued
 * offline write that hits one of these must be preserved and retried, not
 * silently lost.
 *
 * (502/503/504 are already covered by isNetworkError, which is checked first in
 * the flush loop; this handles the remaining transient cases — notably 500/429/
 * 408 — that previously fell through to the permanent dead-letter bucket.)
 */
export function isTransientError(e: unknown): boolean {
    if (typeof e !== 'object' || e === null) return false;
    const status = 'status' in e ? Number((e as any).status) : NaN;
    const code = 'code' in e ? String((e as any).code) : '';
    const msg = 'message' in e ? String((e as any).message).toLowerCase() : '';

    return (
        status === 408 || status === 429 ||
        (Number.isFinite(status) && status >= 500 && status <= 599) ||
        TRANSIENT_PG_CODES.has(code) ||
        msg.includes('rate limit') || msg.includes('too many requests')
    );
}
