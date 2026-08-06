/**
 * mappers.ts — Shared Row → Domain Mapping Functions
 * ───────────────────────────────────────────────────
 * Single source of truth for transforming Supabase row shapes
 * into domain model types. Eliminates duplicated mapping logic
 * across stores (content.ts, lounge.ts).
 *
 * Rules:
 *   • Every function is PURE — no side effects, no imports from stores
 *   • Every function is TYPED — no `any`, explicit input and output
 *   • Every optional field has a safe fallback
 */

// ── Dossier Types ──

// ── Store→ProfileView Mappers ──
// These replace `as unknown as ProfileX[]` double-casts in [username].tsx
// with explicit, compile-time-checked conversions.

import type { DomainLog, FilmList, PhysicalArchiveItem, WatchlistItem } from '../types';
import type { ProfileList, ProfileLog, ProfileVaultItem, ProfileWatchlistItem } from '../types/profile.types';

function safeJsonParse(val: string) {
  try { return JSON.parse(val); } catch { return null; }
}

export interface DossierRow {
  id: string;
  title: string;
  excerpt?: string | null;
  full_content?: string | null;
  author_username?: string | null;
  user_id: string;
  views?: number | null;
  certify_count?: number | null;
  created_at: string;
}

export interface Dossier {
  id: string;
  title: string;
  excerpt: string;
  fullContent: string;
  author: string;
  authorUsername: string;
  authorId: string;
  views: number;
  certifyCount: number;
  date: string;
  raw_created_at: string;
}

/**
 * Maps a Supabase dossier row to the domain Dossier type.
 * Handles all null/undefined fields with safe fallbacks.
 */
export function mapDossierRow(d: DossierRow): Dossier {
  return {
    id: d.id,
    title: d.title,
    excerpt: d.excerpt ?? '',
    fullContent: d.full_content ?? '',
    author: d.author_username?.toUpperCase() ?? 'ANONYMOUS',
    authorUsername: d.author_username ?? '',
    authorId: d.user_id,
    views: d.views ?? 0,
    certifyCount: d.certify_count ?? 0,
    date: new Date(d.created_at).toLocaleDateString('en-US', {
      month: 'short', day: '2-digit', year: 'numeric',
    }).toUpperCase(),
    raw_created_at: d.created_at,
  };
}

// ── Lounge Message Types ──

export interface LoungeMessageRow {
  id: string;
  lounge_id: string;
  user_id: string;
  content: string;
  type: string;
  reply_to_id?: string | null;
  reply_to_username?: string | null;
  reply_to_content?: string | null;
  film_id?: number | null;
  film_title?: string | null;
  film_poster?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  profiles: { username: string; avatar_url?: string } | { username: string; avatar_url?: string }[] | null;
}

export interface MappedLoungeMessage {
  id: string;
  lounge_id: string;
  user_id: string;
  username: string;
  avatar_url?: string;
  content: string;
  type: 'text' | 'film_share' | 'log_share' | 'list_share' | 'dossier_share' | 'system';
  reply_to_id?: string | null;
  reply_to_username?: string | null;
  reply_to_content?: string | null;
  film_id?: number | null;
  film_title?: string | null;
  film_poster?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Maps a Supabase lounge_messages join row to the domain LoungeMessage type.
 * Handles the polymorphic profiles join (can be object or array depending on
 * Supabase query config).
 */
export function mapMessageRow(m: LoungeMessageRow): MappedLoungeMessage {
  const profileData = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;

  return {
    id: m.id,
    lounge_id: m.lounge_id,
    user_id: m.user_id,
    username: profileData?.username ?? 'unknown',
    avatar_url: profileData?.avatar_url,
    content: m.content,
    type: (m.type as MappedLoungeMessage['type']) ?? 'text',
    reply_to_id: m.reply_to_id,
    reply_to_username: m.reply_to_username,
    reply_to_content: m.reply_to_content,
    film_id: m.film_id,
    film_title: m.film_title,
    film_poster: m.film_poster,
    metadata: m.metadata,
    created_at: m.created_at,
  };
}

// ── Log Row Types (F-08 APEX FIX) ──

export interface LogRow {
  id: string;
  film_id: number;
  film_title: string;
  poster_path?: string | null;
  year?: number | null;
  rating: number;
  review?: string | null;
  status?: string | null;
  watched_date?: string | null;
  is_spoiler?: boolean | null;
  watched_with?: string | null;
  private_notes?: string | null;
  abandoned_reason?: string | null;
  physical_media?: string | null;
  is_autopsied?: boolean | null;
  autopsy?: string | null;
  alt_poster?: string | null;
  editorial_header?: string | null;
  drop_cap?: boolean | null;
  pull_quote?: string | null;
  video_url?: string | null;
  format?: string | null;
  created_at: string;
  view_count?: number | null;
  viewing_history?: unknown[] | null;
}



/**
 * Single source of truth for Supabase log row → domain mapping.
 * Replaces duplicated inline mapping in logSlice.ts (lines 81-106) and
 * useProfileData.ts (lines 101-106). Ensures consistent field handling
 * and null-safety across all consumers.
 */
/**
 * Centralized select column string — single source of truth.
 * Used by logSlice.fetchLogs() and any future log-fetching queries.
 * When adding a new column to the logs table, update this constant
 * AND the LogRow interface above in a single commit.
 */
export const LOG_SELECT_COLUMNS = 'id, user_id, film_id, film_title, poster_path, year, rating, review, status, watched_date, is_spoiler, watched_with, private_notes, abandoned_reason, physical_media, is_autopsied, autopsy, alt_poster, editorial_header, drop_cap, pull_quote, video_url, format, created_at, view_count, viewing_history' as const;

/**
 * PUBLIC_LOG_COLUMNS: Explicitly omits `private_notes` while preserving
 * `is_spoiler` and presentation fields (format, drop_cap) for public profile viewing.
 */
export const PUBLIC_LOG_COLUMNS = 'id, user_id, film_id, film_title, poster_path, year, rating, review, status, watched_date, is_spoiler, watched_with, abandoned_reason, physical_media, is_autopsied, autopsy, alt_poster, editorial_header, drop_cap, pull_quote, video_url, format, created_at, view_count, viewing_history' as const;

export function mapLogRow(dbLog: LogRow): DomainLog {
  return {
    id: dbLog.id,
    filmId: dbLog.film_id,
    title: dbLog.film_title,
    poster: dbLog.poster_path ?? null,
    year: dbLog.year ?? null,
    rating: dbLog.rating,
    review: dbLog.review ?? undefined,
    status: dbLog.status ?? 'watched',
    isSpoiler: dbLog.is_spoiler ?? false,
    watchedDate: dbLog.watched_date ?? undefined,
    watchedWith: dbLog.watched_with ?? null,
    privateNotes: dbLog.private_notes ?? null,
    abandonedReason: dbLog.abandoned_reason ?? null,
    physicalMedia: dbLog.physical_media ?? null,
    isAutopsied: dbLog.is_autopsied ?? false,
    autopsy: (typeof dbLog.autopsy === 'string' ? safeJsonParse(dbLog.autopsy) : dbLog.autopsy) as Record<string, number> | null,
    altPoster: dbLog.alt_poster ?? null,
    editorialHeader: dbLog.editorial_header ?? null,
    dropCap: dbLog.drop_cap ?? false,
    pullQuote: dbLog.pull_quote ?? '',
    videoUrl: dbLog.video_url ?? null,
    format: dbLog.format ?? null,
    createdAt: dbLog.created_at,
    viewCount: dbLog.view_count ?? 1,
    viewingHistory: (typeof dbLog.viewing_history === 'string' ? safeJsonParse(dbLog.viewing_history) : dbLog.viewing_history) ?? [],
  } as DomainLog;
}

/**
 * Reverse mapper — domain MappedLog fields → Supabase column names.
 * Eliminates the manual 20-line if-chain in logSlice.updateLog().
 * Only includes keys that are present in the updates object.
 */
/**
 * T5-02 REFACTOR: Declarative field map replaces 18-line if-chain.
 * Adding a new log column = one entry in this table + updating LogRow/MappedLog interfaces.
 * The `defaultOnNull` is used when the domain field can be undefined but the DB column
 * must have a value (e.g., review defaults to '' instead of NULL).
 */
const LOG_FIELD_MAP: { domain: keyof DomainLog; db: string; defaultOnNull?: string | number | boolean }[] = [
  { domain: 'rating', db: 'rating' },
  { domain: 'review', db: 'review', defaultOnNull: '' },
  { domain: 'status', db: 'status' },
  { domain: 'isSpoiler', db: 'is_spoiler' },
  { domain: 'watchedDate', db: 'watched_date' },
  { domain: 'watchedWith', db: 'watched_with' },
  { domain: 'privateNotes', db: 'private_notes' },
  { domain: 'abandonedReason', db: 'abandoned_reason' },
  { domain: 'physicalMedia', db: 'physical_media' },
  { domain: 'isAutopsied', db: 'is_autopsied' },
  { domain: 'autopsy', db: 'autopsy' },
  { domain: 'pullQuote', db: 'pull_quote' },
  { domain: 'dropCap', db: 'drop_cap' },
  { domain: 'editorialHeader', db: 'editorial_header' },
  { domain: 'altPoster', db: 'alt_poster' },
  { domain: 'videoUrl', db: 'video_url' },
  { domain: 'format', db: 'format' },
  { domain: 'viewCount', db: 'view_count' },
  { domain: 'viewingHistory', db: 'viewing_history' },
];

export function mapLogToDbPayload(updates: Partial<Record<keyof DomainLog, DomainLog[keyof DomainLog] | null>>): Record<string, string | number | boolean | null | unknown[]> {
  const db: Record<string, string | number | boolean | null | unknown[]> = {};
  for (const { domain, db: col, defaultOnNull } of LOG_FIELD_MAP) {
    const value = updates[domain];
    if (value !== undefined) {
      db[col] = (value ?? defaultOnNull ?? null) as string | number | boolean | null | unknown[];
    }
  }
  return db;
}

// ── Watchlist Row Types (T2-1 FIX) ──

export interface WatchlistRow {
  id: string;
  user_id: string;
  film_id: number;
  film_title: string;
  poster_path?: string | null;
  year?: number | null;
  created_at: string;
}

export interface MappedWatchlistItem {
  /** @deprecated Use `filmId` for TMDB lookups or `rowId` for mutations. Ambiguous — will be removed in v2. */
  id: number;
  /** BLOCK6-B: Supabase primary key — use for delete/update mutations */
  rowId: string;
  /** BLOCK6-B: TMDB film ID — use for detail lookups and dedup */
  filmId: number;
  title: string;
  poster: string | null;
  year: number | null;
}

/** Canonical select columns for watchlist queries. */
export const WATCHLIST_SELECT_COLUMNS = 'id, user_id, film_id, film_title, poster_path, year, created_at' as const;

/** Single source of truth for Supabase watchlist row → domain mapping. */
export function mapWatchlistRow(w: WatchlistRow): MappedWatchlistItem {
  return {
    id: w.film_id,      // DEPRECATED: backward compat
    rowId: w.id,         // Supabase PK
    filmId: w.film_id,   // TMDB ID
    title: w.film_title,
    poster: w.poster_path ?? null,
    year: w.year ?? null,
  };
}

// ── Archive Row Types (T2-1 FIX) ──

export interface ArchiveRow {
  id: string;
  user_id: string;
  film_id: number;
  film_title: string;
  poster_path?: string | null;
  year?: number | null;
  formats?: string[] | null;
  notes?: string | null;
  condition?: string | null;
  created_at: string;
}

export interface MappedArchiveItem {
  id: string;
  filmId: number;
  title: string;
  poster: string | null;
  year: number | null;
  formats: string[];
  notes: string;
  condition: string;
  createdAt: string;
}

/** Canonical select columns for physical_archive queries. */
export const ARCHIVE_SELECT_COLUMNS = 'id, user_id, film_id, film_title, poster_path, year, formats, notes, condition, created_at' as const;

/** Single source of truth for Supabase archive row → domain mapping. */
export function mapArchiveRow(row: ArchiveRow): MappedArchiveItem {
  return {
    id: row.id,
    filmId: row.film_id,
    title: row.film_title,
    poster: row.poster_path ?? null,
    year: row.year ?? null,
    formats: row.formats ?? [],
    notes: row.notes ?? '',
    condition: row.condition ?? 'good',
    createdAt: row.created_at,
  };
}

// ── List Row Types (T2-1 FIX) ──

export interface ListItemRow {
  id: string;
  film_id: number;
  film_title: string;
  poster_path: string | null;
  /** The ordering column is rank_position; there is no `position` column. */
  rank_position: number;
}

export interface ListRow {
  id: string;
  title: string;
  description: string | null;
  is_ranked: boolean;
  is_private: boolean;
  created_at: string;
  user_id: string;
  list_items: ListItemRow[];
}

export interface MappedList {
  id: string;
  title: string;
  description: string | undefined;
  isRanked: boolean;
  isPrivate: boolean;
  createdAt: string;
  userId: string;
  films: { id: number; title: string; poster: string | null }[];
}

/** Single source of truth for Supabase list row → domain mapping. */
export function mapListRow(d: ListRow): MappedList {
  // Items arrive pre-sorted from the server via
  // .order('rank_position', { foreignTable: 'list_items', ascending: true })
  const items = d.list_items || [];
  return {
    id: d.id,
    title: d.title,
    description: d.description ?? undefined,
    isRanked: d.is_ranked,
    isPrivate: d.is_private,
    createdAt: d.created_at,
    userId: d.user_id,
    films: items.map((i) => ({
      id: i.film_id,
      title: i.film_title,
      poster: i.poster_path,
    })),
  };
}

/** Maps a store DomainLog to a ProfileLog for the profile screen. */
export function toProfileLog(log: DomainLog): ProfileLog {
  return {
    id: log.id,
    filmId: log.filmId,
    title: log.title ?? '',
    poster: log.poster ?? null,
    year: log.year ?? null,
    rating: log.rating,
    review: log.review,
    status: log.status ?? 'watched',
    watchedDate: log.watchedDate,
    isSpoiler: log.isSpoiler ?? false,
    pullQuote: log.pullQuote,
    altPoster: log.altPoster,
    physicalMedia: log.physicalMedia,
    watchedWith: log.watchedWith,
    abandonedReason: log.abandonedReason,
    isAutopsied: log.isAutopsied,
    autopsy: log.autopsy,
    viewCount: log.viewCount ?? 1,
    viewingHistory: log.viewingHistory ?? null,
    videoUrl: log.videoUrl ?? null,
    format: log.format ?? null,
    dropCap: log.dropCap ?? false,
    editorialHeader: log.editorialHeader ?? null,
    createdAt: log.createdAt ?? '',
  };
}

/** Maps a store WatchlistItem to a ProfileWatchlistItem. */
export function toProfileWatchlistItem(item: WatchlistItem): ProfileWatchlistItem {
  return {
    id: item.id,
    title: item.title,
    poster_path: item.poster_path ?? item.poster ?? null,
    year: item.year ?? null,
  };
}

/** Maps a store PhysicalArchiveItem to a ProfileVaultItem. */
export function toProfileVaultItem(item: PhysicalArchiveItem): ProfileVaultItem {
  return {
    id: item.id?.toString() ?? '',
    film_id: item.filmId,
    filmId: item.filmId,
    title: item.title,
    poster_path: item.poster_path ?? item.poster ?? null,
    year: item.year ?? null,
    formats: item.formats ?? [],
    notes: item.notes ?? '',
    condition: item.condition ?? 'good',
    created_at: item.createdAt,
    createdAt: item.createdAt ?? '',
  };
}

/** Maps a store FilmList to a ProfileList. */
export function toProfileList(list: FilmList): ProfileList {
  return {
    id: list.id,
    title: list.title ?? list.name ?? '',
    description: list.description ?? '',
    isRanked: list.isRanked ?? false,
    isPrivate: list.isPrivate ?? false,
    createdAt: list.createdAt ?? '',
    films: (list.films ?? []).map(f => ({
      id: f.id,
      title: f.title,
      poster: f.poster ?? f.poster_path ?? null,
    })),
    // The OWNER's path is uncapped — listSlice's query has no foreign-table limit — so
    // here the array genuinely is the whole stack and its length is the true count.
    // This is why the owner always saw the right number while everyone else saw 4.
    filmCount: (list.films ?? []).length,
  };
}

