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
            const msg = args.map(a => (a instanceof Error ? a.message : typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
            const context: Record<string, unknown> = {};
            args.forEach((arg, i) => { context[`arg_${i}`] = arg; });
            captureWarning(msg, Object.keys(context).length > 0 ? context : undefined);
        }
    },
    error: (...args: unknown[]) => {
        if (__DEV__) {
            console.error(...args);
        } else {
            // Forward actual Error objects to Sentry in production to preserve stack traces
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
                err = new Error(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
            }
            
            captureError(err, Object.keys(context).length > 0 ? context : undefined);
        }
    }
};
