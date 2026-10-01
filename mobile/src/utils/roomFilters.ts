/**
 * roomFilters.ts — whether a profile room is narrowed by any of its filters.
 *
 * One answer for every place that asks: which page a room shows (the server's
 * filtered page, or the unfiltered store), which page "load more" reads, and
 * whether a refresh may reseed it with the unfiltered rows. A filter named in
 * one of those places and missed in another sends a filtered room an unfiltered
 * page: a search for "noir" that grows by the whole archive.
 */
export interface RoomFilters {
  archive: { status?: string; search?: string };
  ledger: { search?: string; rating?: string | number };
  watchlist: { search?: string; sort?: string; decade?: number | null };
  physical: { filter?: string | null; sort?: string; search?: string };
  lists: { sort?: string; search?: string };
}

export type Room = keyof RoomFilters;

export const ROOMS: readonly Room[] = ['archive', 'ledger', 'watchlist', 'physical', 'lists'];

const said = (s?: string) => !!s && s.trim() !== '';
const sorted = (s?: string) => (s ?? 'default') !== 'default';

export function isNarrowed<R extends Room>(room: R, filters: RoomFilters[R] | null | undefined): boolean {
  if (!filters) return false;
  switch (room) {
    case 'archive': {
      const f = filters as RoomFilters['archive'];
      return (f.status ?? 'all') !== 'all' || said(f.search);
    }
    case 'ledger': {
      const f = filters as RoomFilters['ledger'];
      return said(f.search) || (f.rating ?? 'all') !== 'all';
    }
    case 'watchlist': {
      const f = filters as RoomFilters['watchlist'];
      return said(f.search) || sorted(f.sort) || f.decade != null;
    }
    case 'physical': {
      // No format chip is null (or not yet set), never 'all'.
      const f = filters as RoomFilters['physical'];
      return f.filter != null || sorted(f.sort) || said(f.search);
    }
    case 'lists': {
      const f = filters as RoomFilters['lists'];
      return sorted(f.sort) || said(f.search);
    }
    default:
      return false;
  }
}
