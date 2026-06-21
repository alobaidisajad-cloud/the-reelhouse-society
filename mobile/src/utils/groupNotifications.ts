import { AppNotification } from '../stores/notificationStore';

// ─── Display Item Types ───────────────────────────────────────────────────────

/** Individual notification — passes through unchanged */
export interface IndividualDisplayItem {
  kind: 'individual';
  notification: AppNotification;
}

/** Grouped notification — represents N collapsed notifications */
export interface GroupedDisplayItem {
  kind: 'group';
  /** Stable key for FlashList (e.g., "endorse:film:12345") */
  groupKey: string;
  /** All notification IDs in this group */
  ids: string[];
  /** Notification type (always 'endorse' for now) */
  type: string;
  /** Target film_id (used for navigation and poster) */
  film_id?: number;
  /** Poster path from the most recent notification */
  poster_path?: string;
  /** Pre-formatted display message */
  message: string;
  /** Timestamp of the most recent notification in group */
  created_at: string;
  /** True if ANY notification in the group is unread */
  hasUnread: boolean;
  /** Total count of notifications in group */
  count: number;
}

export type DisplayItem = IndividualDisplayItem | GroupedDisplayItem;

// ─── Constants ────────────────────────────────────────────────────────────────

const WINDOW_MS = 72 * 60 * 60 * 1000; // 72 hours
const MIN_GROUP_SIZE = 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derive a stable group key from a notification.
 * Returns null if the notification is not eligible for grouping.
 */
export function getGroupKey(n: AppNotification): string | null {
  // Only group endorsements
  if (n.type !== 'endorse') return null;

  // Group by film_id if present
  if (n.film_id) return `endorse:film:${n.film_id}`;

  // Fallback: extract target from message pattern
  const match = n.message.match(/your review of (.+)$/);
  if (match) return `endorse:msg:${match[1]}`;

  return null;
}

/**
 * Extract the film name from a notification message.
 * Falls back to "your review" if the pattern doesn't match.
 */
export function extractFilmName(n: AppNotification): string {
  const match = n.message.match(/your review of (.+)$/);
  return match?.[1] ?? 'your review';
}

// ─── Main Grouping Function ───────────────────────────────────────────────────

/**
 * Transforms a flat AppNotification[] into a DisplayItem[] where eligible
 * endorsements are collapsed into group entries.
 *
 * - Pure function: no side effects, no mutations to input
 * - O(n) single-pass algorithm
 * - Enforces minimum group size of 3
 * - Enforces 72-hour time window for eligibility
 * - Output sorted by most recent timestamp descending
 */
export function groupNotifications(
  notifications: AppNotification[],
  now: number = Date.now()
): DisplayItem[] {
  if (notifications.length === 0) return [];

  const cutoff = now - WINDOW_MS;

  // Phase 1: Single-pass bucket collection
  const buckets = new Map<string, AppNotification[]>();
  const nonGroupable: AppNotification[] = [];

  for (const n of notifications) {
    const key = getGroupKey(n);
    const timestamp = new Date(n.created_at).getTime();
    const withinWindow = !isNaN(timestamp) && timestamp >= cutoff;

    if (key && withinWindow) {
      const bucket = buckets.get(key);
      if (bucket) bucket.push(n);
      else buckets.set(key, [n]);
    } else {
      nonGroupable.push(n);
    }
  }

  // Phase 2: Emit groups or dissolve undersized buckets
  const groups: DisplayItem[] = [];
  const dissolved: AppNotification[] = [];

  for (const [key, items] of buckets) {
    if (items.length >= MIN_GROUP_SIZE) {
      // Find the most recent notification in the bucket
      let mostRecent = items[0];
      for (let i = 1; i < items.length; i++) {
        if (new Date(items[i].created_at).getTime() > new Date(mostRecent.created_at).getTime()) {
          mostRecent = items[i];
        }
      }

      groups.push({
        kind: 'group',
        groupKey: key,
        ids: items.map(n => n.id),
        type: 'endorse',
        film_id: mostRecent.film_id,
        poster_path: mostRecent.poster_path,
        message: `${items.length} cinephiles endorsed your review of ${extractFilmName(mostRecent)}`,
        created_at: mostRecent.created_at,
        hasUnread: items.some(n => !n.read),
        count: items.length,
      });
    } else {
      // Dissolve: push back as individual items
      dissolved.push(...items);
    }
  }

  // Phase 3: Build individual items from nonGroupable + dissolved
  const individuals: DisplayItem[] = [...nonGroupable, ...dissolved].map(n => ({
    kind: 'individual' as const,
    notification: n,
  }));

  // Merge groups + individuals, sort by most recent timestamp descending
  const all: DisplayItem[] = [...groups, ...individuals].sort((a, b) => {
    const tsA = a.kind === 'group' ? new Date(a.created_at).getTime() : new Date(a.notification.created_at).getTime();
    const tsB = b.kind === 'group' ? new Date(b.created_at).getTime() : new Date(b.notification.created_at).getTime();
    return tsB - tsA;
  });

  return all;
}
