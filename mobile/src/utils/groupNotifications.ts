import { AppNotification } from '../stores/notificationStore';
import { describeGroup, parseGroupKey } from './endorsementGroupKey';

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
  // The server declares this. Both previous legs were dead: film_id was never written
  // by the trigger, and the message regex expected wording a migration had already
  // replaced. Reading a declared key means a copy change can never disable grouping
  // again — which is precisely how it was disabled the first time.
  //
  // Only a key this client UNDERSTANDS may group. Returning any string would let a key
  // from a newer server (say endorse:screening:…) form a group that then falls back to
  // the log wording — labelling it "certified your log of …". Unknown means ungrouped,
  // which renders as ordinary individual rows: correct, just not collapsed.
  // Only endorsements group. This check was in the original and is KEPT: the key's
  // prefix already implies the type, but that equivalence holds only while every writer
  // stays disciplined about which rows receive a key. Two independent conditions cost
  // one comparison and mean a mislabelled row cannot be rendered as an endorse group.
  if (n.type !== 'endorse') return null;

  return parseGroupKey(n.group_key) ? (n.group_key as string) : null;
}

/**
 * The name of the thing that was certified — a film, a stack, or a dossier.
 *
 * Read from a column. The previous version matched /your review of (.+)$/ against the
 * message and fell back to the literal string "your review", so a working group would
 * have rendered "…endorsed your review of your review".
 */
export function groupTitle(n: AppNotification): string | undefined {
  return n.title;
}

// `extractFilmName` was deleted rather than repaired. It matched the message against
// /your review of (.+)$/ — wording a migration replaced long ago — and fell back to the
// literal string "your review", so a working group would have rendered
// "…endorsed your review of your review". Repairing the pattern to match today's copy
// would have re-armed the same trap for the next copy edit; `groupTitle` reads a column
// instead, and the label is now the writer's responsibility.

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
        message: describeGroup(items.length, parseGroupKey(key)?.kind ?? 'log', groupTitle(mostRecent)),
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
