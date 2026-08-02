/**
 * D-01: DefensiveParse tests — verifies the dual-mode Zod validation
 * strategy (DEV=throw, PROD=graceful fallback).
 */
import { z } from 'zod';

// Mock __DEV__ for testing both modes
// Same cast the restore on the line below already uses — __DEV__ is a React
// Native global that is not declared on typeof globalThis.
const originalDev = (global as Record<string, unknown>).__DEV__;

describe('defensiveParse', () => {
  let defensiveParse: typeof import('../../lib/defensiveParse').defensiveParse;

  beforeEach(() => {
    jest.resetModules();
  });

  afterAll(() => {
    (global as Record<string, unknown>).__DEV__ = originalDev;
  });

  const TestSchema = z.object({
    id: z.string(),
    name: z.string().default('unknown'),
    count: z.number().optional(),
  });

  it('should parse valid data successfully', () => {
     
    defensiveParse = require('../../lib/defensiveParse').defensiveParse;
    const result = defensiveParse(TestSchema, { id: '123', name: 'test' }, 'test');
    expect(result).toEqual({ id: '123', name: 'test' });
  });

  it('should apply defaults for missing optional fields', () => {
     
    defensiveParse = require('../../lib/defensiveParse').defensiveParse;
    const result = defensiveParse(TestSchema, { id: '123' }, 'test');
    expect(result?.name).toBe('unknown');
  });

  it('should handle array parsing', () => {
     
    defensiveParse = require('../../lib/defensiveParse').defensiveParse;
    const ArraySchema = z.array(TestSchema);
    const data = [
      { id: '1', name: 'first' },
      { id: '2', name: 'second' },
    ];
    const result = defensiveParse(ArraySchema, data, 'test');
    expect(result).toHaveLength(2);
  });
});
