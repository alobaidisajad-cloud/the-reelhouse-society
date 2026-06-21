/**
 * safeParse.test.ts — Safe JSON Parsing Tests
 * ────────────────────────────────────────────
 * Tests the crash-prevention wrapper introduced in T3-02 hardening.
 * Ensures malformed payloads never throw unhandled exceptions.
 */

import { safeJsonParse } from '../safeParse';

jest.mock('../logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

describe('safeJsonParse', () => {
  it('parses valid JSON string', () => {
    const result = safeJsonParse('{"screen":"film","id":"123"}', {});
    expect(result).toEqual({ screen: 'film', id: '123' });
  });

  it('parses valid JSON array', () => {
    const result = safeJsonParse('[1,2,3]', []);
    expect(result).toEqual([1, 2, 3]);
  });

  it('parses valid JSON primitives', () => {
    expect(safeJsonParse('"hello"', '')).toBe('hello');
    expect(safeJsonParse('42', 0)).toBe(42);
    expect(safeJsonParse('true', false)).toBe(true);
    expect(safeJsonParse('null', 'fallback')).toBeNull();
  });

  it('returns fallback for malformed JSON', () => {
    const fallback = { default: true };
    expect(safeJsonParse('{broken json', fallback)).toBe(fallback);
    expect(safeJsonParse('{{{{', fallback)).toBe(fallback);
    expect(safeJsonParse("{'single': 'quotes'}", fallback)).toBe(fallback);
  });

  it('returns fallback for null input', () => {
    expect(safeJsonParse(null, 'fallback')).toBe('fallback');
  });

  it('returns fallback for undefined input', () => {
    expect(safeJsonParse(undefined, 'fallback')).toBe('fallback');
  });

  it('returns fallback for empty string', () => {
    expect(safeJsonParse('', [])).toEqual([]);
  });

  it('logs warning on parse failure', () => {
    const { logger } = require('../logger');
    safeJsonParse('{invalid}', {});
    expect(logger.warn).toHaveBeenCalledWith(
      '[safeJsonParse] Failed to parse JSON:',
      expect.any(SyntaxError),
    );
  });
});
