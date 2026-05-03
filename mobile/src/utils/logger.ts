/**
 * logger.ts — Zero-Cost Debug Logger
 * ───────────────────────────────────
 * Replaces ad-hoc `if (__DEV__) console.log(...)` lines across the codebase.
 * In production builds, if no babel plugin strips it, this resolves to a no-op
 * without evaluating template literals or complex string interpolations.
 *
 * C-02 AUDIT FIX: Production errors now forward to Sentry instead of vanishing.
 */

import { captureError } from '../lib/sentry';

export const logger = {
    debug: (...args: unknown[]) => {
        if (__DEV__) {
            console.log(...args);
        }
    },
    warn: (...args: unknown[]) => {
        if (__DEV__) {
            console.warn(...args);
        }
    },
    error: (...args: unknown[]) => {
        if (__DEV__) {
            console.error(...args);
        } else {
            // C-02 AUDIT FIX: Forward to Sentry in production
            const err = args[0] instanceof Error ? args[0] : new Error(String(args[0]));
            captureError(err);
        }
    }
};
