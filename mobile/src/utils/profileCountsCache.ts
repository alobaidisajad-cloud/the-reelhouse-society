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
 * ────────────────────────────────────────────────
 * Opening your own profile is already instant: useProfileData seeds the screen from the
 * cached auth user and drops the spinner, then refreshes in the background. But it had
 * nothing to seed the COUNTS from, so it seeded zeros — and reconcileCount, which for
 * your own profile takes `Math.max(server, locallyLoaded)`, fell back to counting the
 * rows the film store happens to be holding.
 *
 * That array is a WINDOW, not the collection: films.ts persists only the most recent
 * 150 entries. So a member with 815 watchlist items opened their profile, saw 150 for
 * about a third of a second, and watched it jump. Nothing was wrong — but the first
 * number the app showed them about themselves was false, and a number that changes
 * under you is the kind of detail that makes an app feel approximate.
 *
 * The counts are exact when they arrive, so the last set is worth keeping. Seeding from
 * it means the first paint shows 815 — right, in the overwhelming majority of opens,
 * because between two sessions a watchlist rarely changes at all, and the background
 * refresh corrects it either way within the same beat.
 *
 * WHY NOT the alternatives:
 *   • denormalise the counts onto profiles — five more triggers and a schema change to
 *     avoid one cold-start frame, on data that is already exact and already cached
 *   • widen the persist window — that window is a deliberate memory decision, and
 *     making it 815 for one member does nothing for the member with 3000
 *   • show a spinner until the counts land — replaces a wrong number with no number,
 *     on the screen the cache-first path exists specifically to make instant
 *
 * Keyed by user id, so a second account on the same device can never be shown the
 * first one's totals for even one frame.
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

/**
 * Wire the eraser above to logout.
 *
 * It was written, exported and unit-tested — and never called once by the app,
 * while 24 sites wrote to this cache. So a member's profile totals stayed on the
 * device after they signed out, indefinitely. Existing is not the same as wired.
 *
 * Registered beside the cache it clears rather than in auth.ts's delete list,
 * for the same reason as the follow caches: that list is what this was missed
 * from, and a list maintained somewhere else will be missed from again.
 */
registerStoreReset((previousUserId) => {
  clearCachedCounts(previousUserId);
});
