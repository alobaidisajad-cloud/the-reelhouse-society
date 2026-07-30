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
 * Stringify an argument for a production log line WITHOUT ever throwing.
 *
 * The previous inline JSON.stringify threw a TypeError on any object holding a
 * circular reference — and because logger calls sit at the top of catch blocks,
 * that throw would skip the rollback or offline-queue recovery underneath it.
 * A logger must never be able to break the code that is reporting to it.
 */
const safeString = (a: unknown): string => {
    if (a instanceof Error) return a.message;
    if (typeof a !== 'object' || a === null) return String(a);
    try {
        return JSON.stringify(a) ?? String(a);
    } catch {
        return '[unserializable]';
    }
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
            // Forward warnings to Sentry in production
            try {
                const msg = args.map(safeString).join(' ');
                const context: Record<string, unknown> = {};
                args.forEach((arg, i) => { context[`arg_${i}`] = arg; });
                captureWarning(msg, Object.keys(context).length > 0 ? context : undefined);
            } catch { /* telemetry must never break the caller's recovery path */ }
        }
    },
    error: (...args: unknown[]) => {
        if (__DEV__) {
            console.error(...args);
        } else {
            // Forward actual Error objects to Sentry in production to preserve stack traces
            try {
                let err: Error | undefined;
                const context: Record<string, unknown> = {};

                for (let i = 0; i < args.length; i++) {
                    const arg = args[i];
                    if (!err && arg instanceof Error) {
                        err = arg;
                    } else {
                        context[`arg_${i}`] = arg;
                    }
                }

                if (!err) {
                    err = new Error(args.map(safeString).join(' '));
                }

                captureError(err, Object.keys(context).length > 0 ? context : undefined);
            } catch { /* telemetry must never break the caller's recovery path */ }
        }
    }
};
