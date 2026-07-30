/**
 * useBanCheck.test.ts — exercises the REAL hook.
 *
 * The previous version of this file never imported useBanCheck: it
 * re-implemented `user?.is_banned === true` inline and asserted on its own
 * copy, so it would have passed even if the hook were deleted (and the hook
 * duly measured 0% coverage). This calls the actual hook.
 *
 * No renderHook: useBanCheck holds no state and runs no effects — it reads the
 * store and returns two values — so with the store mocked it is a plain call.
 * (renderHook is async in this environment; see useAuthThrottle.pbt.test.ts:5.)
 */
import { useBanCheck } from '../useBanCheck';
import { useAuthStore } from '../../stores/auth';
import reelToast from '../../utils/reelToast';

jest.mock('../../stores/auth', () => ({ useAuthStore: jest.fn() }));
jest.mock('../../utils/reelToast', () => {
  const fn = jest.fn();
  (fn as any).error = jest.fn();
  (fn as any).success = jest.fn();
  (fn as any).info = jest.fn();
  return { __esModule: true, default: fn };
});

const mockStore = useAuthStore as unknown as jest.Mock;
const asUser = (user: unknown) => mockStore.mockReturnValue({ user });

beforeEach(() => jest.clearAllMocks());

describe('useBanCheck — isBanned', () => {
  it('is true only for an explicitly banned member', () => {
    asUser({ id: 'u1', is_banned: true });
    expect(useBanCheck().isBanned).toBe(true);
  });

  it('is false for a normal member', () => {
    asUser({ id: 'u1', is_banned: false });
    expect(useBanCheck().isBanned).toBe(false);
  });

  it('is false when signed out, and does not throw', () => {
    asUser(null);
    expect(useBanCheck().isBanned).toBe(false);
  });

  // Strict === true: a truthy string or a missing column must not silence
  // someone by accident. Locking out a real member is the worse failure.
  // (One case per `it` — a hook may not be called in a loop.)
  it.each([
    ['a missing column', { id: 'u1' }],
    ['the string "true"', { id: 'u1', is_banned: 'true' }],
    ['the number 1', { id: 'u1', is_banned: 1 }],
    ['an explicit null', { id: 'u1', is_banned: null }],
  ])('never guesses from %s', (_label, user) => {
    asUser(user);
    expect(useBanCheck().isBanned).toBe(false);
  });
});

describe('useBanCheck — checkBan (the guard callers use)', () => {
  it('returns true so the caller aborts, and tells the member why', () => {
    asUser({ id: 'u1', is_banned: true });
    expect(useBanCheck().checkBan()).toBe(true);
    expect((reelToast as any).error).toHaveBeenCalledWith('Your account has been silenced by The Society.');
  });

  it('the message is an ERROR, not a bare info toast', () => {
    // A bare reelToast(...) routes to 'info', and emitToast fires
    // TactileEngine.success() for anything that is not 'error' — so being told
    // you are silenced would arrive with a congratulatory buzz.
    asUser({ id: 'u1', is_banned: true });
    useBanCheck().checkBan();
    expect((reelToast as any).error).toHaveBeenCalledTimes(1);
    expect(reelToast).not.toHaveBeenCalled();
  });

  it('returns false and stays silent for a normal member', () => {
    asUser({ id: 'u1', is_banned: false });
    expect(useBanCheck().checkBan()).toBe(false);
    expect((reelToast as any).error).not.toHaveBeenCalled();
    expect(reelToast).not.toHaveBeenCalled();
  });

  it('does not block a signed-out visitor', () => {
    asUser(null);
    expect(useBanCheck().checkBan()).toBe(false);
    expect((reelToast as any).error).not.toHaveBeenCalled();
  });
});
