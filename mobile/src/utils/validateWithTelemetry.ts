/**
 * Composable Validation Layer — Telemetry Utilities
 *
 * Two exports for different service needs:
 *
 * 1. `reportValidationTelemetry` — COMPOSABLE reporter for services that
 *    already have their own parse logic (e.g., FeedService.parseRowsSafely).
 *    Attaches Sentry observability without owning parsing.
 *
 * 2. `validateWithTelemetry<T>` — FULL parse+report for services without
 *    existing parse logic. Combines batch-first Zod parsing with telemetry.
 *
 * Both share identical Sentry reporting format for unified dashboarding.
 */

import { z } from 'zod';
import { captureWarning } from '../lib/sentry';
import { logger } from './logger';

// ── Types ──

interface TelemetryOptions {
  /** Service.method context for Sentry grouping */
  context: string;
  /** Total rows before validation */
  totalRows: number;
  /** Invalid count after validation */
  invalidCount: number;
  /** Optional: first N error issues for debugging */
  sampleErrors?: z.ZodIssue[];
}

interface ValidateOptions<T> {
  /** Zod schema to validate each row against */
  schema: z.ZodType<T>;
  /** Service.method context for Sentry grouping */
  context: string;
  /** Raw data array to validate */
  data: unknown[];
  /** If true, throws when ALL rows fail validation */
  throwOnAllInvalid?: boolean;
}

// ── Composable Reporter ──

/**
 * Report validation results to Sentry. Composable — call AFTER your
 * existing parseRowsSafely or schema validation. Does not own parsing logic.
 *
 * No-op when invalidCount === 0.
 *
 * @param options - Telemetry configuration
 * @param options.context - Service.method identifier for Sentry grouping (e.g., 'FeedService.getCommunityFeed')
 * @param options.totalRows - Total number of rows before validation
 * @param options.invalidCount - Number of rows that failed validation
 * @param options.sampleErrors - Optional first N Zod issues for debugging (capped at 3 in report)
 * @returns void
 *
 * @example
 * ```typescript
 * const { valid, invalid } = parseRowsSafely(data, schema, 'FeedService.getCommunityFeed');
 * reportValidationTelemetry({
 *   context: 'FeedService.getCommunityFeed',
 *   totalRows: data.length,
 *   invalidCount: invalid.length,
 *   sampleErrors: invalid.flatMap(r => r.issues).slice(0, 3),
 * });
 * ```
 */
export function reportValidationTelemetry(options: TelemetryOptions): void {
  const { context, totalRows, invalidCount, sampleErrors } = options;
  if (invalidCount === 0) return;

  const ratio = invalidCount / totalRows;

  if (__DEV__) {
    logger.warn(
      `[${context}] ${invalidCount}/${totalRows} rows invalid (${(ratio * 100).toFixed(1)}%)`,
      sampleErrors?.slice(0, 2),
    );
  }

  captureWarning(`[Validation] ${context}: ${invalidCount}/${totalRows} invalid`, {
    context,
    totalRows,
    invalidCount,
    ratio,
    sampleIssues: sampleErrors?.slice(0, 3).map(e => e.message),
  });
}

// ── Full Validate + Report ──

/**
 * Full validate-and-report utility for services that DON'T already
 * have parseRowsSafely. Combines parsing + telemetry in one call.
 *
 * Strategy:
 * - Fast path: batch Zod parse (z.array(schema).safeParse) — single allocation
 * - Slow path: per-row salvage when batch fails — preserves valid rows
 *
 * @param options - Validation configuration
 * @param options.schema - Zod schema to validate each row against
 * @param options.context - Service.method identifier for Sentry grouping
 * @param options.data - Raw data array to validate
 * @param options.throwOnAllInvalid - If true, throws when ALL rows fail validation
 * @returns Object containing `valid` items array and `invalidCount` where `valid.length + invalidCount === data.length`
 * @throws {Error} When `throwOnAllInvalid: true` and all rows fail validation. Message includes context and row count.
 *
 * @example
 * ```typescript
 * const { valid, invalidCount } = validateWithTelemetry({
 *   schema: LogCommentSchema,
 *   context: 'LogService.getComments',
 *   data: rawRows,
 *   throwOnAllInvalid: true,
 * });
 * // valid.length + invalidCount === rawRows.length
 * ```
 */
export function validateWithTelemetry<T>(options: ValidateOptions<T>): { valid: T[]; invalidCount: number } {
  const { schema, context, data, throwOnAllInvalid = false } = options;
  if (data.length === 0) return { valid: [], invalidCount: 0 };

  // Fast path: batch parse
  const batchResult = z.array(schema).safeParse(data);
  if (batchResult.success) return { valid: batchResult.data, invalidCount: 0 };

  // Slow path: per-row salvage
  const valid: T[] = [];
  let invalidCount = 0;
  const sampleErrors: z.ZodIssue[] = [];

  for (const row of data) {
    const result = schema.safeParse(row);
    if (result.success) {
      valid.push(result.data);
    } else {
      invalidCount++;
      if (sampleErrors.length < 3) {
        sampleErrors.push(...result.error.issues.slice(0, 1));
      }
    }
  }

  // Telemetry reporting
  reportValidationTelemetry({ context, totalRows: data.length, invalidCount, sampleErrors });

  if (throwOnAllInvalid && valid.length === 0) {
    throw new Error(`[${context}] All ${data.length} rows failed validation`);
  }

  return { valid, invalidCount };
}
