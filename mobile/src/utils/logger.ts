/**
 * logger.ts — Zero-Cost Debug Logger
 * ───────────────────────────────────
 * Replaces ad-hoc `if (__DEV__) console.log(...)` lines across the codebase.
 * In production builds, if no babel plugin strips it, this resolves to a no-op
 * without evaluating template literals or complex string interpolations.
 *
 * Production errors now forward to Sentry instead of vanishing.
 */

import { captureError, captureWarning } from '../lib/sentry';

/**
 * A log line as it may leave the phone: its leading message, never the values after it. Nothing
 * is stringified, so nothing can throw into the catch block that is reporting.
 */
const leadingLine = (args: unknown[]): string => (typeof args[0] === 'string' ? args[0] : '[log]');

/** A server error's code among the arguments (its SQLSTATE, or PostgREST's), and nothing else of it. */
const serverCode = (args: unknown[]): { pgCode: string } | undefined => {
    for (const a of args) {
        const code = a && typeof a === 'object' ? (a as { code?: unknown }).code : undefined;
        if (typeof code === 'string' && /^([0-9A-Z]{5}|PGRST\d{3})$/.test(code)) return { pgCode: code };
    }
    return undefined;
};

export const logger = {
    debug: (...args: unknown[]) => {
        if (__DEV__) {
            console.log(...args);
        }
    },
    info: (...args: unknown[]) => {
        if (__DEV__) {
            console.info(...args);
        }
    },
    warn: (...args: unknown[]) => {
        if (__DEV__) {
            console.warn(...args);
        } else {
            // Forwarded as its leading line alone: the arguments after it (an object, a row, a reply)
            // are never copied out of the phone (sentryScrub cuts the line too).
            try {
                captureWarning(leadingLine(args), serverCode(args));
            } catch { /* telemetry must never break the caller's recovery path */ }
        }
    },
    error: (...args: unknown[]) => {
        if (__DEV__) {
            console.error(...args);
        } else {
            // Forward actual Error objects to Sentry in production to preserve stack traces
            try {
                // The first Error keeps its class and stack; the other arguments are never copied in.
                const err = args.find((a): a is Error => a instanceof Error) ?? new Error(leadingLine(args));
                captureError(err, serverCode(args));
            } catch { /* telemetry must never break the caller's recovery path */ }
        }
    }
};
