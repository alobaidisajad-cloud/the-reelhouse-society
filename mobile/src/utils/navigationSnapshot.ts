/**
 * navigationSnapshot — Crash recovery via navigation state persistence.
 * ─────────────────────────────────────────────────────────────────────
 * On AppState → background, snapshot { activeTab, timestamp }
 * to MMKV. On cold start, if snapshot is <5 min old, restore the user's
 * last active tab to preserve context across OOM kills and OS-initiated
 * terminations.
 *
 * Usage:
 *   // In AppBootstrapper (background save):
 *   import { saveNavigationSnapshot } from '@/src/utils/navigationSnapshot';
 *   AppState.addEventListener('change', (state) => {
 *     if (state === 'background') saveNavigationSnapshot(currentTab);
 *   });
 *
 *   // In _layout.tsx (cold start restore):
 *   import { consumeNavigationSnapshot } from '@/src/utils/navigationSnapshot';
 *   const snapshot = consumeNavigationSnapshot();
 *   if (snapshot) (router.replace as any)(snapshot.activeTab);
 */

import { storage } from '@/src/stores/mmkv-storage';
import { logger } from './logger';

const SNAPSHOT_KEY = 'nav_snapshot';
const SNAPSHOT_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

interface NavigationSnapshot {
  /** The last active tab route (e.g., '/(tabs)/pulse') */
  activeTab: string;
  /** ISO timestamp of when the snapshot was taken */
  timestamp: number;
}

/**
 * Save the current navigation state to MMKV.
 * Called when app transitions to background.
 */
export function saveNavigationSnapshot(activeTab: string): void {
  try {
    const snapshot: NavigationSnapshot = {
      activeTab,
      timestamp: Date.now(),
    };
    storage.set(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch (e) {
    logger.warn('[NavSnapshot] Failed to save:', e);
  }
}

/**
 * Consume (read and delete) the navigation snapshot.
 * Returns the snapshot if it's fresh enough, or null if expired/missing.
 * The snapshot is deleted after reading to prevent stale restores.
 */
export function consumeNavigationSnapshot(): NavigationSnapshot | null {
  try {
    const raw = storage.getString(SNAPSHOT_KEY);
    // Always delete after reading — one-shot consumption
    storage.delete(SNAPSHOT_KEY);

    if (!raw) return null;

    const snapshot: NavigationSnapshot = JSON.parse(raw);
    const age = Date.now() - snapshot.timestamp;

    if (age > SNAPSHOT_MAX_AGE_MS) {
      logger.debug(`[NavSnapshot] Snapshot expired (${Math.round(age / 1000)}s old)`);
      return null;
    }

    logger.debug(`[NavSnapshot] Restoring to ${snapshot.activeTab} (${Math.round(age / 1000)}s old)`);
    return snapshot;
  } catch (e) {
    logger.warn('[NavSnapshot] Failed to read:', e);
    return null;
  }
}
