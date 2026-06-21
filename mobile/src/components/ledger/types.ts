/**
 * Ledger Card Types — Typed Props for FSD-extracted Ledger Components
 * ────────────────────────────────────────────────────────────────────
 * Eliminates 11 `Record<string, any>` annotations
 * from ledger.tsx by providing proper domain types for each card variant.
 */
import type { DomainLog, WatchlistItem, PhysicalArchiveItem, FilmList } from '@/src/types';

export interface LedgerLogCardProps {
  item: DomainLog;
  index: number;
}

export interface LedgerWatchlistCardProps {
  item: WatchlistItem;
  index: number;
}

export interface LedgerVaultCardProps {
  item: PhysicalArchiveItem;
  index: number;
}

export interface LedgerListCardProps {
  item: FilmList;
  index: number;
}
