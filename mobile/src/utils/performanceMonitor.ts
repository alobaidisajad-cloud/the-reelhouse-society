/**
 * Performance Monitor — Sentry-Native Telemetry
 *
 * Thin wrapper around Sentry's native `startSpan` API providing:
 * - OpenTelemetry-aligned operation naming
 * - P95 budget threshold breadcrumbs
 * - Custom measurement recording
 * - Large dataset detection with warning alerts
 *
 * When Sentry is uninitialized (empty DSN), all functions execute
 * the wrapped logic without instrumentation — zero breakage.
 */

import * as Sentry from '@sentry/react-native';
import { captureWarning } from '../lib/sentry';

// ── Types ──

/** OpenTelemetry-aligned span operation names */
export type SpanOperation =
  | 'app.cold_start'
  | 'feed.load'
  | 'queue.flush'
  | 'queue.mutation'
  | 'search.omni'
  | 'search.typo'
  | 'search.semantic'
  | 'validation.batch';

/** P95 budget configuration per span operation */
export const SPAN_CONFIG: Record<SpanOperation, { budgetMs: number; description: string }> = {
  'app.cold_start': { budgetMs: 2000, description: 'Splash → interactive' },
  'feed.load': { budgetMs: 3000, description: 'Feed query + parse + render' },
  'queue.flush': { budgetMs: 5000, description: 'Full offline queue drain' },
  'queue.mutation': { budgetMs: 1000, description: 'Single mutation execution' },
  'search.omni': { budgetMs: 2000, description: 'Tier 1 direct TMDB search' },
  'search.typo': { budgetMs: 4000, description: 'Tier 2 typo-tolerant search' },
  'search.semantic': { budgetMs: 5000, description: 'Tier 3 keyword discover search' },
  'validation.batch': { budgetMs: 500, description: 'Zod batch parse operation' },
};

export interface MeasureOptions {
  /** OpenTelemetry operation name */
  op: SpanOperation;
  /** Human-readable span name */
  name: string;
  /** Structured attributes (OpenTelemetry convention) */
  attributes?: Record<string, string | number | boolean>;
}

interface PerformanceMonitor {
  /**
   * Wraps an async function in a Sentry performance span.
   * Returns the exact same value as the unwrapped function.
   * When Sentry is uninitialized, executes the function without instrumentation.
   *
   * @param options - Span configuration (operation name, display name, attributes)
   * @param fn - Async function to instrument
   * @returns The exact return value of `fn`
   * @throws Re-throws any exception from `fn` without modification
   *
   * @example
   * ```typescript
   * const items = await performanceMonitor.measure(
   *   { op: 'feed.load', name: 'getCommunityFeed' },
   *   () => feedService.getCommunityFeed({ pageParam: undefined }),
   * );
   * ```
   */
  measure<T>(options: MeasureOptions, fn: () => Promise<T>): Promise<T>;

  /**
   * Wraps a synchronous function in a Sentry performance span.
   * Returns the exact same value as the unwrapped function.
   * When Sentry is uninitialized, executes the function without instrumentation.
   *
   * @param options - Span configuration (operation name, display name, attributes)
   * @param fn - Synchronous function to instrument
   * @returns The exact return value of `fn`
   * @throws Re-throws any exception from `fn` without modification
   *
   * @example
   * ```typescript
   * const parsed = performanceMonitor.measureSync(
   *   { op: 'validation.batch', name: 'parseFeedRows' },
   *   () => schema.parse(rawData),
   * );
   * ```
   */
  measureSync<T>(options: MeasureOptions, fn: () => T): T;

  /**
   * Records a custom measurement (e.g., cold start duration captured externally).
   * Uses Sentry.setMeasurement for custom vital metrics in the performance dashboard.
   * No-op when Sentry DSN is empty.
   *
   * @param name - Measurement name (e.g., 'app.cold_start_ms')
   * @param value - Numeric measurement value
   * @param unit - Measurement unit: 'millisecond', 'byte', or 'none'
   *
   * @example
   * ```typescript
   * performanceMonitor.recordMeasurement('app.cold_start_ms', 1250, 'millisecond');
   * ```
   */
  recordMeasurement(name: string, value: number, unit: 'millisecond' | 'byte' | 'none'): void;

  /**
   * Detects and alerts on large dataset conditions.
   * Adds a Sentry breadcrumb and calls captureWarning when count exceeds threshold.
   * No-op when count is at or below threshold.
   *
   * @param label - Human-readable dataset identifier (e.g., 'following_large')
   * @param count - Current dataset size
   * @param threshold - Maximum expected size before warning
   *
   * @example
   * ```typescript
   * performanceMonitor.checkDatasetSize('following_large', following.length, 500);
   * ```
   */
  checkDatasetSize(label: string, count: number, threshold: number): void;
}

// ── Helpers ──

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

function isSentryEnabled(): boolean {
  return SENTRY_DSN.length > 0;
}

/**
 * Adds a budget-exceeded breadcrumb when duration surpasses the P95 threshold.
 *
 * @param op - The span operation that completed
 * @param durationMs - Actual execution duration in milliseconds
 */
function checkBudget(op: SpanOperation, durationMs: number): void {
  const config = SPAN_CONFIG[op];
  if (config && durationMs > config.budgetMs) {
    Sentry.addBreadcrumb({
      category: 'performance',
      message: `Budget exceeded: ${op} took ${Math.round(durationMs)}ms (budget: ${config.budgetMs}ms)`,
      level: 'warning',
      data: {
        op,
        durationMs: Math.round(durationMs),
        budgetMs: config.budgetMs,
        exceededBy: Math.round(durationMs - config.budgetMs),
      },
    });
  }
}

// ── Performance Monitor ──

export const performanceMonitor: PerformanceMonitor = {
  async measure<T>(options: MeasureOptions, fn: () => Promise<T>): Promise<T> {
    if (!isSentryEnabled()) {
      return fn();
    }

    const start = Date.now();
    try {
      const result = await Sentry.startSpan(
        { op: options.op, name: options.name, attributes: options.attributes },
        async () => fn(),
      );
      return result;
    } finally {
      const duration = Date.now() - start;
      checkBudget(options.op, duration);
    }
  },

  measureSync<T>(options: MeasureOptions, fn: () => T): T {
    if (!isSentryEnabled()) {
      return fn();
    }

    const start = Date.now();
    try {
      const result = Sentry.startSpan(
        { op: options.op, name: options.name, attributes: options.attributes },
        () => fn(),
      );
      return result;
    } finally {
      const duration = Date.now() - start;
      checkBudget(options.op, duration);
    }
  },

  recordMeasurement(name: string, value: number, unit: 'millisecond' | 'byte' | 'none'): void {
    if (!isSentryEnabled()) return;
    Sentry.setMeasurement(name, value, unit);
  },

  checkDatasetSize(label: string, count: number, threshold: number): void {
    if (count > threshold) {
      if (isSentryEnabled()) {
        Sentry.addBreadcrumb({
          category: 'performance',
          message: `Large dataset: ${label} (${count} > ${threshold})`,
          level: 'warning',
          data: { label, count, threshold, exceededBy: count - threshold },
        });
      }
      captureWarning(`[Perf] Large dataset: ${label}`, {
        count,
        threshold,
        exceededBy: count - threshold,
      });
    }
  },
};
