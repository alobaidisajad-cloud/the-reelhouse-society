/**
 * keptPages — a tab opens on the page it last read.
 * ─────────────────────────────────────────────────────────────────────────────
 * The Reel's feeds are kept on the phone (the query cache), so a cold start
 * draws them at once and reads them again beneath. The Dispatch's and the
 * Lounge's stores kept nothing, and every launch drew skeletons until the house
 * answered. The first page of each, as it opens, is kept here as read, for the
 * member who read it, a day at most: the query cache's own limit.
 *   - 'paper': the Dispatch as it opens (every section, latest first), its rows
 *     as the house sent them, checked again as they are drawn (dispatchTypes'
 *     parseFilingRows), so a page kept by an older build cannot draw a shape
 *     this one refuses from the house;
 *   - 'lounges': the Lounge's corridor, each room as the store drew it, held to
 *     a room's shape (an id and a name) as it is read back.
 */
import { agedSince } from '../lib/waits';
import { setSensitive, storage } from '../stores/mmkv-storage';

/** A kept page is drawn only within this long of its reading. */
export const KEPT_FOR_MS = 24 * 60 * 60 * 1000;

/** The pages a tab keeps. */
export type KeptKind = 'paper' | 'lounges';

const keyOf = (kind: KeptKind, userId: string) => `kept_${kind}_${userId}`;

/**
 * Written quietly, through setSensitive (each page is read as this member reads it): a phone with
 * no room left throws from the write, and a page not kept only means the next launch reads it.
 */
export function keepPage(kind: KeptKind, userId: string, rows: unknown[], now: number = Date.now()): void {
  try {
    const kept = JSON.stringify({ at: now, rows });
    setSensitive(keyOf(kind, userId), kept);
  } catch { /* not kept: the next launch reads the page */ }
}

/** This member's kept page of this kind, as it was read, when read within the day; else null. */
export function keptPage(kind: KeptKind, userId: string | null | undefined, now: number = Date.now()): unknown[] | null {
  if (!userId) return null;
  const raw = storage.getString(keyOf(kind, userId));
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { at?: unknown; rows?: unknown };
    if (typeof v.at !== 'number' || !Array.isArray(v.rows)) throw new Error('not a kept page');
    // A stamp in the future (the clock set back since) is long past: the page is read again.
    return agedSince(v.at, now) <= KEPT_FOR_MS ? v.rows : null;
  } catch {
    storage.delete(keyOf(kind, userId));
    return null;
  }
}
