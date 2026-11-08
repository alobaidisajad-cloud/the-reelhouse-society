/**
 * keptPaper — the Dispatch opens on the paper it last read.
 * ─────────────────────────────────────────────────────────────────────────────
 * The Reel's feeds are kept on the phone (the query cache), so a cold start
 * draws them at once and reads them again beneath. The Dispatch's store kept
 * nothing, and every launch drew its skeletons until the house answered. The
 * first page of the paper as it opens (every section, latest first, not the
 * kept list) is kept here as the house sent it, for the member who read it, a
 * day at most: the query cache's own limit. Rows, not filings: they are checked
 * again as they are drawn (dispatchTypes' parseFilingRows), so a page kept by
 * an older build cannot draw a shape this one refuses from the house.
 */
import { setSensitive, storage } from '../stores/mmkv-storage';

/** A kept paper is drawn only within this long of its reading. */
export const KEPT_FOR_MS = 24 * 60 * 60 * 1000;

const keyOf = (userId: string) => `kept_paper_${userId}`;

/**
 * Written quietly, through setSensitive (the paper is read as this member reads it): a phone with
 * no room left throws from the write, and a page not kept only means the next launch reads it.
 */
export function keepPaper(userId: string, rows: unknown[], now: number = Date.now()): void {
  try {
    const kept = JSON.stringify({ at: now, rows });
    setSensitive(keyOf(userId), kept);
  } catch { /* not kept: the next launch reads the paper */ }
}

/** This member's kept paper, as the house sent it, when read within the day; else null. */
export function keptPaper(userId: string | null | undefined, now: number = Date.now()): unknown[] | null {
  if (!userId) return null;
  const raw = storage.getString(keyOf(userId));
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { at?: unknown; rows?: unknown };
    if (typeof v.at !== 'number' || !Array.isArray(v.rows)) throw new Error('not a kept paper');
    const since = now - v.at;
    return since >= 0 && since <= KEPT_FOR_MS ? v.rows : null;
  } catch {
    storage.delete(keyOf(userId));
    return null;
  }
}
