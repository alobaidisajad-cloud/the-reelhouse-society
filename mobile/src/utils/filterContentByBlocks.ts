/**
 * filterContentByBlocks.ts — Content Filtering Utility (Society Report System)
 * ─────────────────────────────────────────────────────────────────────────────
 * Generic filter function that removes items authored by blocked or muted users.
 * Uses BlockStore.isHidden() for O(1) per-item membership checks, yielding
 * O(n) total time complexity over n input items.
 *
 * Never mutates the input array — always returns a new filtered copy.
 *
 * Usage:
 *   const visible = filterContentByBlocks(logs, (log) => log.user_id);
 *   const visibleMessages = filterContentByBlocks(messages, (m) => m.author_id);
 */
import { useBlockStore } from '../stores/blockStore';

/**
 * Filters out items whose author is hidden (blocked or muted).
 *
 * @param items    - The array of content items to filter.
 * @param getUserId - Callback that extracts the author's user ID from an item.
 * @returns A new array containing only items whose author is not hidden.
 */
export function filterContentByBlocks<T>(
  items: T[],
  getUserId: (item: T) => string,
): T[] {
  const { isHidden } = useBlockStore.getState();
  return items.filter((item) => !isHidden(getUserId(item)));
}
