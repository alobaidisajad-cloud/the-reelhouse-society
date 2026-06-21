/**
 * errorHandling.test.ts — Error Handling Utilities Tests
 * ──────────────────────────────────────────────────────
 * Tests the standardized error translation layer, toast integration,
 * and safe() async wrapper introduced during T1-01 hardening.
 */

import { friendlyError, handleError, safe } from '../errorHandling';

jest.mock('../logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

jest.mock('../reelToast', () => {
  const fn = jest.fn();
  fn.error = jest.fn();
  fn.success = jest.fn();
  return { __esModule: true, default: fn };
});

describe('errorHandling', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('friendlyError', () => {
    it('maps PG duplicate key code (23505)', () => {
      expect(friendlyError({ code: '23505', message: 'duplicate key' })).toBe('This already exists.');
    });

    it('maps PG permission denied code (42501)', () => {
      expect(friendlyError({ code: '42501', message: 'permission denied' })).toBe("You don't have permission for this action.");
    });

    it('maps PostgREST not-found code (PGRST116)', () => {
      expect(friendlyError({ code: 'PGRST116', message: 'not found' })).toBe('Item not found.');
    });

    it('maps invalid_grant to session expired', () => {
      expect(friendlyError({ code: 'invalid_grant', message: 'invalid' })).toBe('Session expired. Please sign in again.');
    });

    it('detects "duplicate key" in message when no code match', () => {
      expect(friendlyError({ message: 'duplicate key value violates unique constraint' })).toBe('This already exists.');
    });

    it('detects "JWT expired" in message', () => {
      expect(friendlyError({ message: 'JWT expired at 2024-01-01' })).toBe('Session expired. Please sign in again.');
    });

    it('detects "network" in message', () => {
      expect(friendlyError({ message: 'network request failed' })).toBe('Network error. Check your connection.');
    });

    it('detects "violates row-level security" in message', () => {
      expect(friendlyError({ message: 'violates row-level security policy' })).toBe("You don't have permission.");
    });

    it('returns raw message for unknown errors', () => {
      expect(friendlyError({ message: 'Something custom happened' })).toBe('Something custom happened');
    });

    it('returns default message for null', () => {
      expect(friendlyError(null)).toBe('Something went wrong.');
    });

    it('returns default message for undefined', () => {
      expect(friendlyError(undefined)).toBe('Something went wrong.');
    });

    it('returns string errors directly', () => {
      expect(friendlyError('Custom error string')).toBe('Custom error string');
    });

    it('returns default for objects without message or code', () => {
      expect(friendlyError({ random: true })).toBe('An unexpected error occurred.');
    });
  });

  describe('handleError', () => {
    it('logs error via console.error in __DEV__', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const err = new Error('test error');
      handleError(err, { label: 'TestModule' });
      expect(consoleSpy).toHaveBeenCalledWith('[TestModule]', err);
      consoleSpy.mockRestore();
    });

    it('shows toast by default', () => {
      const reelToast = require('../reelToast').default;
      handleError(new Error('visible error'));
      expect(reelToast.error).toHaveBeenCalled();
    });

    it('suppresses toast when silent is true', () => {
      const reelToast = require('../reelToast').default;
      handleError(new Error('hidden error'), { silent: true });
      expect(reelToast.error).not.toHaveBeenCalled();
    });

    it('uses custom message when provided', () => {
      const reelToast = require('../reelToast').default;
      handleError(new Error('raw'), { message: 'Custom user message' });
      expect(reelToast.error).toHaveBeenCalledWith('Custom user message');
    });

    it('suppresses toast when toast option is false', () => {
      const reelToast = require('../reelToast').default;
      handleError(new Error('no toast'), { toast: false });
      expect(reelToast.error).not.toHaveBeenCalled();
    });
  });

  describe('safe', () => {
    it('returns [data, null] on success', async () => {
      const [data, error] = await safe(() => Promise.resolve({ id: 1 }));
      expect(data).toEqual({ id: 1 });
      expect(error).toBeNull();
    });

    it('returns [null, error] on failure', async () => {
      const testError = new Error('async failed');
      const [data, error] = await safe(() => Promise.reject(testError));
      expect(data).toBeNull();
      expect(error).toBe(testError);
    });

    it('catches synchronous throws inside async functions', async () => {
      const [data, error] = await safe(async () => {
        throw new Error('sync throw');
      });
      expect(data).toBeNull();
      expect(error).toBeInstanceOf(Error);
    });
  });
});
