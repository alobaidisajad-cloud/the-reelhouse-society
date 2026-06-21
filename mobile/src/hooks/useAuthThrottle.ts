/**
 * useAuthThrottle.ts — Client-Side Auth Rate Limiter
 * ──────────────────────────────────────────────────
 * 10/10 S-03: Prevents brute-force auth spam from the client side.
 * Max 5 attempts per 60 seconds. Shows countdown timer on lockout.
 * Upgraded to use MMKV storage to persist lockout across app restarts.
 * 
 * Usage:
 *   const { canAttempt, recordAttempt, secondsRemaining } = useAuthThrottle();
 *   
 *   const handleLogin = () => {
 *     if (!canAttempt) {
 *       reelToast.error(`Too many attempts. Try again in ${secondsRemaining}s.`);
 *       return;
 *     }
 *     recordAttempt();
 *     // ... actual login
 *   };
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { storage } from '@/src/stores/mmkv-storage';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000; // 60 seconds
const STORAGE_KEY = 'auth_throttle_attempts';

export function useAuthThrottle() {
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Read initial attempts from storage on mount
  const attemptsRef = useRef<number[]>([]);
  
  useEffect(() => {
    try {
      const stored = storage.getString(STORAGE_KEY);
      if (stored) {
        attemptsRef.current = JSON.parse(stored);
        evaluateLockout();
      }
    } catch {
      // Corrupt JSON, reset
      attemptsRef.current = [];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const evaluateLockout = useCallback(() => {
    const now = Date.now();
    // Prune old attempts outside the window
    attemptsRef.current = attemptsRef.current.filter(t => now - t < WINDOW_MS);
    
    // Save pruned state
    try {
      storage.set(STORAGE_KEY, JSON.stringify(attemptsRef.current));
    } catch {}

    if (attemptsRef.current.length >= MAX_ATTEMPTS) {
      // Calculate when the earliest attempt expires
      const oldestInWindow = attemptsRef.current[0];
      const unlockAt = oldestInWindow + WINDOW_MS;
      const remaining = Math.ceil((unlockAt - now) / 1000);
      
      if (remaining > 0) {
        setSecondsRemaining(remaining);
        cleanup();
        timerRef.current = setInterval(() => {
          const left = Math.ceil((unlockAt - Date.now()) / 1000);
          if (left <= 0) {
            setSecondsRemaining(0);
            cleanup();
            // Free the lockout explicitly
            attemptsRef.current = [];
            storage.delete(STORAGE_KEY);
          } else {
            setSecondsRemaining(left);
          }
        }, 1000);
      }
    }
  }, [cleanup]);

  const canAttempt = secondsRemaining <= 0;

  const recordAttempt = useCallback(() => {
    const now = Date.now();
    attemptsRef.current.push(now);
    evaluateLockout();
  }, [evaluateLockout]);

  return { canAttempt, recordAttempt, secondsRemaining };
}
