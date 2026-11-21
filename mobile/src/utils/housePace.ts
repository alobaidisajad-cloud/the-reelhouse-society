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
import { counted } from '@/src/utils/counted';

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

/** A wait in words: "20 seconds", "a minute", "12 minutes", "an hour", "9 hours". */
function waitInWords(seconds: number): string {
    // A count of seconds goes through counted(), the house's one rule for a count and its word.
    if (seconds < 60) return seconds <= 1 ? 'a second' : counted(seconds, 'second', 'seconds');
    if (seconds < 3600) {
        const minutes = Math.ceil(seconds / 60);
        return minutes === 1 ? 'a minute' : `${minutes} minutes`;
    }
    const hours = Math.ceil(seconds / 3600);
    return hours === 1 ? 'an hour' : `${hours} hours`;
}

/**
 * The sentence for a critique the house asked to wait for (check_critique_pace, round 14), or null
 * for any other failure. The house paces each member's critiques: a room of 30, one more every 20
 * seconds, 500 in a day, and 20 within an hour on one record, stack or filing. Said as what it is,
 * with the wait the house named, for the critique the member just wrote (its words stay in the box):
 * the piece's hour ('target'), the day's critiques ('day', a wait to the house's midnight, however
 * short: met a minute before midnight it is still the day's), or the member's pace ('member').
 */
export function critiquePaceSaid(e: unknown): string | null {
    const pace = rateLimitOf(e);
    if (!pace) return null;
    const wait = waitInWords(pace.seconds);
    if (pace.scope === 'target') return `You have filed many critiques here within the hour. The house takes your next one here in ${wait}.`;
    if (isTheDaysCeiling(e)) return `You have filed the day's critiques. The house takes more in ${wait}.`;
    return `You are filing critiques faster than the house takes them. Send it again in ${wait}.`;
}

/** The house's pace refusing a write for the day's ceiling (DETAIL 'day', round 14), to its midnight. */
function isTheDaysCeiling(e: unknown): boolean {
    return rateLimitOf(e) !== null && typeof e === 'object' && e !== null && 'details' in e
        && (e as { details?: unknown }).details === 'day';
}

/**
 * The sentence for any other write the house asked to wait for (check_write_pace: stacks, salons,
 * seats, reactions, blocks, shelf and watchlist entries), or null for any other failure. Each kind is
 * paced far past what a person does, so a person seldom hears it; when they do it says what it is and
 * how long, never a lost connection. `what` is the plural the member was making ("salons", "seats").
 */
export function writePaceSaid(e: unknown, what: string): string | null {
    const pace = rateLimitOf(e);
    if (!pace) return null;
    const wait = waitInWords(pace.seconds);
    if (isTheDaysCeiling(e)) return `The house takes no more ${what} from you today. More in ${wait}.`;
    return `The house takes no more ${what} from you for ${wait}.`;
}

/**
 * The sentence for a salon message the house asked to wait for (lounge_messages_daily_ceiling, round
 * 14: a thousand a day, to the house's midnight), or null for any other failure. The message stays in
 * the room, failed, for the member to send again.
 */
export function salonPaceSaid(e: unknown): string | null {
    const pace = rateLimitOf(e);
    if (!pace) return null;
    return `You have sent the day's salon messages. The house takes more in ${waitInWords(pace.seconds)}.`;
}
