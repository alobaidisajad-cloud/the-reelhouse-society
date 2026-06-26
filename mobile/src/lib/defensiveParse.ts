/**
 * defensiveParse.ts — Unified Zod Validation Strategy
 * ════════════════════════════════════════════════════════
 * Replaces the 3 inconsistent validation patterns across
 * the service layer (strict .parse(), ghost .safeParse(), and no
 * validation) with a single function.
 *
 * Strategy:
 *   • DEV: Fail-fast — throws on schema mismatch so drift is caught immediately
 *   • PROD: logs to Sentry, then THROWS (SchemaValidationError) to trigger the
 *     ErrorBoundary — it never returns unvalidated data, since returning raw data
 *     would bypass Zod defaults/transforms and cause silent downstream crashes.
 *   • On success, always returns validated, typed data for downstream consumers.
 *   • (For list endpoints where partial results are fine, use the array-salvage
 *     variant below instead.)
 */
import { z, ZodError } from 'zod';
import { captureError } from './sentry';
import { logger } from '../utils/logger';

/** Custom error class for schema validation failures */
export class SchemaValidationError extends Error {
  public readonly context: string;
  public readonly issues: z.ZodIssue[];

  constructor(context: string, zodError: ZodError) {
    super(`[${context}] Schema validation failed: ${zodError.issues[0]?.message ?? 'unknown'}`);
    this.name = 'SchemaValidationError';
    this.context = context;
    this.issues = zodError.issues;
  }
}

/**
 * Validate data against a Zod schema with environment-aware error handling.
 *
 * @param schema - The Zod schema to validate against
 * @param data - The raw data to validate (typically from Supabase response)
 * @param context - Human-readable context for error messages (e.g., 'FeedService.getPersonalFeed')
 * @returns Validated and typed data
 *
 * @example
 * ```ts
 * const feed = defensiveParse(FeedItemSchema.array(), data, 'FeedService.getPersonalFeed');
 * // Type: FeedItem[]
 * ```
 */
export function defensiveParse<T>(schema: z.ZodType<T>, data: unknown, context: string): T {
  const result = schema.safeParse(data);

  if (result.success) {
    return result.data;
  }

  // In development: fail-fast so schema drift is caught immediately during testing
  if (__DEV__) {
    logger.error(`[defensiveParse] ${context} — schema mismatch:`, result.error.issues);
    throw new SchemaValidationError(context, result.error);
  }

  // In production: log to Sentry for visibility, and throw to trigger the ErrorBoundary.
  // Returning raw data bypasses Zod defaults and transforms, causing silent downstream crashes.
  captureError(new SchemaValidationError(context, result.error), {
    context,
    issueCount: result.error.issues.length,
    firstIssue: result.error.issues[0],
  });

  throw new SchemaValidationError(context, result.error);
}

/**
 * Validate an array of items, filtering out invalid entries instead of failing.
 * Use this for list endpoints where partial results are acceptable.
 *
 * @param schema - The Zod schema for a single item
 * @param data - Array of raw items to validate
 * @param context - Human-readable context for error messages
 * @returns Array of validated items (invalid entries silently filtered in prod)
 */
export function defensiveParseArray<T>(schema: z.ZodType<T>, data: unknown[], context: string): T[] {
  if (!Array.isArray(data)) {
      logger.warn(`[DefensiveParse] Expected array for ${context}, got ${typeof data}`);
      return [];
  }

  if (__DEV__) {
    // In dev, validate the full array to catch drift immediately
    return defensiveParse(schema.array() as z.ZodType<T[]>, data, context);
  }

  // In prod, filter out invalid items and log the count
  const results: T[] = [];
  let invalidCount = 0;

  for (const item of data) {
    const result = schema.safeParse(item);
    if (result.success) {
      results.push(result.data);
    } else {
      invalidCount++;
    }
  }

  if (invalidCount > 0) {
    captureError(new Error(`[defensiveParseArray] ${context}: ${invalidCount}/${data.length} items failed validation`), {
      context,
      invalidCount,
      totalCount: data.length,
    });
  }

  return results;
}
