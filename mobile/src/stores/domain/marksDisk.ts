/**
 * marksDisk — the marks ledger as the phone keeps it between launches (films.ts persists it
 * with the member's other records, encrypted, and deletes it with them at sign-out).
 *
 * Kept light: a log's film, status, rating, viewings, date and title, never its words; a
 * watchlist's films. Read back at launch, it is the ledger as it was last held, so a phone
 * opened without a signal still knows what its member has seen; the launch's own read
 * (marksLedger.ts) brings it up to date.
 */
import type { DomainLog } from '../../types';

export interface LedgerOnDisk {
  logs: Pick<DomainLog, 'id' | 'filmId' | 'title' | 'poster' | 'year' | 'rating' | 'status' | 'viewCount' | 'watchedDate'>[];
  saved: number[];
}

/** The ledger to keep: only once it is held whole, and only what it needs. */
export function ledgerToDisk(state: {
  marksKnown: string; _loggedIndex: Record<number, DomainLog>; _watchlistIndex: Record<number, true>;
}): LedgerOnDisk | null {
  if (state.marksKnown !== 'held') return null;
  return {
    logs: Object.values(state._loggedIndex).map((l) => ({
      id: l.id, filmId: l.filmId, title: l.title, poster: l.poster ?? null, year: l.year,
      rating: l.rating, status: l.status, viewCount: l.viewCount, watchedDate: l.watchedDate ?? null,
    })),
    saved: Object.keys(state._watchlistIndex).map(Number),
  };
}

/** The ledger kept, with the records kept beside it laid over: the indexes, held. */
export function ledgerFromDisk(
  disk: LedgerOnDisk,
  logs: readonly DomainLog[],
  watchlist: readonly { id: number }[],
): { _loggedIndex: Record<number, DomainLog>; _watchlistIndex: Record<number, true> } {
  const logged: Record<number, DomainLog> = {};
  for (const l of disk.logs) if (l.filmId) logged[l.filmId] = { ...l, light: true } as DomainLog;
  for (const l of logs) if (l.filmId) logged[l.filmId] = l;
  const saved: Record<number, true> = {};
  for (const id of disk.saved) saved[id] = true;
  for (const w of watchlist) saved[w.id] = true;
  return { _loggedIndex: logged, _watchlistIndex: saved };
}
