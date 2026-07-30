/**
 * useOfflineAware.ts — Network State Hook
 * ────────────────────────────────────────
 * Returns real-time network connectivity state so components
 * can show cached-data indicators without blocking the UI.
 *
 * Uses NetInfo for actual connectivity checks, not just
 * Wi-Fi/cellular detection.
 */
import { useEffect, useState, useRef } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export interface OfflineState {
  /** True when the device has no internet connectivity */
  isOffline: boolean;
  /** True when transitioning from offline → online (reconnecting) */
  wasOffline: boolean;
  /** Seconds the device has been continuously offline (0 when online) */
  secondsOffline: number;
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
  const [wasOffline, setWasOffline] = useState(false);
  const offlineSinceRef = useRef<number | null>(null);
  const [secondsOffline, setSecondsOffline] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const handleStateChange = (state: NetInfoState) => {
      const offline = isOfflineState(state);

      if (offline && !offlineSinceRef.current) {
        // Just went offline
        offlineSinceRef.current = Date.now();
        interval = setInterval(() => {
          if (offlineSinceRef.current) {
            setSecondsOffline(Math.floor((Date.now() - offlineSinceRef.current) / 1000));
          }
        }, 1000);
      } else if (!offline && offlineSinceRef.current) {
        // Just came back online
        offlineSinceRef.current = null;
        setSecondsOffline(0);
        setWasOffline(true);
        if (interval) clearInterval(interval);
        // Clear wasOffline after 5 seconds
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => setWasOffline(false), 5000);
      }

      setIsOffline(offline);
    };

    const unsubscribe = NetInfo.addEventListener(handleStateChange);

    return () => {
      unsubscribe();
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  return { isOffline, wasOffline, secondsOffline };
}
