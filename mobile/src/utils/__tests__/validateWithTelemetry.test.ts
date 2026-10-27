/**
 * validateWithTelemetry.test.ts — Unit Tests for Composable Validation Layer
 * ──────────────────────────────────────────────────────────────────────────────
 * Tests both `validateWithTelemetry` (full parse+report) and
 * `reportValidationTelemetry` (composable reporter for existing parse logic).
 *
 * _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
 */

import { z } from 'zod';

import { reportValidationTelemetry, validateWithTelemetry } from '../validateWithTelemetry';

// ── Mock captureWarning from sentry lib ──
const mockCaptureWarning = jest.fn();
jest.mock('../../lib/sentry', () => ({
  captureWarning: (...args: any[]) => mockCaptureWarning(...args),
}));

// ── Mock logger ──
const mockLoggerWarn = jest.fn();
jest.mock('../logger', () => ({
  logger: {
    warn: (...args: any[]) => mockLoggerWarn(...args),
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

// ── Test Schema ──
const TestSchema = z.object({ id: z.string(), name: z.string() });
type _TestItem = z.infer<typeof TestSchema>;

describe('validateWithTelemetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────
  // 1. All-valid batch (fast path)
  // ─────────────────────────────────────────────────────────────────
  it('returns all items on all-valid batch without Sentry calls', () => {
    const data = [
      { id: 'abc', name: 'Alice' },
      { id: 'def', name: 'Bob' },
      { id: 'ghi', name: 'Charlie' },
    ];

    const result = validateWithTelemetry({
      schema: TestSchema,
      context: 'TestService.getItems',
      data,
    });

    expect(result.valid).toHaveLength(3);
    expect(result.invalidCount).toBe(0);
    expect(result.valid).toEqual(data);
    expect(mockCaptureWarning).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────
  // 2. Mixed valid/invalid (slow path)
  // ─────────────────────────────────────────────────────────────────
  it('returns valid items and reports invalid via Sentry on mixed data', () => {
    const data = [
      { id: 'abc', name: 'Alice' },
      { id: 123, name: 'Bad-Id' },        // invalid: id is number
      { id: 'ghi', name: 'Charlie' },
      { id: 'jkl' },                       // invalid: missing name
    ];

    const result = validateWithTelemetry({
      schema: TestSchema,
      context: 'TestService.getMixed',
      data,
    });

    expect(result.valid).toHaveLength(2);
    expect(result.valid).toEqual([
      { id: 'abc', name: 'Alice' },
      { id: 'ghi', name: 'Charlie' },
    ]);
    expect(result.invalidCount).toBe(2);

    // Sentry captureWarning called exactly once with correct context
    expect(mockCaptureWarning).toHaveBeenCalledTimes(1);
    // A fixed line; the where and the counts as typed values (P4.44).
    expect(mockCaptureWarning).toHaveBeenCalledWith('[Validation] rows invalid', {
      context: 'TestService.getMixed',
      totalRows: 4,
      invalidCount: 2,
      ratio: 0.5,
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 3. All-invalid with throwOnAllInvalid: true
  // ─────────────────────────────────────────────────────────────────
  it('throws Error with context and count when all rows invalid and throwOnAllInvalid is true', () => {
    const data = [
      { id: 123, name: 456 },
      { wrong: 'field' },
      { id: null },
    ];

    expect(() =>
      validateWithTelemetry({
        schema: TestSchema,
        context: 'TestService.allBad',
        data,
        throwOnAllInvalid: true,
      }),
    ).toThrow(/\[TestService\.allBad\] All 3 rows failed validation/);
  });

  // ─────────────────────────────────────────────────────────────────
  // 4. All-invalid with throwOnAllInvalid: false (default)
  // ─────────────────────────────────────────────────────────────────
  it('returns empty valid array without throwing when all rows invalid (default behavior)', () => {
    const data = [
      { id: 123, name: 456 },
      { wrong: 'field' },
    ];

    const result = validateWithTelemetry({
      schema: TestSchema,
      context: 'TestService.allBadNoThrow',
      data,
    });

    expect(result.valid).toEqual([]);
    expect(result.invalidCount).toBe(2);
    // Still reports to Sentry
    expect(mockCaptureWarning).toHaveBeenCalledTimes(1);
  });

  // ─────────────────────────────────────────────────────────────────
  // 5. Empty array
  // ─────────────────────────────────────────────────────────────────
  it('returns empty result without Sentry calls for empty array', () => {
    const result = validateWithTelemetry({
      schema: TestSchema,
      context: 'TestService.empty',
      data: [],
    });

    expect(result.valid).toEqual([]);
    expect(result.invalidCount).toBe(0);
    expect(mockCaptureWarning).not.toHaveBeenCalled();
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────
  // 8. Sample errors capped at 3
  // ─────────────────────────────────────────────────────────────────
  it('sends no sample of what failed: a validation message can echo a value (P4.44)', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({ id: i, name: i * 2 }));

    validateWithTelemetry({
      schema: TestSchema,
      context: 'TestService.manyBad',
      data,
    });

    expect(mockCaptureWarning).toHaveBeenCalledTimes(1);
    expect(mockCaptureWarning.mock.calls[0][1]).not.toHaveProperty('sampleIssues');
  });

  // ─────────────────────────────────────────────────────────────────
  // 9. valid.length + invalidCount === data.length
  // ─────────────────────────────────────────────────────────────────
  it('maintains arithmetic invariant: valid.length + invalidCount === data.length', () => {
    const data = [
      { id: 'a', name: 'Valid1' },
      { id: 123 },                  // invalid
      { id: 'b', name: 'Valid2' },
      { nope: true },               // invalid
      { id: 'c', name: 'Valid3' },
    ];

    const result = validateWithTelemetry({
      schema: TestSchema,
      context: 'TestService.arithmetic',
      data,
    });

    expect(result.valid.length + result.invalidCount).toBe(data.length);
  });
});

describe('reportValidationTelemetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────
  // 6. invalidCount === 0 — no-op
  // ─────────────────────────────────────────────────────────────────
  it('is a no-op when invalidCount is 0', () => {
    reportValidationTelemetry({
      context: 'FeedService.parseRowsSafely',
      totalRows: 50,
      invalidCount: 0,
    });

    expect(mockCaptureWarning).not.toHaveBeenCalled();
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────
  // 7. invalidCount > 0 — reports ratio and samples
  // ─────────────────────────────────────────────────────────────────
  it('reports ratio and sample errors when invalidCount > 0', () => {
    // `received` was dropped from invalid_type issues in Zod 4 (this project is on
    // 4.3.6). These fixtures were Zod 3 shapes, so the telemetry function was being
    // handed issue objects Zod can no longer produce.
    const sampleErrors: z.ZodIssue[] = [
      { code: 'invalid_type', expected: 'string', path: ['id'], message: 'Expected string, received number' },
      { code: 'invalid_type', expected: 'string', path: ['name'], message: 'Required' },
    ];

    reportValidationTelemetry({
      context: 'LogService.getComments',
      totalRows: 20,
      invalidCount: 5,
      sampleErrors,
    });

    // Logger called in __DEV__ mode
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
    // On the phone's console: the line, then where and how many.
    expect(mockLoggerWarn.mock.calls[0].slice(0, 2)).toEqual(['[validate] rows invalid', 'LogService.getComments']);

    // To Sentry: a fixed line and typed values, never the issues themselves.
    expect(mockCaptureWarning).toHaveBeenCalledTimes(1);
    expect(mockCaptureWarning).toHaveBeenCalledWith('[Validation] rows invalid', {
      context: 'LogService.getComments',
      totalRows: 20,
      invalidCount: 5,
      ratio: 0.25,
    });
  });
});
