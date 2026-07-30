/**
 * logger — a log line must never be able to break its caller.
 *
 * These calls sit at the TOP of catch blocks whose rollback and offline-queue
 * recovery run underneath them. If the logger throws, the member loses the
 * recovery, not merely the log line. The production path stringifies its
 * arguments, and JSON.stringify throws on any circular reference — which real
 * error objects (a fetch Response holding its own request) genuinely have.
 */
import { logger } from '../logger';
import { captureError, captureWarning } from '../../lib/sentry';

jest.mock('../../lib/sentry', () => ({
    captureError: jest.fn(),
    captureWarning: jest.fn(),
}));

/** logger reads __DEV__ at call time, so flipping the global is enough. */
const asProduction = (fn: () => void) => {
    const prev = (global as unknown as { __DEV__: boolean }).__DEV__;
    (global as unknown as { __DEV__: boolean }).__DEV__ = false;
    try { fn(); } finally { (global as unknown as { __DEV__: boolean }).__DEV__ = prev; }
};

const circular = () => {
    const o: Record<string, unknown> = { message: 'boom' };
    o.self = o;
    return o;
};

beforeEach(() => { jest.clearAllMocks(); });

describe('logger — telemetry can never throw into the caller', () => {
    it('warn survives a circular argument in production', () => {
        asProduction(() => {
            expect(() => logger.warn('[Stack] Delete failed:', circular())).not.toThrow();
        });
        expect(captureWarning).toHaveBeenCalled();
    });

    it('error survives a circular argument in production', () => {
        asProduction(() => {
            expect(() => logger.error('[Stack] Delete failed:', circular())).not.toThrow();
        });
        expect(captureError).toHaveBeenCalled();
    });

    it('survives Sentry itself throwing', () => {
        (captureWarning as jest.Mock).mockImplementation(() => { throw new Error('sentry down'); });
        asProduction(() => {
            expect(() => logger.warn('anything')).not.toThrow();
        });
    });

    it('still reports a readable message for an ordinary supabase error', () => {
        asProduction(() => {
            logger.warn('[Stack] Delete failed:', { message: 'permission denied', code: '42501' });
        });
        expect(captureWarning).toHaveBeenCalledWith(
            expect.stringContaining('permission denied'),
            expect.any(Object),
        );
    });

    it('does not reach Sentry in development', () => {
        const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        logger.warn('dev only');
        expect(captureWarning).not.toHaveBeenCalled();
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
});
