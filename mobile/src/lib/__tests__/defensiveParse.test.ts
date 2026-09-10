/**
 * defensiveParse.test.ts — what the app does when the server sends the wrong shape.
 * ─────────────────────────────────────────────────────────────────────────────
 * This module is the boundary between "what Supabase returned" and "what the
 * app believes". Every service read goes through it, and until now exactly ONE
 * of its fourteen branches had ever been executed by a test — the happy one.
 *
 * The branches that were dark are the ones that only run when something has
 * already gone wrong, which is precisely when nobody wants to discover that the
 * handling is wrong too. Two of them encode real decisions:
 *
 *   IT THROWS IN PRODUCTION, IT DOES NOT RETURN THE RAW DATA. Returning the
 *   unvalidated object would skip Zod's defaults and transforms, so a missing
 *   field arrives as `undefined` and crashes three screens later, far from the
 *   cause. Better a caught error at the boundary than a mystery downstream.
 *
 *   THE ARRAY VARIANT SILENTLY DROPS BAD ROWS IN PRODUCTION. One malformed row
 *   in a feed of forty must not blank the feed — but the count goes to Sentry,
 *   because silent data loss with nobody counting it is how drift lives for
 *   months.
 *
 * `__DEV__` is a global, and the module reads it at CALL time, so each test
 * sets it and restores it rather than re-importing the module.
 */
import { z, ZodError } from 'zod';

import { defensiveParse, defensiveParseArray, SchemaValidationError } from '../defensiveParse';
import { captureError } from '../sentry';
import { logger } from '../../utils/logger';

jest.mock('../sentry', () => ({ captureError: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const Person = z.object({ name: z.string(), age: z.number() });

/** The global jest.setup pins to `true`; each test states which world it is in. */
const DEV_ORIGINAL = (globalThis as { __DEV__?: boolean }).__DEV__;
const setDev = (on: boolean) => { (globalThis as { __DEV__?: boolean }).__DEV__ = on; };

beforeEach(() => jest.clearAllMocks());
afterEach(() => { (globalThis as { __DEV__?: boolean }).__DEV__ = DEV_ORIGINAL; });

describe('defensiveParse — a good payload', () => {
  it('returns the PARSED value, not the input object', () => {
    // The distinction matters and is the reason the failure path throws rather
    // than returning raw data: the parsed value carries Zod's defaults and
    // transforms. A test against a schema with neither would pass either way.
    const Ranked = z.object({ name: z.string(), tier: z.string().default('free') });
    expect(defensiveParse(Ranked, { name: 'Ana' }, 'test'))
      .toEqual({ name: 'Ana', tier: 'free' });
  });

  it('takes an ARRAY schema directly, which is not the same call as defensiveParseArray', () => {
    // Kept from the original D-01 suite. `defensiveParse(z.array(X), …)` is
    // all-or-nothing; `defensiveParseArray(X, …)` salvages what it can in
    // production. Two different promises, and callers pick deliberately.
    const rows = [{ name: 'Ana', age: 31 }, { name: 'Cy', age: 44 }];
    expect(defensiveParse(z.array(Person), rows, 'test')).toHaveLength(2);
  });

  it('applies schema defaults for fields the payload omits', () => {
    // Also from D-01: the reason the failure path must never return raw data.
    const WithDefaults = z.object({
      id: z.string(),
      name: z.string().default('unknown'),
      count: z.number().optional(),
    });
    expect(defensiveParse(WithDefaults, { id: '123' }, 'test').name).toBe('unknown');
  });

  it('does not report anything when the shape is right', () => {
    setDev(true);
    expect(defensiveParse(Person, { name: 'Ana', age: 31 }, 'test')).toEqual({ name: 'Ana', age: 31 });
    expect(logger.error).not.toHaveBeenCalled();
    expect(captureError).not.toHaveBeenCalled();
  });
});

describe('defensiveParse — a bad payload', () => {
  it('IN DEV: logs the issues and throws, so drift is found while writing it', () => {
    setDev(true);
    expect(() => defensiveParse(Person, { name: 'Ana' }, 'FeedService.get'))
      .toThrow(SchemaValidationError);
    expect(logger.error).toHaveBeenCalled();
    // Dev fails fast and deliberately does NOT spend a Sentry event on a
    // developer's own machine.
    expect(captureError).not.toHaveBeenCalled();
  });

  it('IN PRODUCTION: reports to Sentry AND still throws', () => {
    setDev(false);
    expect(() => defensiveParse(Person, { name: 'Ana' }, 'FeedService.get'))
      .toThrow(SchemaValidationError);

    expect(captureError).toHaveBeenCalledTimes(1);
    const [err, meta] = (captureError as jest.Mock).mock.calls[0];
    expect(err).toBeInstanceOf(SchemaValidationError);
    expect(meta).toMatchObject({ context: 'FeedService.get', issueCount: 1 });
  });

  it('NEVER hands back the unvalidated object — the whole point of the module', () => {
    // If this ever returns instead of throwing, a payload missing its defaults
    // travels on and fails somewhere with no connection to the real cause.
    setDev(false);
    let returned: unknown = 'nothing was returned';
    try { returned = defensiveParse(Person, { name: 'Ana' }, 'ctx'); } catch { /* expected */ }
    expect(returned).toBe('nothing was returned');
  });

  it('the error carries the context and every issue', () => {
    setDev(true);
    try {
      defensiveParse(Person, { name: 7, age: 'old' }, 'ProfileService.get');
      throw new Error('should have thrown');
    } catch (e) {
      const err = e as SchemaValidationError;
      expect(err.name).toBe('SchemaValidationError');
      expect(err.context).toBe('ProfileService.get');
      expect(err.issues).toHaveLength(2);
      expect(err.message).toContain('ProfileService.get');
    }
  });

  it('survives a ZodError with no issues at all', () => {
    // `issues[0]?.message ?? 'unknown'` — the fallback exists for a reason and
    // had never run. An empty-issue error is rare, and a crash *inside* the
    // error path is the worst place for one.
    const err = new SchemaValidationError('ctx', new ZodError([]));
    expect(err.message).toContain('unknown');
    expect(err.issues).toEqual([]);
  });
});

describe('defensiveParseArray', () => {
  it('returns [] and warns when handed something that is not an array', () => {
    // Supabase returns null for an empty embedded relation; treating that as a
    // fatal parse error would blank a screen over nothing.
    expect(defensiveParseArray(Person, null as unknown as unknown[], 'ctx')).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
    expect(captureError).not.toHaveBeenCalled();
  });

  it('IN DEV: one bad row fails the whole array, loudly', () => {
    setDev(true);
    expect(() => defensiveParseArray(Person, [{ name: 'Ana', age: 31 }, { name: 'Bo' }], 'ctx'))
      .toThrow(SchemaValidationError);
  });

  it('IN PRODUCTION: keeps the good rows and drops the bad ones', () => {
    setDev(false);
    const out = defensiveParseArray(
      Person,
      [{ name: 'Ana', age: 31 }, { name: 'Bo' }, { name: 'Cy', age: 44 }],
      'ctx',
    );
    // A feed of forty must not go blank because row nineteen is malformed.
    expect(out).toEqual([{ name: 'Ana', age: 31 }, { name: 'Cy', age: 44 }]);
  });

  it('and COUNTS what it dropped, because silent loss is how drift survives', () => {
    setDev(false);
    defensiveParseArray(Person, [{ name: 'Ana', age: 31 }, { name: 'Bo' }], 'FeedService.list');
    expect(captureError).toHaveBeenCalledTimes(1);
    const [, meta] = (captureError as jest.Mock).mock.calls[0];
    expect(meta).toMatchObject({ context: 'FeedService.list', invalidCount: 1, totalCount: 2 });
  });

  it('says nothing when every row is good', () => {
    setDev(false);
    const rows = [{ name: 'Ana', age: 31 }, { name: 'Cy', age: 44 }];
    expect(defensiveParseArray(Person, rows, 'ctx')).toEqual(rows);
    expect(captureError).not.toHaveBeenCalled();
  });

  it('an empty array is not a failure', () => {
    setDev(false);
    expect(defensiveParseArray(Person, [], 'ctx')).toEqual([]);
    expect(captureError).not.toHaveBeenCalled();
  });
});
