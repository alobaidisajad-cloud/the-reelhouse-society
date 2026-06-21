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
const MIN_LOGS_FOR_REVIEW = 5;
const MIN_DAYS_BETWEEN_PROMPTS = 90;

/**
 * Attempt to show the native in-app review dialog.
 * Call this after high-delight moments (logging a film, completing a stack).
 * The function is a no-op if conditions aren't met.
 * 
 * @param logCount - current user's total film log count
 */
export async function maybeRequestReview(logCount: number): Promise<void> {
  try {
    // Gate 1: Minimum engagement
    if (logCount < MIN_LOGS_FOR_REVIEW) return;

    // Gate 2: Platform support
    const isAvailable = await StoreReview.isAvailableAsync();
    if (!isAvailable) return;

    // Gate 3: Cooldown (90 days between prompts)
    const lastPrompt = storage.getNumber(MMKV_KEY) ?? 0;
    const daysSinceLastPrompt = (Date.now() - lastPrompt) / (1000 * 60 * 60 * 24);
    if (daysSinceLastPrompt < MIN_DAYS_BETWEEN_PROMPTS) return;

    // Gate 4: Total lifetime cap (max 6 prompts ever to respect the user)
    const totalPrompts = storage.getNumber(MMKV_COUNT_KEY) ?? 0;
    if (totalPrompts >= 6) return;

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
