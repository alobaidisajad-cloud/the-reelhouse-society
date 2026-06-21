import * as fc from 'fast-check';
import { AppError, AuthError, DomainError, NetworkError, ValidationError } from '../AppError';
import { classifyError, handleError } from '../errorPipeline';

// Mock dependencies
jest.mock('../../lib/sentry', () => ({
  captureError: jest.fn(),
  captureWarning: jest.fn(),
  addBreadcrumb: jest.fn(),
}));
jest.mock('../reelToast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() }),
}));
jest.mock('../logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));
jest.mock('../networkError', () => ({
  isNetworkError: jest.requireActual('../networkError').isNetworkError,
}));

describe('errorPipeline', () => {
  describe('classifyError', () => {
    it('passes through AppError instances unchanged', () => {
      const original = new NetworkError('TIMEOUT', 'test');
      expect(classifyError(original)).toBe(original);
    });

    it('classifies network errors correctly', () => {
      const result = classifyError(new Error('Network request failed'));
      expect(result).toBeInstanceOf(NetworkError);
    });

    it('classifies timeout errors correctly', () => {
      const result = classifyError(new Error('Request timed out'));
      expect(result).toBeInstanceOf(NetworkError);
      expect(result.code).toBe('TIMEOUT');
    });

    it('classifies 401 as AuthError', () => {
      const result = classifyError({ message: 'Unauthorized', status: 401 });
      expect(result).toBeInstanceOf(AuthError);
    });

    it('classifies 404 as DomainError', () => {
      const result = classifyError({ message: 'Not found', status: 404 });
      expect(result).toBeInstanceOf(DomainError);
    });

    it('classifies 500+ as NetworkError SERVER_ERROR', () => {
      const result = classifyError({ message: 'Internal error', status: 500 });
      expect(result).toBeInstanceOf(NetworkError);
      expect(result.code).toBe('SERVER_ERROR');
    });

    it('classifies validation errors', () => {
      const result = classifyError({ message: 'violates check constraint', status: 422 });
      expect(result).toBeInstanceOf(ValidationError);
    });

    it('property: always returns an AppError instance', () => {
      fc.assert(
        fc.property(
          fc.anything(),
          (input) => {
            const result = classifyError(input, 'test');
            return result instanceof AppError;
          }
        ),
        { numRuns: 300 }
      );
    });

    it('property: classified error always has a non-empty code', () => {
      fc.assert(
        fc.property(
          fc.anything(),
          (input) => {
            const result = classifyError(input, 'test');
            return typeof result.code === 'string' && result.code.length > 0;
          }
        ),
        { numRuns: 300 }
      );
    });

    it('property: classified error always has a user-safe message', () => {
      fc.assert(
        fc.property(
          fc.anything(),
          (input) => {
            const result = classifyError(input, 'test');
            return typeof result.userMessage === 'string' && result.userMessage.length > 0;
          }
        ),
        { numRuns: 300 }
      );
    });
  });

  describe('handleError', () => {
    it('does not throw by default', () => {
      expect(() => handleError(new Error('test'), 'test.op')).not.toThrow();
    });

    it('throws when rethrow: true', () => {
      expect(() => handleError(new Error('test'), 'test.op', { rethrow: true })).toThrow(AppError);
    });

    it('returns the classified AppError', () => {
      const result = handleError(new Error('Network request failed'), 'test');
      expect(result).toBeInstanceOf(NetworkError);
    });

    it('does not show toast when silent: true', () => {
      const reelToast = require('../reelToast').default;
      reelToast.error.mockClear();
      handleError({ message: 'bad', status: 401 }, 'test', { silent: true });
      expect(reelToast.error).not.toHaveBeenCalled();
    });
  });
});
