/**
 * requestReview.ts — Smart App Store Review Prompt
 * ───────────────────────────────────────────────────
 * 10/10 F-03: Uses expo-store-review to prompt at high-delight moments.
 * Implements intelligent gating so users are only prompted when:
 *   1. They've logged at least 5 films (invested user)
 *   2. They haven't been prompted in the last 90 days
 *   3. They're in a positive flow (just logged, endorsed, etc.)
 *   4. The platform supports in-app review
 * 
 * Apple allows max 3 prompts per 365 days. We're far below that.
 */
import * as StoreReview from 'expo-store-review';
import { storage } from '@/src/stores/mmkv-storage';
import { logger } from '@/src/utils/logger';

const MMKV_KEY = 'review_last_prompt_at';
const MMKV_COUNT_KEY = 'review_prompt_count';
export const MIN_LOGS_FOR_REVIEW = 5;
export const MIN_DAYS_BETWEEN_PROMPTS = 90;
export const MAX_LIFETIME_PROMPTS = 6;

/**
 * The whole decision, as a pure function — no React, no MMKV, no StoreReview.
 * Extracted so the gates are directly testable; renderHook is async in this
 * environment (see useAuthThrottle.pbt.test.ts) and the same extraction is
 * how useInitiation's shouldInitiate is tested.
 *
 * Platform support is deliberately NOT part of this — it needs an await, and
 * it is a capability check rather than a policy decision.
 */
export function shouldRequestReview(input: {
  logCount: number;
  /** epoch ms of the last prompt; 0 when never prompted */
  lastPrompt: number;
  totalPrompts: number;
  /** epoch ms 'now', injected so the cooldown is deterministic in tests */
  now: number;
}): boolean {
  const { logCount, lastPrompt, totalPrompts, now } = input;

  // Gate 1: Minimum engagement
  if (!Number.isFinite(logCount) || logCount < MIN_LOGS_FOR_REVIEW) return false;

  // Gate 2: Lifetime cap — respect the member over the funnel
  if (totalPrompts >= MAX_LIFETIME_PROMPTS) return false;

  // Gate 3: Cooldown. lastPrompt === 0 means never prompted, which must pass
  // rather than be treated as "prompted at the epoch".
  if (lastPrompt > 0) {
    const daysSince = (now - lastPrompt) / (1000 * 60 * 60 * 24);
    if (daysSince < MIN_DAYS_BETWEEN_PROMPTS) return false;
  }

  return true;
}

/**
 * Attempt to show the native in-app review dialog.
 * Call this after high-delight moments (logging a film, completing a stack).
 * The function is a no-op if conditions aren't met.
 *
 * NOTE: Apple's review sheet is a no-op in TestFlight builds — it presents
 * nothing there. That is expected, not a failure.
 *
 * @param logCount - current user's total film log count
 */
export async function maybeRequestReview(logCount: number): Promise<void> {
  try {
    const lastPrompt = storage.getNumber(MMKV_KEY) ?? 0;
    const totalPrompts = storage.getNumber(MMKV_COUNT_KEY) ?? 0;

    // Policy gates (pure, tested in requestReview.test.ts)
    if (!shouldRequestReview({ logCount, lastPrompt, totalPrompts, now: Date.now() })) return;

    // Capability gate — needs an await, so it stays here
    const isAvailable = await StoreReview.isAvailableAsync();
    if (!isAvailable) return;

    // All gates passed — request review
    await StoreReview.requestReview();
    
    // Record the prompt
    storage.set(MMKV_KEY, Date.now());
    storage.set(MMKV_COUNT_KEY, totalPrompts + 1);
    
    logger.debug(`[StoreReview] Review requested. Total prompts: ${totalPrompts + 1}`);
  } catch (e) {
    // Never crash on review request failure
    logger.warn('[StoreReview] Failed to request review:', e);
  }
}
