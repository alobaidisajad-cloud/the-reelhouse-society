import { storage, setSensitive } from '@/src/stores/mmkv-storage';
import { registerStoreReset } from '@/src/stores/resetAllStores';

const KEY = 'reelhouse_profile_counts';

export type CachedCounts = {
  logs: number;
  ledger: number;
  watchlist: number;
  vault: number;
  lists: number;
};

const FIELDS: (keyof CachedCounts)[] = ['logs', 'ledger', 'watchlist', 'vault', 'lists'];

/**
 * The last known true counts for your own dossier.
 *
 * Your own profile paints at once from cached data and refreshes behind it. The
 * film store holds only a window of your rows (the latest 150), so without these
 * the first paint would count the window, not the collection. The counts are
 * exact when they arrive and rarely change between sessions, so the first paint
 * shows the last true set and the refresh corrects it in the same beat.
 *
 * Keyed by user id, so a second account on the same device is never shown the
 * first one's totals.
 */
export function readCachedCounts(userId: string | null | undefined): CachedCounts | null {
  const uid = (userId ?? '').trim();
  if (!uid) return null;
  try {
    const raw = storage.getString(`${KEY}_${uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Record<keyof CachedCounts, unknown>>;
    const out = {} as CachedCounts;
    for (const f of FIELDS) {
      const v = parsed?.[f];
      // A corrupt entry must not paint a nonsense total onto the member's own profile.
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
      out[f] = Math.floor(v);
    }
    return out;
  } catch {
    return null;
  }
}

export function writeCachedCounts(userId: string | null | undefined, counts: Partial<CachedCounts> | null | undefined): void {
  const uid = (userId ?? '').trim();
  if (!uid || !counts) return;
  const out = {} as CachedCounts;
  for (const f of FIELDS) {
    const v = counts[f];
    // Never cache a partial read. A missing count would be stored as 0 and then seed a
    // zero on the next cold start — the exact bug this exists to remove.
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return;
    out[f] = Math.floor(v);
  }
  try {
    setSensitive(`${KEY}_${uid}`, JSON.stringify(out));
  } catch { /* a smoother first frame is never worth a crash */ }
}

export function clearCachedCounts(userId: string | null | undefined): void {
  const uid = (userId ?? '').trim();
  if (!uid) return;
  try { storage.delete(`${KEY}_${uid}`); } catch { /* nothing to do */ }
}

/** Sign-out erases the signed-out member's counts. Registered here, beside the cache it clears. */
registerStoreReset((previousUserId) => {
  clearCachedCounts(previousUserId);
});
