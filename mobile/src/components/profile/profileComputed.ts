import { useMemo, useRef } from 'react';
import { isNarrowed } from '@/src/utils/roomFilters';
import type { ProfileVaultItem, ProfileLog, ProfileWatchlistItem, ProfileList, HalfLifeEntry, DomainLog, LedgerRating, WatchlistDecade, DecadeCount, ShelfSort } from '@/src/types';
import { LEDGER_HIGH_FLOOR, decadeOf } from '@/src/types';
import { standingFor } from '@/src/constants/standing';
import { ProfileTab } from '@/src/hooks/useProfileData';

import { colors } from '@/src/theme/theme';
import { calendarDateString } from '@/src/utils/timeAgo';
import { FORMAT_META } from '@/src/constants/formats';
import { toProfileLog, toProfileWatchlistItem, toProfileVaultItem, toProfileList } from '@/src/utils/mappers';

import {
  Archive, BookOpen, Bookmark, LayoutList, Disc, Projector,
} from 'lucide-react-native';

// ════════════════════════════════════════════════════════════
// PROFILE COMPUTED VALUES — what the profile screen derives
// ════════════════════════════════════════════════════════════

export interface SocialLink {
  title: string;
  url: string;
}

interface UseProfileComputedParams {
  isSelf: boolean;
  myLogs: DomainLog[];
  myWatchlist: any[];
  myVault: any[];
  myLists: any[];
  mainLogs: ProfileLog[];
  archiveLogs: ProfileLog[];
  ledgerLogs: ProfileLog[];
  analyticsLogs: ProfileLog[];
  watchlist: ProfileWatchlistItem[];
  vault: ProfileVaultItem[];
  lists: ProfileList[];
  counts: { logs: number; ledger: number; watchlist: number; vault: number; lists: number };
  isArchivistPlus: boolean;
  isAuteurPlus: boolean;
  targetUser: any;
  username: string;
  serverStreak: number | null;
  // Filter state
  archiveSieve: string;
  archiveSearch?: string;
  listsSearch?: string;
  physicalSearch?: string;
  ledgerSearch: string;
  ledgerRatingFilter: LedgerRating;
  watchlistDecade: WatchlistDecade;
  watchlistSearch: string;
  watchlistSort: ShelfSort;
  physicalFilter: string | null;
  physicalSort: ShelfSort;
  listsSort: ShelfSort;
  /** The decades of the WHOLE queue, from the server; without it, the loaded page's. */
  serverDecades?: DecadeCount[] | null;
}

/**
 * The ONE reconciling of a count. Yours: never less than your device holds.
 * Another's: the server's, the page only until it lands (a max would inflate it).
 */
export function reconcileCount(serverCount: number, localLength: number, isSelf: boolean): number {
  return isSelf ? Math.max(serverCount ?? 0, localLength) : ((serverCount ?? 0) || localLength);
}

/**
 * The plain word under each invented room name, so a newcomer need not guess.
 * The Ledger's is OPINIONS: not "diary" (on Letterboxd that is the Archive),
 * nor "written" (it admits a rating with no words). One word each: it shares a
 * line with the count, about 8 characters at the largest text on a 320pt
 * phone, and holdingsFit.test.ts measures every one at every width and size.
 */
export const ROOM_GLOSS = {
  archive: 'WATCHED',
  ledger: 'OPINIONS',
  watchlist: 'TO SEE',
  lists: 'LISTS',
  physical: 'MEDIA',
  projector: 'ANALYTICS',
} as const;

/** Just the words, for the fit test — derived, never a second copy. */
export const COLLECTION_CARD_GLOSSES = Object.values(ROOM_GLOSS);

/**
 * `2,481`, or a dash for nothing, never `0`: an empty room is waiting, not a
 * score, and your own counts read 0 until the server answers.
 */
export function tally(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  // Grouped by hand: no Intl on the phone's Hermes.
  const digits = String(Math.floor(n));
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return out;
}

/**
 * Consecutive days, ending today or yesterday, with a film logged. A calendar
 * date keeps its own day and a timestamp becomes the member's LOCAL day
 * (calendarDateString): a timestamp's first ten characters are its UTC day.
 */
export function computeDailyStreak(
  logs: { watchedDate?: string | null; createdAt?: string | null }[],
  now: Date = new Date(),
): number {
  const dates = new Set<string>();
  for (const log of logs) {
    const key = calendarDateString(log?.watchedDate ?? log?.createdAt);
    if (key) dates.add(key);
  }

  let count = 0;
  // Bounded by the days logged: a streak is never longer, and nothing can spin.
  for (let i = 0; i <= dates.size + 1; i++) {
    const check = new Date(now);
    check.setDate(check.getDate() - i);
    const key = `${check.getFullYear()}-${String(check.getMonth() + 1).padStart(2, '0')}-${String(check.getDate()).padStart(2, '0')}`;

    if (dates.has(key)) count++;
    else if (i === 0) continue;  // today may still be missed without ending the streak
    else break;
  }
  return count;
}

/**
 * The decades a queue spans: the server's (the WHOLE queue) when it answered,
 * else the loaded page's. The loaded page alone drops CHIPS: a 1940s film on
 * page eight would have no filter to reach it. An empty server array means
 * "not answered" (a non-empty queue has at least one decade).
 */
export function decadeCounts(
  server: DecadeCount[] | null | undefined,
  fromLoadedPage: () => DecadeCount[],
): DecadeCount[] {
  if (Array.isArray(server) && server.length > 0) {
    // Newest decade first. Sorted on a copy: the payload is shared state.
    return [...server].sort((a, b) => b.decade - a.decade);
  }
  return fromLoadedPage();
}

/** Tally the decades present in a list of films, newest first. */
export function decadesOfLoaded(films: { year?: number | null }[]): DecadeCount[] {
  const tally: Record<number, number> = {};
  for (const film of films) {
    const d = decadeOf(film.year);
    if (d === null) continue;
    tally[d] = (tally[d] || 0) + 1;
  }
  return Object.entries(tally)
    .map(([decade, count]) => ({ decade: Number(decade), count }))
    .sort((a, b) => b.decade - a.decade);
}

export function useProfileComputed(params: UseProfileComputedParams) {
  const {
    isSelf, myLogs, myWatchlist, myVault, myLists,
    mainLogs, archiveLogs, ledgerLogs, analyticsLogs, watchlist, vault, lists,
    counts, isArchivistPlus, isAuteurPlus, targetUser, serverStreak,
    archiveSieve, archiveSearch, listsSearch, physicalSearch, ledgerSearch, ledgerRatingFilter,
    watchlistSearch, watchlistSort, watchlistDecade,
    physicalFilter, physicalSort, listsSort, serverDecades,
  } = params;

  // On your OWN profile each flag decides whether a room reads the SERVER's
  // filtered page or the unfiltered local store, so it names EVERY filter: one
  // left out would be sent to the query and then ignored on screen.
  const hasArchiveSearch = isNarrowed('archive', { status: archiveSieve, search: archiveSearch });
  const hasLedgerSearch = isNarrowed('ledger', { search: ledgerSearch, rating: ledgerRatingFilter });
  const hasWatchlistSearch = isNarrowed('watchlist', { search: watchlistSearch, sort: watchlistSort, decade: watchlistDecade });
  const hasPhysicalSearch = isNarrowed('physical', { filter: physicalFilter, sort: physicalSort, search: physicalSearch });

  const displayLogs = useMemo(() => isSelf ? myLogs.map(toProfileLog) : mainLogs, [isSelf, myLogs, mainLogs]);
  
  const displayArchiveLogs = useMemo(() => {
    if (isSelf) return hasArchiveSearch ? archiveLogs : myLogs.map(toProfileLog);
    return archiveLogs;
  }, [isSelf, hasArchiveSearch, archiveLogs, myLogs]);

  const displayLedgerLogs = useMemo(() => {
    if (isSelf) return hasLedgerSearch ? ledgerLogs : myLogs.map(toProfileLog);
    return ledgerLogs;
  }, [isSelf, hasLedgerSearch, ledgerLogs, myLogs]);

  const displayWatchlist = useMemo(() => {
    if (isSelf) return hasWatchlistSearch ? watchlist : myWatchlist.map(toProfileWatchlistItem);
    return watchlist;
  }, [isSelf, hasWatchlistSearch, watchlist, myWatchlist]);
  
  const displayVault = useMemo(() => {
    if (isSelf) return hasPhysicalSearch ? vault : myVault.map(toProfileVaultItem);
    return vault;
  }, [isSelf, hasPhysicalSearch, vault, myVault]);

  const displayListsRaw = useMemo(() => isSelf ? myLists.map(toProfileList) : lists, [isSelf, myLists, lists]);

  // Never blanked: see the note at the end of this file on `hide_stats`.
  const totalFilms = reconcileCount(counts.logs, displayLogs.length, isSelf);

  /** The member's standing, from the one ladder the badges use too. */
  const standing = useMemo(() => standingFor(totalFilms), [totalFilms]);
  const statsLevel = standing.name;
  const statsColor = standing.color;
  const statsProgress = standing.progress;

  // Daily streak
  const streak = useMemo(() => {
    if (serverStreak !== null) return serverStreak;
    const sourceLogs = analyticsLogs.length > 0 ? analyticsLogs : displayLogs;
    return computeDailyStreak(sourceLogs);
  }, [serverStreak, displayLogs, analyticsLogs]);

  // Archive filtering
  const archiveFiltered = useMemo(() => {
    let result = displayArchiveLogs;
    if (archiveSieve !== 'all') result = result.filter(l => l.status === archiveSieve);
    // TITLES ONLY, matching the server. The Ledger is the room for searching
    // writing; here, a film surfacing because its REVIEW says "boring" — with
    // nothing on screen explaining why — is a bewildering result.
    if (archiveSearch?.trim()) {
      const q = archiveSearch.trim().toLowerCase();
      result = result.filter(l => (l.title ?? '').toLowerCase().includes(q));
    }
    return result;
  }, [displayArchiveLogs, archiveSieve, archiveSearch]);

  // Ledger filtering (rated/reviewed only). Posterless logs are NOT excluded —
  // a member's review must never vanish because TMDB lacks art; the grid's
  // ProfilePosterCard already renders a designed placeholder for them, and the
  // ledger COUNT (get_profile_counts v3) counts them. Door = room, exactly.
  const ledgerFiltered = useMemo(() => {
    return displayLedgerLogs.filter(log => {
      if (!log.rating && !log.review) return false;
      // `'high'` is a range, so it cannot be an equality check — and it has to
      // be tested BEFORE the numeric one, or `log.rating !== 'high'` is true for
      // every entry and the filter hides the whole ledger.
      if (ledgerRatingFilter === 'high') {
        if (!log.rating || log.rating < LEDGER_HIGH_FLOOR) return false;
      } else if (ledgerRatingFilter !== 'all' && log.rating !== ledgerRatingFilter) return false;
      if (ledgerSearch.trim() && !(log.title || '').toLowerCase().includes(ledgerSearch.toLowerCase())) return false;
      return true;
    });
  }, [displayLedgerLogs, ledgerSearch, ledgerRatingFilter]);

  // Half-life: how a member's rating of a film has moved across rewatches.
  const halfLifeMap = useMemo(() => {
    // It needs the WHOLE history; a paged window would give false trajectories.
    let sourceLogs: ProfileLog[] = [];
    if (isSelf || isAuteurPlus) {
      sourceLogs = analyticsLogs;
    } else {
      // A visitor to a non-Auteur is not sent the whole history, so: none.
      return {};
    }

    if (sourceLogs.length === 0) return {};
    // Each entry keeps its index, to order two logs with the same timestamp.
    const byFilm: Record<number, { rating: number; timestamp: number; orderIndex: number }[]> = {};
    for (let i = 0; i < sourceLogs.length; i++) {
      const log = sourceLogs[i];
      if (!log.filmId || !log.rating) continue;
      if (!byFilm[log.filmId]) byFilm[log.filmId] = [];
      const d = log.watchedDate ?? log.createdAt;
      let ts = Date.now();
      if (d) {
        const parsedTs = new Date(d).getTime();
        if (!isNaN(parsedTs)) ts = parsedTs;
      }
      byFilm[log.filmId].push({ rating: log.rating, timestamp: ts, orderIndex: i });
    }
    const result: Record<number, HalfLifeEntry> = {};
    for (const [filmId, entries] of Object.entries(byFilm)) {
      if (entries.length < 2) continue;
      // Oldest first; the logs arrive newest-first, so a higher index is older.
      const sorted = [...entries].sort((a, b) => (a.timestamp - b.timestamp) || (b.orderIndex - a.orderIndex));
      const first = sorted[0].rating, last = sorted[sorted.length - 1].rating;
      result[Number(filmId)] = { count: sorted.length, trajectory: last > first ? 'ASCENDING' : last < first ? 'DECAYING' : 'ETERNAL', delta: last - first };
    }
    return result;
  }, [isSelf, isAuteurPlus, analyticsLogs]);

  // Watchlist filtering
  const watchlistFiltered = useMemo(() => {
    let result = [...displayWatchlist];
    if (watchlistSearch.trim()) {
      const q = watchlistSearch.toLowerCase();
      result = result.filter(f => (f.title ?? '').toLowerCase().includes(q));
    }
    // A film with no year on record belongs to no decade, so a decade filter
    // hides it — the same way the Vault's format filter hides an unfiled copy.
    if (typeof watchlistDecade === 'number') {
      result = result.filter(f => decadeOf(f.year) === watchlistDecade);
    }
    if (watchlistSort === 'az') result.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
    else if (watchlistSort === 'za') result.sort((a, b) => (b.title ?? '').localeCompare(a.title ?? ''));
    return result;
  }, [displayWatchlist, watchlistSearch, watchlistSort, watchlistDecade]);

  // The decade chips, newest first. `decadeCounts` alone decides server or page
  // (a second test of it here could drift from the tested one); the page's
  // count is a thunk, unevaluated when the server answered.
  const decadeCountsRef = useRef<DecadeCount[]>([]);
  const watchlistDecadeCounts = useMemo(() => {
    return decadeCounts(serverDecades, () => {
      // Held in a ref while a decade is selected: the filtered page contains
      // only that decade, so recomputing would collapse the row to a single
      // chip and leave no way back to the others.
      if (watchlistDecade !== null) return decadeCountsRef.current;
      const computed = decadesOfLoaded(displayWatchlist);
      decadeCountsRef.current = computed;
      return computed;
    });
  }, [displayWatchlist, watchlistDecade, serverDecades]);

  /**
   * One A–Z for every room, close to the server's order so your own shelf
   * (sorted here) and a visitor's (sorted by Postgres) agree. `localeCompare`
   * with no locale and no options: no Intl on the phone.
   */
  const byShelfSort = <T extends { title?: string | null }>(items: T[], sort: ShelfSort): T[] => {
    if (sort === 'default') return items;
    const out = [...items];
    out.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
    return sort === 'za' ? out.reverse() : out;
  };

  // The Stacks take the same three orders, through the same comparator.
  const displayLists = useMemo(
    () => byShelfSort(
      listsSearch?.trim()
        ? displayListsRaw.filter((l) => {
            const q = listsSearch.trim().toLowerCase();
            return (l.title ?? '').toLowerCase().includes(q)
              || (l.description ?? '').toLowerCase().includes(q);
          })
        : displayListsRaw,
      listsSort,
    ),
     
    [displayListsRaw, listsSort, listsSearch],
  );

  // Physical archive filtering
  const physicalFiltered = useMemo(() => {
    let base = physicalFilter
      ? displayVault.filter((item: ProfileVaultItem) => item.formats?.includes(physicalFilter))
      : displayVault;
    // Title AND the member's own notes, matching the server exactly — "the one
    // Dad gave me" is how somebody actually looks for a disc.
    if (physicalSearch?.trim()) {
      const q = physicalSearch.trim().toLowerCase();
      base = base.filter((i) => (i.title ?? '').toLowerCase().includes(q)
        || (i.notes ?? '').toLowerCase().includes(q));
    }
    return byShelfSort(base, physicalSort);
   
  }, [displayVault, physicalFilter, physicalSort, physicalSearch]);

  // Held while a format is chosen: the filtered page has only that format.
  const formatCountsRef = useRef<any[]>([]);

  const physicalFormatCounts = useMemo(() => {
    if (physicalFilter) {
      return formatCountsRef.current;
    }
    const fmtCounts: Record<string, number> = {};
    for (const item of displayVault) {
      if (!item.formats) continue;
      for (const fmt of item.formats) {
        fmtCounts[fmt] = (fmtCounts[fmt] || 0) + 1;
      }
    }
    const computed = Object.entries(fmtCounts).map(([id, count]) => {
      const meta = FORMAT_META[id] || { label: id.toUpperCase(), color: colors.fog };
      return { id, ...meta, count };
    });
    formatCountsRef.current = computed;
    return computed;
  }, [displayVault, physicalFilter]);

  /** LATELY: the last three films, posters or not. */
  const recentLogs = useMemo(() => displayLogs.slice(0, 3), [displayLogs]);

  // Social links: an array of {title, url}, or an object of name → url.
  const socialLinks = useMemo(() => {
    const raw = targetUser?.social_links ?? [];
    if (Array.isArray(raw)) {
      return raw.filter((l: any) => l && typeof l === 'object' && typeof l.url === 'string' && l.url.trim().length > 0) as SocialLink[];
    }
    if (raw && typeof raw === 'object') {
      return Object.entries(raw)
        .filter(([, v]) => typeof v === 'string' && v.trim().length > 0)
        .map(([k, v]) => ({ title: k.charAt(0).toUpperCase() + k.slice(1), url: (v as string).trim() }));
    }
    return [] as SocialLink[];
  }, [targetUser]);

  // Every count on the screen, reconciled once: one number per collection.
  const totalLedger = reconcileCount(counts.ledger, displayLogs.filter(l => l.rating > 0 || (l.review && l.review.length > 0)).length, isSelf);
  const totalWatchlist = reconcileCount(counts.watchlist, displayWatchlist.length, isSelf);
  const totalLists = reconcileCount(counts.lists, displayLists.length, isSelf);
  const totalVault = reconcileCount(counts.vault, displayVault.length, isSelf);

  // The six rooms. `locked` is the OWNER's rank (a key, then the velvet rope);
  // the Projector is a room, not a count: ★, never "0".
  const COLLECTION_CARDS = useMemo(() => [
    { id: 'archive' as ProfileTab, label: 'ARCHIVE', desc: ROOM_GLOSS.archive, count: tally(totalFilms), Icon: Archive, disabled: false, highlight: false, locked: false },
    { id: 'ledger' as ProfileTab, label: 'LEDGER', desc: ROOM_GLOSS.ledger, count: tally(totalLedger), Icon: BookOpen, disabled: false, highlight: false, locked: false },
    { id: 'watchlist' as ProfileTab, label: 'WATCHLIST', desc: ROOM_GLOSS.watchlist, count: tally(totalWatchlist), Icon: Bookmark, disabled: false, highlight: false, locked: false },
    { id: 'lists' as ProfileTab, label: 'STACKS', desc: ROOM_GLOSS.lists, count: tally(totalLists), Icon: LayoutList, disabled: false, highlight: false, locked: false },
    { id: 'physical' as ProfileTab, label: 'PHYSICAL', desc: ROOM_GLOSS.physical, count: isArchivistPlus ? tally(totalVault) : '✦', Icon: Disc, disabled: false, highlight: false, locked: !isArchivistPlus },
    { id: 'projector' as ProfileTab, label: 'PROJECTOR', desc: ROOM_GLOSS.projector, count: '★', Icon: Projector, disabled: false, highlight: true, locked: false },
  ], [totalLedger, totalWatchlist, totalLists, totalVault, isArchivistPlus, totalFilms]);

  return {
    displayLogs, displayWatchlist, displayVault, displayLists,
    totalFilms, statsLevel, statsColor, statsProgress,
    streak, archiveFiltered, ledgerFiltered, halfLifeMap,
    // For each StatCard: the same reconciled numbers the rooms show.
    totalWatchlist, totalLedger, totalLists, totalVault,
    watchlistFiltered, watchlistDecadeCounts, physicalFiltered, physicalFormatCounts,
    recentLogs, socialLinks, COLLECTION_CARDS,
  };
}

/**
 * ── NO "HIDE MY STATS" ───────────────────────────────────────────────────────
 * A switch that blanks the figures would withhold nothing: `get_profile_counts`
 * answers any caller `can_view_user_data` allows, and the films themselves are
 * one tab away to count by hand. A control that says "private" and is not is
 * worse than none. Privacy is `is_social_private`, enforced in the database on
 * every read. A real "hide my volume" must start server-side and hide the
 * CONTENT too.
 */
