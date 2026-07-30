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

export const MAX_ATTEMPTS = 5;
export const WINDOW_MS = 60_000; // 60 seconds
const STORAGE_KEY = 'auth_throttle_attempts';

/**
 * The whole throttle decision, as a pure function — no React, no MMKV, no timers.
 *
 * Extracted so the rule can be tested directly: renderHook is async in this
 * environment (see the note in useAuthThrottle.pbt.test.ts's predecessor), and
 * this is a security control, so "we think it locks out" is not good enough.
 *
 * @param attempts epoch-ms of prior attempts, oldest first
 * @param now      injected so lockout timing is deterministic in tests
 */
export function evaluateAuthThrottle(
  attempts: number[],
  now: number,
): { pruned: number[]; locked: boolean; secondsRemaining: number } {
  // Only attempts inside the window count — anything older has expired.
  // Non-finite entries would survive every comparison and wedge the lockout
  // permanently, so they are dropped rather than trusted.
  const pruned = attempts.filter(t => Number.isFinite(t) && now - t < WINDOW_MS);

  if (pruned.length < MAX_ATTEMPTS) return { pruned, locked: false, secondsRemaining: 0 };

  // Locked until the OLDEST attempt in the window expires — a rolling window,
  // not a fixed penalty, so one more attempt cannot extend an existing lockout.
  const unlockAt = Math.min(...pruned) + WINDOW_MS;
  const secondsRemaining = Math.max(0, Math.ceil((unlockAt - now) / 1000));
  return { pruned, locked: secondsRemaining > 0, secondsRemaining };
}

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
    // The rule itself lives in evaluateAuthThrottle (pure, directly tested).
    // This hook is now only the plumbing around it: storage and the countdown.
    const { pruned, locked, secondsRemaining: remaining } = evaluateAuthThrottle(attemptsRef.current, now);
    attemptsRef.current = pruned;

    // Save pruned state
    try {
      storage.set(STORAGE_KEY, JSON.stringify(attemptsRef.current));
    } catch {}

    if (locked) {
      const unlockAt = Math.min(...attemptsRef.current) + WINDOW_MS;
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
  }, [cleanup]);

  const canAttempt = secondsRemaining <= 0;

  const recordAttempt = useCallback(() => {
    const now = Date.now();
    attemptsRef.current.push(now);
    evaluateLockout();
  }, [evaluateLockout]);

  return { canAttempt, recordAttempt, secondsRemaining };
}
