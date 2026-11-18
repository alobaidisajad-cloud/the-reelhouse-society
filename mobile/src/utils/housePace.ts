/**
 * housePace.ts — a member's follow or certification, asked of the house at the house's pace.
 *
 * The house paces each member's follows and certifications (check_interaction_rate_limit, round
 * 13): a room of 120 acts, one more every 2 seconds, and ceilings a day and per thing. A refusal
 * says how long to wait (rateLimitOf). A short wait is waited here and the write asked again, so the
 * member sees nothing at all; a wait longer than PACE_WAIT_MAX_MS is thrown for the caller, which
 * keeps the write in the offline queue to go later, as it would with no signal. Never a failure
 * toast, never a report: a person never meets the pace, only a script does.
 */

/**
 * The house's pace, as it refuses a write that came faster than it takes them: the seconds to wait
 * before it will (its HINT) and what is paced, the member's own acts ('member') or the one thing they
 * keep acting at ('target'). Null for any other failure.
 */
export interface HousePace { seconds: number; scope: 'member' | 'target' }
export function rateLimitOf(e: unknown): HousePace | null {
    if (typeof e !== 'object' || e === null) return null;
    const code = 'code' in e ? String((e as { code?: unknown }).code) : '';
    const message = 'message' in e ? String((e as { message?: unknown }).message) : '';
    if (code !== 'RH429' && message !== 'RATE_LIMITED') return null;
    const seconds = Number('hint' in e ? (e as { hint?: unknown }).hint : NaN);
    const scope = 'details' in e && (e as { details?: unknown }).details === 'target' ? 'target' : 'member';
    return { seconds: Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 1, scope };
}

/** A write the house asked to wait for (rateLimitOf): neither a fault to report nor a refusal to say. */
export function isRateLimited(e: unknown): boolean {
    return rateLimitOf(e) !== null;
}

/** The longest the phone waits on the house's pace before it keeps the write for later. */
export const PACE_WAIT_MAX_MS = 10_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `write`; when the house answers that it comes too fast, waits the seconds it names and asks
 * again, up to `maxWaitMs` of waiting in all; past that, or for any other failure, throws what the
 * house answered.
 */
export async function atTheHousesPace<T>(
    write: () => Promise<T>,
    { maxWaitMs = PACE_WAIT_MAX_MS, wait = sleep }: { maxWaitMs?: number; wait?: (ms: number) => Promise<void> } = {},
): Promise<T> {
    let waited = 0;
    for (;;) {
        try {
            return await write();
        } catch (e) {
            const pace = rateLimitOf(e);
            if (!pace) throw e;
            const ms = pace.seconds * 1000;
            if (waited + ms > maxWaitMs) throw e;
            waited += ms;
            await wait(ms);
        }
    }
}
