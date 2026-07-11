import { useMemo, useRef } from 'react';
import type { ProfileVaultItem, ProfileLog, ProfileWatchlistItem, ProfileList, HalfLifeEntry, DomainLog } from '@/src/types';
import { ProfileTab } from '@/src/hooks/useProfileData';

import { colors } from '@/src/theme/theme';
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
  ledgerRatingFilter: number | 'all';
  watchlistSearch: string;
  watchlistSort: 'default' | 'az' | 'za';
  physicalFilter: string | null;
}

export function useProfileComputed(params: UseProfileComputedParams) {
  const {
    isSelf, myLogs, myWatchlist, myVault, myLists,
    mainLogs, archiveLogs, ledgerLogs, analyticsLogs, watchlist, vault, lists,
    counts, isArchivistPlus, isAuteurPlus, targetUser, serverStreak,
    archiveSieve, ledgerSearch, ledgerRatingFilter,
    watchlistSearch, watchlistSort, physicalFilter,
  } = params;

  // Real-time synchronization for self-profile
  // Type-safe mappers replace `as unknown as` double-casts
  // Memoized to prevent unnecessary re-computation on every render
  const hasArchiveSearch = archiveSieve !== 'all';
  const hasLedgerSearch = ledgerSearch.trim() !== '' || ledgerRatingFilter !== 'all';
  const hasWatchlistSearch = watchlistSearch.trim() !== '' || watchlistSort !== 'default';
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

  const displayLists = useMemo(() => isSelf ? myLists.map(toProfileList) : lists, [isSelf, myLists, lists]);

  const rawTotalFilms = isSelf ? Math.max(counts.logs, displayLogs.length) : (counts.logs || displayLogs.length);
  const hideStats = !isSelf && targetUser?.preferences?.hide_stats === true;
  const totalFilms = hideStats ? 0 : rawTotalFilms;

  // Stats level — matches web's cineStats computation exactly
  const statsLevel = hideStats ? 'CLASSIFIED' : (totalFilms > 50 ? 'THE ORACLE' : totalFilms > 20 ? 'MIDNIGHT DEVOTEE' : totalFilms > 5 ? 'THE REGULAR' : 'FIRST REEL');
  // crimson (not bloodReel) — the deep stamp red was near-invisible on ink
  const statsColor = hideStats ? colors.ash : (totalFilms > 50 ? colors.sepia : totalFilms > 20 ? colors.crimson : colors.flicker);
  const statsProgress = hideStats ? 0 : (totalFilms % 20) * 5;

  // Daily streak
  const streak = useMemo(() => {
    if (serverStreak !== null) return serverStreak;

    const dates = new Set<string>();
    const sourceLogs = analyticsLogs.length > 0 ? analyticsLogs : displayLogs;
    
    // Timezone-safe parsing via O(1) string extraction.
    // Locks the streak explicitly to the true YYYY-MM-DD stored in the DB without V8 Date engine timezone shifts.
    for (const log of sourceLogs) {
      const d = log.watchedDate ?? log.createdAt;
      if (d) {
        let localStr = '';
        if (typeof d === 'string') {
          localStr = d.substring(0, 10);
        } else if ((d as any) instanceof Date && !isNaN((d as any).getTime())) {
          localStr = `${(d as any).getFullYear()}-${String((d as any).getMonth() + 1).padStart(2, '0')}-${String((d as any).getDate()).padStart(2, '0')}`;
        }
        if (localStr) dates.add(localStr);
      }
    }
    
    let count = 0;
    const now = new Date();
    for (let i = 0; ; i++) {
      const check = new Date(now);
      check.setDate(check.getDate() - i); // Mutate local date strictly
      const key = `${check.getFullYear()}-${String(check.getMonth() + 1).padStart(2, '0')}-${String(check.getDate()).padStart(2, '0')}`;
      
      if (dates.has(key)) count++;
      else if (i === 0) continue; // Allow today to be missed without breaking the streak yet
      else break;
    }
    return count;
  }, [serverStreak, displayLogs, analyticsLogs]);

  // Archive filtering
  const archiveFiltered = useMemo(() => {
    if (archiveSieve === 'all') return displayArchiveLogs;
    return displayArchiveLogs.filter(l => l.status === archiveSieve);
  }, [displayArchiveLogs, archiveSieve]);

  // Ledger filtering (rated/reviewed only)
  const ledgerFiltered = useMemo(() => {
    return displayLedgerLogs.filter(log => {
      if (!log.poster && !log.altPoster) return false;
      if (!log.rating && !log.review) return false;
      if (ledgerRatingFilter !== 'all' && log.rating !== ledgerRatingFilter) return false;
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
    if (watchlistSort === 'az') result.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
    else if (watchlistSort === 'za') result.sort((a, b) => (b.title ?? '').localeCompare(a.title ?? ''));
    return result;
  }, [displayWatchlist, watchlistSearch, watchlistSort]);

  // Physical archive filtering
  const physicalFiltered = useMemo(() => {
    if (!physicalFilter) return displayVault;
    return displayVault.filter((item: ProfileVaultItem) => item.formats?.includes(physicalFilter));
  }, [displayVault, physicalFilter]);

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

  // Extracted from IIFE in JSX — enables proper memoization
  const recentLogs = useMemo(() =>
    displayLogs.filter((l: ProfileLog) => l.poster && l.poster.length > 5).slice(0, 3),
    [displayLogs]
  );

  // Memory Optimization: Deduplicate films strictly once per logs change.
  // This prevents React from throwing duplicate key errors in the UI, and avoids
  // massive array reallocation / filtering when the Nightly Programme tab is opened.
  const uniqueFilms = useMemo(() => {
    const sourceLogs = analyticsLogs.length > 0 ? analyticsLogs : displayLogs;
    const map = new Map<number, { id: number; title: string; poster_path: string }>();
    for (const log of sourceLogs) {
      const id = log.filmId || (log as any).film_id;
      if (!id) continue;
      if (!map.has(id)) {
        map.set(id, { id, title: log.title || '', poster_path: log.poster || (log as any).poster_path || '' });
      }
    }
    return Array.from(map.values());
  }, [displayLogs, analyticsLogs]);

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
  const COLLECTION_CARDS = useMemo(() => [
    { id: 'archive' as ProfileTab, label: 'ARCHIVE', desc: 'WATCHED', count: String(totalFilms), Icon: Archive, disabled: false, highlight: false, locked: false },
    { id: 'ledger' as ProfileTab, label: 'LEDGER', desc: 'DIARY', count: String(counts.ledger || displayLogs.filter(l => l.rating > 0 || (l.review && l.review.length > 0)).length), Icon: BookOpen, disabled: false, highlight: false, locked: false },
    { id: 'watchlist' as ProfileTab, label: 'WATCHLIST', desc: 'TO SEE', count: String(counts.watchlist || displayWatchlist.length), Icon: Bookmark, disabled: false, highlight: false, locked: false },
    { id: 'lists' as ProfileTab, label: 'STACKS', desc: 'LISTS', count: String(counts.lists || displayLists.length), Icon: LayoutList, disabled: false, highlight: false, locked: false },
    { id: 'physical' as ProfileTab, label: 'VAULT', desc: 'PHYSICAL', count: isArchivistPlus ? String(counts.vault || displayVault.length) : '✦', Icon: Disc, disabled: false, highlight: false, locked: !isArchivistPlus },
    { id: 'projector' as ProfileTab, label: 'PROJECTOR', desc: 'ANALYTICS', count: '★', Icon: Projector, disabled: false, highlight: true, locked: false },
  ], [counts, displayLogs, displayWatchlist.length, displayLists.length, displayVault.length, isArchivistPlus, totalFilms]);

  return {
    displayLogs, displayWatchlist, displayVault, displayLists,
    totalFilms, statsLevel, statsColor, statsProgress,
    streak, archiveFiltered, ledgerFiltered, halfLifeMap,
    watchlistFiltered, physicalFiltered, physicalFormatCounts,
    recentLogs, uniqueFilms, socialLinks, COLLECTION_CARDS,
  };
}
