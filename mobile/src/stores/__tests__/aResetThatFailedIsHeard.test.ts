/**
 * aResetThatFailedIsHeard.test.ts — a store that could not be emptied at
 * sign-out is reported, on a member's phone and not only in development.
 *
 * resetAllStores counted its failures only under __DEV__, so a reset that
 * failed in production — which may leave the last member's records for the
 * next one — was never heard of.
 */
import { registerStoreReset, resetAllStores } from '../resetAllStores';

// Hoisted above the import by jest.
jest.mock('@/src/utils/logger', () => ({
  logger: { warn: jest.fn(), debug: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

const { logger } = jest.requireMock('@/src/utils/logger') as { logger: { warn: jest.Mock } };

it('a failed reset reaches the logger (Sentry, in production), with what went wrong', async () => {
  const dev = (global as { __DEV__?: boolean }).__DEV__;
  (global as { __DEV__?: boolean }).__DEV__ = false;
  try {
    const boom = new Error('storage refused');
    registerStoreReset(() => { throw boom; });
    const ran = jest.fn();
    registerStoreReset(ran);
    await resetAllStores('u1');
    expect(ran).toHaveBeenCalledWith('u1');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/1\/\d+ handlers failed/), [boom]);
  } finally {
    (global as { __DEV__?: boolean }).__DEV__ = dev;
  }
});
