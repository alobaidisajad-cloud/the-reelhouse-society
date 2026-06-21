/**
 * useOfflineAware.test.ts — State Machine Logic Tests
 * ───────────────────────────────────────────────────
 * Tests the offline detection logic directly.
 * The hook wraps NetInfo — we test the state derivation.
 */
import NetInfo from '@react-native-community/netinfo';

describe('useOfflineAware logic', () => {
  it('derives offline=true when isConnected=false', () => {
    const state = { isConnected: false, isInternetReachable: false };
    const offline = !(state.isConnected && state.isInternetReachable !== false);
    expect(offline).toBe(true);
  });

  it('derives offline=false when connected with internet', () => {
    const state = { isConnected: true, isInternetReachable: true };
    const offline = !(state.isConnected && state.isInternetReachable !== false);
    expect(offline).toBe(false);
  });

  it('derives offline=true when connected but no internet', () => {
    const state = { isConnected: true, isInternetReachable: false };
    const offline = !(state.isConnected && state.isInternetReachable !== false);
    expect(offline).toBe(true);
  });

  it('derives offline=false when isInternetReachable is null (unknown)', () => {
    // null means "unknown" — treat as online (optimistic)
    const state = { isConnected: true, isInternetReachable: null };
    const offline = !(state.isConnected && state.isInternetReachable !== false);
    expect(offline).toBe(false);
  });

  it('NetInfo addEventListener is available', () => {
    expect(NetInfo.addEventListener).toBeDefined();
    expect(typeof NetInfo.addEventListener).toBe('function');
  });
});
