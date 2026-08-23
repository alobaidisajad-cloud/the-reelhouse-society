import { useMemo, useRef } from 'react';
import type { ProfileVaultItem, ProfileLog, ProfileWatchlistItem, ProfileList, HalfLifeEntry, DomainLog, LedgerRating, WatchlistDecade, ShelfSort } from '@/src/types';
import { LEDGER_HIGH_FLOOR, decadeOf } from '@/src/types';
import { ProfileTab } from '@/src/hooks/useProfileData';

import { colors } from '@/src/theme/theme';
import { calendarDateString } from '@/src/utils/timeAgo';
import { FORMAT_META } from '@/src/constants/formats';
import { toProfileLog, toProfileWatchlistItem, toProfileVaultItem, toProfileList } from '@/src/utils/mappers';

import {
  Archive, BookOpen, Bookmark, LayoutList, Disc, Projector,
} from 'lucide-react-native';

// ════════════════════════════════════════════════════════════
// PROFILE COMPUTED VALUES
// T3-1: Extracted from [username].tsx for maintainability
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
  ledgerSearch: string;
  ledgerRatingFilter: LedgerRating;
  watchlistDecade: WatchlistDecade;
  watchlistSearch: string;
  watchlistSort: ShelfSort;
  physicalFilter: string | null;
  physicalSort: ShelfSort;
  listsSort: ShelfSort;
}

/**
 * The one place a profile count is reconciled.
 *
 * ── WHY THIS IS A FUNCTION AND NOT AN EXPRESSION REPEATED SIX TIMES ──────────
 * #86: the WATCHLIST StatCard read `counts.watchlist` raw while the WATCHLIST tab pill
 * a few pixels away read `counts.watchlist || displayWatchlist.length`. On the
 * cache-first path for your OWN dossier the hook deliberately seeds every count to 0
 * and skips the round trip — so the card showed **WATCHLIST 0** while the pill beside
 * it showed the truth. Two contradictory numbers for one collection, on screen at once.
 *
 * The fix is not "make the card match the pill". Two expressions that agree today can
 * disagree tomorrow — and they already had, in this same file: FILMS used `Math.max`
 * for self while every pill used `||`. Deriving it once is what makes divergence
 * impossible rather than merely absent.
 *
 * ── WHY THE TWO BRANCHES DIFFER ──────────────────────────────────────────────
 * SELF — `Math.max`. The local arrays are MMKV-hydrated before first paint, so they
 * are real evidence. Never show a member LESS than what is already on their device,
 * even if the server says less (it may be mid-write, or paginating).
 *
 * OTHER — `||`. There is no local cache of someone else's collection, so the array is
 * only whatever this session fetched. The server count is authoritative; the array is
 * a fallback for the moment before it arrives. `Math.max` here would let a partially
 * fetched page inflate a stranger's count above the truth.
 *
 * NOTE the local arrays are a WINDOW: films.ts persists only the most recent 150
 * entries (PERSIST_WINDOW). So at cold start a member with 300 watchlist items briefly
 * sees 150, not 300 — low, but consistent across both consumers, and it heals the
 * moment get_profile_counts resolves. Showing the same number in both places is the
 * property that matters; exactness arrives ~300ms later.
 */
export function reconcileCount(serverCount: number, localLength: number, isSelf: boolean): number {
  return isSelf ? Math.max(serverCount ?? 0, localLength) : ((serverCount ?? 0) || localLength);
}

/**
 * How a holdings count is written on the page.
 *
 * An em dash for an empty room, never `0`. Two reasons, and the second is the
 * one that matters. A room nobody has filed anything in yet is not a score of
 * zero, it is a room waiting — "—" invites, "0" indicts. And on the cache-first
 * path a member's own counts are deliberately seeded to 0 before the round trip
 * resolves, so for a few hundred milliseconds the old markup stated, in Rye at
 * 22pt, that someone with two thousand films had watched none of them. A dash
 * is honest in both cases: nothing to show yet.
 *
 * A thousands separator too — 2481 is a number, 2,481 is a figure.
 */
export function tally(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  // Manual grouping: `toLocaleString` routes through Intl, which this codebase
  // does not assume Hermes provides — when it is absent the options are ignored
  // and the failure looks like a design choice.
  const digits = String(Math.floor(n));
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return out;
}

/**
 * Consecutive days ending today (or yesterday) on which the member logged a film.
 *
 * Pulled out of the hook so it can actually be tested — it is date arithmetic, which
 * this codebase has now been bitten by twice, and it was unreachable by any test while
 * it lived inside a useMemo.
 *
 * ⚠️ It previously took `d.substring(0, 10)` for any string. That is exactly right for
 * `watchedDate`, which is a `date` column and carries no time — but the fallback is
 * `createdAt`, a TIMESTAMP, and the first ten characters of a timestamp are its **UTC**
 * day. Those keys were then compared against locally-built ones below, so west of UTC a
 * log whose watchedDate was missing could be filed under tomorrow and silently break
 * the streak. calendarDateString draws the distinction: a calendar date keeps its own
 * day, a timestamp resolves to the member's local one.
 *
 * `now` is injectable so the behaviour is testable without waiting for midnight.
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
  // Bounded by the number of distinct days logged: a streak can never be longer than
  // that, and an unbounded `for (;;)` here is one malformed data set from spinning.
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

export function useProfileComputed(params: UseProfileComputedParams) {
  const {
    isSelf, myLogs, myWatchlist, myVault, myLists,
    mainLogs, archiveLogs, ledgerLogs, analyticsLogs, watchlist, vault, lists,
    counts, isArchivistPlus, isAuteurPlus, targetUser, serverStreak,
    archiveSieve, ledgerSearch, ledgerRatingFilter,
    watchlistSearch, watchlistSort, watchlistDecade,
    physicalFilter, physicalSort, listsSort,
  } = params;

  // Real-time synchronization for self-profile
  // Type-safe mappers replace `as unknown as` double-casts
  // Memoized to prevent unnecessary re-computation on every render
  const hasArchiveSearch = archiveSieve !== 'all';
  const hasLedgerSearch = ledgerSearch.trim() !== '' || ledgerRatingFilter !== 'all';
  // The decade counts here too. Leaving it out would have been the quiet kind
  // of bug: on your OWN profile this flag decides whether the room reads from
  // the SERVER page (filtered) or the local store (unfiltered), so a decade
  // filter would have been applied to the query, thrown away, and the room
  // would have shown the whole queue while the chip said 1970s.
  const hasWatchlistSearch = watchlistSearch.trim() !== '' || watchlistSort !== 'default' || watchlistDecade !== null;
  const hasPhysicalSearch = physicalFilter !== 'all';

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

  // `hide_stats` used to blank this. It was removed deliberately — see the note at the
  // bottom of this file. Short version: it hid four digits while leaving the films they
  // count fully browsable one tab away, and readable from the API by anyone. A privacy
  // control that does not withhold the data is worse than none, because the member
  // believes they are covered.
  const totalFilms = reconcileCount(counts.logs, displayLogs.length, isSelf);

  // Stats level — matches web's cineStats computation exactly
  const statsLevel = totalFilms > 50 ? 'THE ORACLE' : totalFilms > 20 ? 'MIDNIGHT DEVOTEE' : totalFilms > 5 ? 'THE REGULAR' : 'FIRST REEL';
  // crimson (not bloodReel) — the deep stamp red was near-invisible on ink
  const statsColor = totalFilms > 50 ? colors.sepia : totalFilms > 20 ? colors.crimson : colors.flicker;
  const statsProgress = (totalFilms % 20) * 5;

  // Daily streak
  const streak = useMemo(() => {
    if (serverStreak !== null) return serverStreak;
    const sourceLogs = analyticsLogs.length > 0 ? analyticsLogs : displayLogs;
    return computeDailyStreak(sourceLogs);
  }, [serverStreak, displayLogs, analyticsLogs]);

  // Archive filtering
  const archiveFiltered = useMemo(() => {
    if (archiveSieve === 'all') return displayArchiveLogs;
    return displayArchiveLogs.filter(l => l.status === archiveSieve);
  }, [displayArchiveLogs, archiveSieve]);

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

  // Half-Life tracking analytics (Correctly wired to halfLifeMap)
  const halfLifeMap = useMemo(() => {
    // Half-Life math requires total historical data.
    // If we only have paginated `displayLogs`, the badges will be statistically false.
    let sourceLogs: ProfileLog[] = [];
    if (isSelf || isAuteurPlus) {
      sourceLogs = analyticsLogs;
    } else {
      // For non-Auteurs, we protect database bandwidth by not fetching the entire log history.
      // Therefore, we mathematically cannot generate a true half-life trajectory. We safely return empty.
      return {};
    }

    if (sourceLogs.length === 0) return {};
    // Inject chronological index to restore true timeline stability when timestamps tie.
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
      // Since sourceLogs is newest-first, a higher orderIndex mathematically means an older log.
      // We sort older logs to the front to generate a stable trajectory.
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

  /**
   * The decades the queue actually spans, newest first, each with its count.
   *
   * Derived from what is LOADED, exactly as the Vault's format chips are — a
   * visitor's queue is windowed at 150, so this is "the decades in the part we
   * have" rather than a promise about the whole shelf. Held in a ref while a
   * decade is selected, for the same reason the format counts are: the filtered
   * page contains only one decade, so recomputing would collapse the row to a
   * single chip and leave no way back to the others.
   */
  const decadeCountsRef = useRef<{ decade: number; count: number }[]>([]);
  const watchlistDecadeCounts = useMemo(() => {
    if (watchlistDecade !== null) return decadeCountsRef.current;
    const tally: Record<number, number> = {};
    for (const film of displayWatchlist) {
      const d = decadeOf(film.year);
      if (d === null) continue;
      tally[d] = (tally[d] || 0) + 1;
    }
    const computed = Object.entries(tally)
      .map(([decade, count]) => ({ decade: Number(decade), count }))
      .sort((a, b) => b.decade - a.decade);
    decadeCountsRef.current = computed;
    return computed;
  }, [displayWatchlist, watchlistDecade]);

  /**
   * Ordering a shelf, and a stack of dossiers.
   *
   * The same comparator for both, because "A–Z" has to mean one thing across
   * the six rooms — and because it must match what the SERVER does, or a
   * member's own vault (sorted here, from the local store) and a visitor's
   * (sorted by Postgres) would disagree about where "Æon Flux" goes.
   *
   * `localeCompare` with no locale argument is what the Watchlist already uses
   * and what Postgres's default collation approximates closely enough that no
   * member will ever see the difference; going anywhere near `Intl` here is
   * forbidden — Hermes may not carry it, and it fails by silently ignoring
   * options rather than by throwing.
   */
  const byShelfSort = <T extends { title?: string | null }>(items: T[], sort: ShelfSort): T[] => {
    if (sort === 'default') return items;
    const out = [...items];
    out.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
    return sort === 'za' ? out.reverse() : out;
  };

  // The Stacks take the same three orders, through the same comparator.
  const displayLists = useMemo(
    () => byShelfSort(displayListsRaw, listsSort),
     
    [displayListsRaw, listsSort],
  );

  // Physical archive filtering
  const physicalFiltered = useMemo(() => {
    const base = physicalFilter
      ? displayVault.filter((item: ProfileVaultItem) => item.formats?.includes(physicalFilter))
      : displayVault;
    return byShelfSort(base, physicalSort);
   
  }, [displayVault, physicalFilter, physicalSort]);

  // Single-pass reduce replaces O(formats × items) nested .filter() loop
  const formatCountsRef = useRef<any[]>([]);

  const physicalFormatCounts = useMemo(() => {
    if (physicalFilter) {
      return formatCountsRef.current;
    }
    // T3-20: FORMAT_META imported from @/src/constants/formats.ts
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

  /**
   * The last three films, for LATELY.
   *
   * ── WHY THE POSTER FILTER WENT ───────────────────────────────────────────
   * This used to require `l.poster && l.poster.length > 5`, because the section
   * was three poster tiles in a row and one empty tile looked broken. LATELY is
   * a numbered ledger now, and a ledger row with a marked placeholder does not
   * look broken — it looks like a film TMDB has no art for, which is what it
   * is. Filtering meant the three films a member had actually watched most
   * recently could silently not be the three the page showed; the row is now
   * simply the truth, in order.
   */
  const recentLogs = useMemo(() => displayLogs.slice(0, 3), [displayLogs]);

  // Social links parsing (matches web exactly)
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

  // Collection Cards — the six rooms of the member's private wing.
  // `locked` reflects the DOSSIER OWNER's rank: locked rooms wear the brass
  // key and open onto the velvet rope, never a dead end.
  // The Projector is a room, not a count — it shows the ★ mark, never "0".
  // Every count on this screen goes through reconcileCount — including the ones the
  // StatCards read below, which is the point: the StatCard and the pill for the same
  // collection can no longer show different numbers, because there is only one number.
  const totalLedger = reconcileCount(counts.ledger, displayLogs.filter(l => l.rating > 0 || (l.review && l.review.length > 0)).length, isSelf);
  const totalWatchlist = reconcileCount(counts.watchlist, displayWatchlist.length, isSelf);
  const totalLists = reconcileCount(counts.lists, displayLists.length, isSelf);
  const totalVault = reconcileCount(counts.vault, displayVault.length, isSelf);

  const COLLECTION_CARDS = useMemo(() => [
    { id: 'archive' as ProfileTab, label: 'ARCHIVE', desc: 'WATCHED', count: tally(totalFilms), Icon: Archive, disabled: false, highlight: false, locked: false },
    { id: 'ledger' as ProfileTab, label: 'LEDGER', desc: 'DIARY', count: tally(totalLedger), Icon: BookOpen, disabled: false, highlight: false, locked: false },
    { id: 'watchlist' as ProfileTab, label: 'WATCHLIST', desc: 'TO SEE', count: tally(totalWatchlist), Icon: Bookmark, disabled: false, highlight: false, locked: false },
    { id: 'lists' as ProfileTab, label: 'STACKS', desc: 'LISTS', count: tally(totalLists), Icon: LayoutList, disabled: false, highlight: false, locked: false },
    { id: 'physical' as ProfileTab, label: 'VAULT', desc: 'PHYSICAL', count: isArchivistPlus ? tally(totalVault) : '✦', Icon: Disc, disabled: false, highlight: false, locked: !isArchivistPlus },
    { id: 'projector' as ProfileTab, label: 'PROJECTOR', desc: 'ANALYTICS', count: '★', Icon: Projector, disabled: false, highlight: true, locked: false },
  ], [totalLedger, totalWatchlist, totalLists, totalVault, isArchivistPlus, totalFilms]);

  return {
    displayLogs, displayWatchlist, displayVault, displayLists,
    totalFilms, statsLevel, statsColor, statsProgress,
    streak, archiveFiltered, ledgerFiltered, halfLifeMap,
    // Exposed so the StatCards read the SAME reconciled numbers the pills do.
    totalWatchlist, totalLedger, totalLists, totalVault,
    watchlistFiltered, watchlistDecadeCounts, physicalFiltered, physicalFormatCounts,
    recentLogs, socialLinks, COLLECTION_CARDS,
  };
}

/**
 * ── WHY `hide_stats` WAS REMOVED RATHER THAN FINISHED ────────────────────────────────
 *
 * It was a preference that blanked the FILMS stat for visitors. Three facts decided it:
 *
 *   1. IT DID NOT WITHHOLD ANYTHING. `get_profile_counts` gates on can_view_user_data —
 *      blocking and is_social_private — and has never referenced hide_stats. The real
 *      numbers were returned to any caller regardless. Hiding them in one client is
 *      decoration, and decoration that says "private" is a lie.
 *
 *   2. THE DATA IT HID WAS ONE TAB AWAY. For a member who is not socially private, a
 *      visitor can browse their archive, watchlist and stacks and count the rows by
 *      hand. Concealing the total while publishing the contents is incoherent by
 *      construction — there is no version of this feature that works.
 *
 *   3. IT WAS INCOHERENT IN THE UI TOO. The stats row was gated, but the collection
 *      grid was not, so a member with it on showed ARCHIVE "0" — which reads as
 *      "watched nothing", not "withheld" — beside real LEDGER and WATCHLIST counts.
 *
 * Nothing was lost by removing it: no member had it set (0 of 32 live profiles), the
 * app never offered a switch for it, and the web app has no reference to it at all.
 *
 * Members who want to be unreadable have `is_social_private`, which is enforced in the
 * database across every read path. That is the control this one was pretending to be.
 *
 * If a "show my profile but not my volume" feature is ever genuinely wanted, it has to
 * start server-side and it has to hide the CONTENT too — otherwise it is this again.
 */
