/**
 * useOfflineAware.test.ts — exercises the REAL offline decision.
 *
 * The previous version imported NetInfo but not the hook, and re-derived the
 * offline rule inline — so the app's own rule could have changed and this
 * suite would still have passed.
 *
 * isOfflineState is now the function the hook itself calls on every NetInfo
 * event, so these bind to what actually decides whether a member sees the
 * offline state.
 */
import { isOfflineState } from '../useOfflineAware';

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

type NetState = { isConnected: boolean | null; isInternetReachable: boolean | null };
const state = (isConnected: boolean | null, isInternetReachable: boolean | null): NetState =>
  ({ isConnected, isInternetReachable });

describe('isOfflineState — verified connectivity', () => {
  it('connected and reachable is ONLINE', () => {
    expect(isOfflineState(state(true, true))).toBe(false);
  });

  it('connected but verified UNREACHABLE is offline', () => {
    // Captive-portal wifi: the radio is associated but nothing gets through.
    // Trusting isConnected alone would leave a member staring at spinners.
    expect(isOfflineState(state(true, false))).toBe(true);
  });

  it('not connected is offline regardless of reachability', () => {
    expect(isOfflineState(state(false, true))).toBe(true);
    expect(isOfflineState(state(false, false))).toBe(true);
    expect(isOfflineState(state(false, null))).toBe(true);
  });
});

describe('isOfflineState — the three-valued trap', () => {
  it('connected with UNKNOWN reachability is treated as ONLINE', () => {
    // isInternetReachable is null while NetInfo is still probing, which is the
    // state at every cold start. Calling that offline would flash a false
    // offline banner on launch, before the first check even returns.
    expect(isOfflineState(state(true, null))).toBe(false);
  });

  it('a missing reachability field behaves the same as unknown', () => {
    expect(isOfflineState({ isConnected: true, isInternetReachable: undefined } as never)).toBe(false);
  });

  it('null isConnected is offline — unknown connection is not assumed good', () => {
    // The asymmetry is deliberate: an unknown CONNECTION is offline, an unknown
    // REACHABILITY is online. Being wrong about the former only shows a banner;
    // being wrong about the latter hides one while writes silently fail.
    expect(isOfflineState(state(null, true))).toBe(true);
  });
});

describe('isOfflineState — exhaustive matrix', () => {
  it('covers every combination without throwing', () => {
    for (const c of [true, false, null]) {
      for (const r of [true, false, null]) {
        expect(() => isOfflineState(state(c, r))).not.toThrow();
        expect(typeof isOfflineState(state(c, r))).toBe('boolean');
      }
    }
  });

  it('ONLINE happens only when connected and not verified-unreachable', () => {
    const online: NetState[] = [];
    for (const c of [true, false, null]) {
      for (const r of [true, false, null]) {
        if (!isOfflineState(state(c, r))) online.push(state(c, r));
      }
    }
    expect(online).toEqual([
      { isConnected: true, isInternetReachable: true },
      { isConnected: true, isInternetReachable: null },
    ]);
  });
});
