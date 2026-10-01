/**
 * useOfflineAware.ts — is the device offline, from NetInfo's reachability.
 *
 * It answers that and nothing else, and changes only when the answer does: a
 * running count of seconds offline re-rendered the salon screen every second
 * while offline, for a number no screen read.
 */
import { useEffect, useState } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export interface OfflineState {
  /** True when the device has no internet connectivity */
  isOffline: boolean;
}

/**
 * Is this NetInfo state genuinely offline?
 *
 * Subtler than it looks, because `isInternetReachable` is THREE-valued:
 * true (verified), false (verified unreachable), and null/undefined while
 * NetInfo is still probing. Treating "probing" as offline would flash a false
 * offline banner on every cold start, before the first reachability check
 * returns — so an unknown reachability is trusted while `isConnected` holds.
 *
 * Extracted so this can be tested directly; the surrounding hook is timers and
 * subscription plumbing around this one decision.
 */
export function isOfflineState(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean {
  return !(state.isConnected && state.isInternetReachable !== false);
}

export function useOfflineAware(): OfflineState {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => NetInfo.addEventListener((state) => setIsOffline(isOfflineState(state))), []);

  return { isOffline };
}
