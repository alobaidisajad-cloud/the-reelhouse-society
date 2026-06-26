/**
 * archiveImport.ts — Universal Archive Import Engine
 * ──────────────────────────────────────────────────
 * Imports film data from any source:
 *   • CSV archives (diary, reviews, watchlist, list CSVs inside a ZIP)
 *   • ReelHouse JSON exports (ZIP or raw .json)
 *
 * Zero competitor names. Format-agnostic header detection.
 * TMDB resolution for CSV imports (title+year → id+poster).
 * Batch upsert with ignoreDuplicates for idempotent imports.
 */
import JSZip from 'jszip';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system';
import { readAsStringAsync, EncodingType } from 'expo-file-system';
import { supabase } from '@/src/lib/supabase';
import { tmdb } from '@/src/lib/tmdb';
import { useAuthStore } from '@/src/stores/auth';
import { logger } from '@/src/utils/logger';
// FEAT-1: imported review/notes text is untrusted (from arbitrary third-party
// exports) — run it through the same sanitizer as in-app writes.
import { sanitizeInput } from '@/src/utils/sanitizeInput';

// ═══════════════════════════════════════════════════════════════
//  PUBLIC TYPES
// ═══════════════════════════════════════════════════════════════
export interface ImportProgress {
  phase: string;
  current: number;
  total: number;
  detail?: string;
}

export interface ImportResult {
  logs: number;
  reviews: number;
  watchlist: number;
  lists: number;
  skipped: number;
  errors: string[];
}

// ═══════════════════════════════════════════════════════════════
//  INTERNAL TYPES
// ═══════════════════════════════════════════════════════════════
interface TMDBMatch {
  id: number;
  title: string;
  poster_path: string | null;
  year: number | null;
}

interface ParsedDiaryEntry {
  title: string;
  year: string;
  rating: number;
  review: string;
  watchedDate: string;
  isRewatch: boolean;
  uri: string;
  tags: string;
}

interface ParsedWatchlistEntry {
  title: string;
  year: string;
  addedDate: string;
}

interface ParsedListFile {
  name: string;
  description: string;
  entries: { title: string; year: string }[];
}

interface ReelHouseArchive {
  meta?: { exported_at?: string; version?: string };
  logs?: Record<string, unknown>[];
  watchlist?: Record<string, unknown>[];
  vault?: Record<string, unknown>[];
  lists?: Record<string, unknown>[];
}

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════
const BATCH_SIZE = 50;
const RESOLVE_DELAY_MS = 60;

/**
 * Generic header synonyms — works with any film tracking app.
 * Each key maps to an array of known column names (case-insensitive).
 */
const HEADER_MAP: Record<string, string[]> = {
  title:       ['name', 'title', 'film', 'movie', 'film title', 'movie title'],
  year:        ['year', 'release year', 'release date'],
  rating:      ['rating', 'your rating', 'score', 'stars', 'my rating'],
  watchedDate: ['watched date', 'date watched', 'watch date', 'date', 'date rated'],
  review:      ['review', 'comment', 'comments', 'notes', 'my review'],
  rewatch:     ['rewatch', 're-watch', 'rewatched'],
  uri:         ['url', 'uri', 'link', 'const', 'source', 'film uri', 'film url'],
  tags:        ['tags', 'genres', 'genre'],
  description: ['description', 'list description'],
  position:    ['position', 'rank', 'order', '#', 'number'],
  titleType:   ['title type'],
};

// ═══════════════════════════════════════════════════════════════
//  CSV PARSER — RFC 4180 compliant
// ═══════════════════════════════════════════════════════════════

/**
 * Parses CSV text into an array of record objects.
 * Handles: quoted fields, embedded commas, multiline reviews,
 * escaped quotes (""), BOM markers, and mixed line endings.
 */
function parseCSV(text: string): Record<string, string>[] {
  // Strip BOM if present
  const cleaned = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < cleaned.length) {
    const char = cleaned[i];

    if (inQuotes) {
      if (char === '"') {
        // Peek ahead for escaped quote
        if (i + 1 < cleaned.length && cleaned[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === ',') {
        current.push(field.trim());
        field = '';
        i++;
      } else if (char === '\r') {
        // Handle \r\n or standalone \r
        current.push(field.trim());
        field = '';
        rows.push(current);
        current = [];
        i++;
        if (i < cleaned.length && cleaned[i] === '\n') i++;
      } else if (char === '\n') {
        current.push(field.trim());
        field = '';
        rows.push(current);
        current = [];
        i++;
      } else {
        field += char;
        i++;
      }
    }
  }

  // Final field/row
  if (field || current.length > 0) {
    current.push(field.trim());
    rows.push(current);
  }

  if (rows.length < 2) return [];

  const headers = rows[0];
  return rows.slice(1)
    .filter(row => row.some(cell => cell.length > 0)) // Skip empty rows
    .map(row => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = row[idx] ?? '';
      });
      return obj;
    });
}

// ═══════════════════════════════════════════════════════════════
//  HEADER RESOLVER — Format-agnostic column detection
// ═══════════════════════════════════════════════════════════════

type HeaderMapping = Record<string, string>; // ourField → csvHeader

/**
 * Maps detected CSV headers to our internal field names.
 * Returns a mapping of { ourFieldName: actualCSVHeader } or null if
 * no recognizable title column is found.
 */
function resolveHeaders(csvHeaders: string[]): HeaderMapping | null {
  const mapping: HeaderMapping = {};
  const lowerHeaders = csvHeaders.map(h => h.toLowerCase().trim());

  for (const [field, synonyms] of Object.entries(HEADER_MAP)) {
    for (const syn of synonyms) {
      const idx = lowerHeaders.indexOf(syn.toLowerCase());
      if (idx !== -1) {
        mapping[field] = csvHeaders[idx]; // Use original casing
        break;
      }
    }
  }

  // Must have at least a title column
  if (!mapping.title) return null;
  return mapping;
}

/**
 * Extracts a field value from a CSV row using the resolved header mapping.
 */
function getField(row: Record<string, string>, mapping: HeaderMapping, field: string): string {
  const header = mapping[field];
  if (!header) return '';
  return row[header] ?? '';
}

// ═══════════════════════════════════════════════════════════════
//  RATING NORMALIZER — Auto-detect scale
// ═══════════════════════════════════════════════════════════════


/**
 * Detects if a set of ratings is on a 1–10 scale by checking the max value.
 * If detected, forces the 1–10 conversion path.
 */
function detectRatingScale(ratings: number[]): 'half-five' | 'ten' | 'hundred' {
  const max = Math.max(...ratings.filter(r => r > 0));
  if (max > 10) return 'hundred';
  if (max > 5) return 'ten';
  return 'half-five';
}

function normalizeRatingWithScale(raw: number, scale: 'half-five' | 'ten' | 'hundred'): number {
  if (!raw || raw <= 0) return 0;
  switch (scale) {
    case 'ten':     return Math.round((raw / 2) * 2) / 2;
    case 'hundred': return Math.round((raw / 20) * 2) / 2;
    case 'half-five':
    default:        return Math.round(raw * 2) / 2;
  }
}

// ═══════════════════════════════════════════════════════════════
//  DATE PARSER — Handles multiple date formats
// ═══════════════════════════════════════════════════════════════

/**
 * Normalizes date strings to YYYY-MM-DD (the logs.watched_date column is DATE).
 * Handles: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, ISO timestamps.
 */
function normalizeDate(raw: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10);

  const trimmed = raw.trim();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // ISO timestamp — extract date part
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed.slice(0, 10);

  // MM/DD/YYYY or DD/MM/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, a, b, yr] = slashMatch;
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    // If first number > 12, it must be DD/MM/YYYY
    if (numA > 12) return `${yr}-${String(numB).padStart(2, '0')}-${String(numA).padStart(2, '0')}`;
    // Default to MM/DD/YYYY (US format, most common in exports)
    return `${yr}-${String(numA).padStart(2, '0')}-${String(numB).padStart(2, '0')}`;
  }

  // Fallback — try native Date parsing
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return new Date().toISOString().slice(0, 10);
}

// ═══════════════════════════════════════════════════════════════
//  TMDB FILM RESOLVER — Cached batch resolution
// ═══════════════════════════════════════════════════════════════

const resolutionCache = new Map<string, TMDBMatch | null>();

function cacheKey(title: string, year: string): string {
  return `${title.toLowerCase().trim()}|${year.trim()}`;
}

/**
 * Resolves a single film via TMDB search.
 * Uses /search/multi with year filter for precision.
 * Caches results to avoid duplicate lookups.
 */
async function resolveFilm(title: string, year: string): Promise<TMDBMatch | null> {
  const key = cacheKey(title, year);
  if (resolutionCache.has(key)) return resolutionCache.get(key) ?? null;

  try {
    const query = year ? `${title} ${year}` : title;
    const searchResult = await tmdb.search(query, 1);

    if (!searchResult?.results?.length) {
      // Retry without year (handles year mismatches)
      if (year) {
        const fallback = await tmdb.search(title, 1);
        const movie = fallback?.results?.find(r =>
          r.media_type === 'movie' || !r.media_type
        );
        if (movie) {
          const match: TMDBMatch = {
            id: movie.id,
            title: movie.title ?? movie.name ?? title,
            poster_path: movie.poster_path ?? null,
            year: movie.release_date ? parseInt(movie.release_date.slice(0, 4)) : null,
          };
          resolutionCache.set(key, match);
          return match;
        }
      }
      resolutionCache.set(key, null);
      return null;
    }

    // Find best movie match
    const yearNum = year ? parseInt(year) : null;
    const movies = searchResult.results.filter(r =>
      r.media_type === 'movie' || !r.media_type
    );

    // Prefer exact year match
    let best = yearNum
      ? movies.find(m => m.release_date?.startsWith(String(yearNum)))
      : null;

    if (!best) best = movies[0] ?? null;

    if (!best) {
      resolutionCache.set(key, null);
      return null;
    }

    const match: TMDBMatch = {
      id: best.id,
      title: best.title ?? best.name ?? title,
      poster_path: best.poster_path ?? null,
      year: best.release_date ? parseInt(best.release_date.slice(0, 4)) : null,
    };
    resolutionCache.set(key, match);
    return match;
  } catch (err: unknown) {
    logger.warn('[archiveImport] TMDB resolve failed for', title, err);
    resolutionCache.set(key, null);
    return null;
  }
}

/**
 * Resolves a batch of films with rate limiting and progress reporting.
 */
async function resolveFilmsBatch(
  entries: { title: string; year: string }[],
  onProgress?: (progress: ImportProgress) => void,
): Promise<Map<string, TMDBMatch>> {
  const resolved = new Map<string, TMDBMatch>();
  const total = entries.length;

  // Deduplicate by cache key
  const uniqueEntries = new Map<string, { title: string; year: string }>();
  for (const entry of entries) {
    const key = cacheKey(entry.title, entry.year);
    if (!uniqueEntries.has(key)) {
      uniqueEntries.set(key, entry);
    }
  }

  let current = 0;
  for (const [key, entry] of uniqueEntries) {
    current++;
    onProgress?.({
      phase: 'RESOLVING FILMS',
      current,
      total: uniqueEntries.size,
      detail: entry.title,
    });

    const wasCached = resolutionCache.has(key);
    const match = await resolveFilm(entry.title, entry.year);
    if (match) resolved.set(key, match);

    // Rate limit only actual API calls, not cache hits
    if (!wasCached) {
      await new Promise(r => setTimeout(r, RESOLVE_DELAY_MS));
    } else if (current % 20 === 0) {
      // Micro-batching event-loop yield for cache hits
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // Report final resolved count at diary level for the outer progress
  onProgress?.({
    phase: 'RESOLVING FILMS',
    current: total,
    total,
    detail: `${resolved.size} / ${uniqueEntries.size} films matched`,
  });

  return resolved;
}

// ═══════════════════════════════════════════════════════════════
//  CSV PARSERS — Diary, Reviews, Watchlist, Lists
// ═══════════════════════════════════════════════════════════════

function parseDiaryCSV(text: string): ParsedDiaryEntry[] {
  const rows = parseCSV(text);
  if (rows.length === 0) return [];

  const headers = Object.keys(rows[0]);
  const mapping = resolveHeaders(headers);
  if (!mapping) return [];

  return rows.map(row => ({
    title:       getField(row, mapping, 'title'),
    year:        getField(row, mapping, 'year'),
    rating:      parseFloat(getField(row, mapping, 'rating')) || 0,
    review:      getField(row, mapping, 'review'),
    watchedDate: getField(row, mapping, 'watchedDate'),
    isRewatch:   /yes|true|1/i.test(getField(row, mapping, 'rewatch')),
    uri:         getField(row, mapping, 'uri'),
    tags:        getField(row, mapping, 'tags'),
  })).filter(e => e.title.length > 0);
}

function parseReviewsCSV(text: string): Map<string, string> {
  const rows = parseCSV(text);
  if (rows.length === 0) return new Map();

  const headers = Object.keys(rows[0]);
  const mapping = resolveHeaders(headers);
  if (!mapping) return new Map();

  const reviews = new Map<string, string>();
  for (const row of rows) {
    const title = getField(row, mapping, 'title');
    const year = getField(row, mapping, 'year');
    const review = getField(row, mapping, 'review');
    if (title && review) {
      const key = cacheKey(title, year);
      // Keep the longer review if duplicates exist
      const existing = reviews.get(key) ?? '';
      if (review.length > existing.length) {
        reviews.set(key, review);
      }
    }
  }
  return reviews;
}

function parseWatchlistCSV(text: string): ParsedWatchlistEntry[] {
  const rows = parseCSV(text);
  if (rows.length === 0) return [];

  const headers = Object.keys(rows[0]);
  const mapping = resolveHeaders(headers);
  if (!mapping) return [];

  return rows.map(row => ({
    title:     getField(row, mapping, 'title'),
    year:      getField(row, mapping, 'year'),
    addedDate: getField(row, mapping, 'watchedDate') || getField(row, mapping, 'uri'),
  })).filter(e => e.title.length > 0);
}

function parseListCSV(text: string, fileName: string): ParsedListFile {
  const rows = parseCSV(text);
  const headers = Object.keys(rows[0] ?? {});
  const mapping = resolveHeaders(headers);

  // Extract list name from filename: "best-of-2024.csv" → "Best Of 2024"
  const name = fileName
    .replace(/\.csv$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  // Try to find a description in the first row's description field
  let description = '';
  if (mapping && rows.length > 0) {
    description = getField(rows[0], mapping, 'description');
  }

  const entries = mapping
    ? rows.map(row => ({
        title: getField(row, mapping, 'title'),
        year:  getField(row, mapping, 'year'),
      })).filter(e => e.title.length > 0)
    : [];

  return { name, description, entries };
}

// ═══════════════════════════════════════════════════════════════
//  DATABASE IMPORTERS — Batch upsert with error collection
// ═══════════════════════════════════════════════════════════════

async function importLogs(
  diary: ParsedDiaryEntry[],
  reviewMap: Map<string, string>,
  resolvedFilms: Map<string, TMDBMatch>,
  userId: string,
  onProgress?: (progress: ImportProgress) => void,
): Promise<{ imported: number; reviewCount: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let imported = 0;
  let reviewCount = 0;
  let skipped = 0;

  // Detect rating scale from the full dataset
  const allRatings = diary.map(e => e.rating).filter(r => r > 0);
  const ratingScale = allRatings.length > 0 ? detectRatingScale(allRatings) : 'half-five';

  // Build payloads
  const payloads: Record<string, unknown>[] = [];
  for (const entry of diary) {
    const key = cacheKey(entry.title, entry.year);
    const film = resolvedFilms.get(key);
    if (!film) {
      skipped++;
      continue;
    }

    // Merge review from reviews.csv if diary review is shorter
    let review = entry.review;
    const reviewFromFile = reviewMap.get(key);
    if (reviewFromFile && reviewFromFile.length > review.length) {
      review = reviewFromFile;
    }
    if (review.length > 0) reviewCount++;
    review = sanitizeInput(review, 'review'); // FEAT-1

    payloads.push({
      user_id:          userId,
      film_id:          film.id,
      film_title:       film.title,
      poster_path:      film.poster_path,
      year:             film.year,
      rating:           normalizeRatingWithScale(entry.rating, ratingScale),
      review:           review,
      status:           entry.isRewatch ? 'rewatched' : 'watched',
      watched_date:     normalizeDate(entry.watchedDate),
      is_spoiler:       false,
      view_count:       1,
      viewing_history:  [],
      format:           'digital',
      watched_with:     null,
      private_notes:    null,
      abandoned_reason: null,
      physical_media:   null,
      is_autopsied:     false,
      autopsy:          null,
      alt_poster:       null,
      editorial_header: null,
      drop_cap:         false,
      pull_quote:       '',
      video_url:        null,
    });
  }

  // Batch upsert
  const total = payloads.length;
  for (let i = 0; i < total; i += BATCH_SIZE) {
    // Micro-batching event-loop yield to prevent UI freeze
    await new Promise(r => setTimeout(r, 0));
    const batch = payloads.slice(i, i + BATCH_SIZE);
    onProgress?.({
      phase: 'IMPORTING FILM LOGS',
      current: Math.min(i + BATCH_SIZE, total),
      total,
    });

    try {
      const { error } = await supabase
        .from('logs')
        .upsert(batch, { onConflict: 'user_id,film_id', ignoreDuplicates: true });

      if (error) {
        errors.push(`Log batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
      } else {
        imported += batch.length;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`Log batch ${Math.floor(i / BATCH_SIZE) + 1}: ${msg}`);
    }
  }

  return { imported, reviewCount, skipped, errors };
}

async function importWatchlist(
  entries: ParsedWatchlistEntry[],
  resolvedFilms: Map<string, TMDBMatch>,
  userId: string,
  onProgress?: (progress: ImportProgress) => void,
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  const payloads: Record<string, unknown>[] = [];
  for (const entry of entries) {
    const key = cacheKey(entry.title, entry.year);
    const film = resolvedFilms.get(key);
    if (!film) {
      skipped++;
      continue;
    }

    payloads.push({
      user_id:     userId,
      film_id:     film.id,
      film_title:  film.title,
      poster_path: film.poster_path,
      year:        film.year,
    });
  }

  const total = payloads.length;
  for (let i = 0; i < total; i += BATCH_SIZE) {
    // Micro-batching event-loop yield to prevent UI freeze
    await new Promise(r => setTimeout(r, 0));
    const batch = payloads.slice(i, i + BATCH_SIZE);
    onProgress?.({
      phase: 'IMPORTING WATCHLIST',
      current: Math.min(i + BATCH_SIZE, total),
      total,
    });

    try {
      const { error } = await supabase
        .from('watchlists')
        .upsert(batch, { onConflict: 'user_id,film_id', ignoreDuplicates: true });

      if (error) {
        errors.push(`Watchlist batch: ${error.message}`);
      } else {
        imported += batch.length;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`Watchlist batch: ${msg}`);
    }
  }

  return { imported, skipped, errors };
}

async function importLists(
  lists: ParsedListFile[],
  resolvedFilms: Map<string, TMDBMatch>,
  userId: string,
  onProgress?: (progress: ImportProgress) => void,
): Promise<{ imported: number; errors: string[] }> {
  const errors: string[] = [];
  let imported = 0;

  for (let i = 0; i < lists.length; i++) {
    const list = lists[i];
    onProgress?.({
      phase: 'IMPORTING LISTS',
      current: i + 1,
      total: lists.length,
      detail: list.name,
    });

    try {
      // Idempotency: reuse list ID if one with the same title exists for this user
      const { data: existing } = await supabase
        .from('lists')
        .select('id')
        .eq('user_id', userId)
        .eq('title', list.name)
        .maybeSingle();

      const listId = existing?.id ?? Crypto.randomUUID();
      const { error: listErr } = await supabase.from('lists').upsert([{
        id:          listId,
        user_id:     userId,
        title:       list.name,
        description: list.description,
        is_private:  false,
        is_ranked:   false,
      }], { onConflict: 'id' });

      if (listErr) {
        errors.push(`List "${list.name}": ${listErr.message}`);
        continue;
      }

      // Resolve and insert list items with position order
      const items: Record<string, unknown>[] = [];
      for (let pos = 0; pos < list.entries.length; pos++) {
        const entry = list.entries[pos];
        const key = cacheKey(entry.title, entry.year);
        const film = resolvedFilms.get(key);
        if (!film) continue;

        items.push({
          list_id:    listId,
          film_id:    film.id,
          film_title: film.title,
          poster_path: film.poster_path,
          position:   pos,
        });
      }

      if (items.length > 0) {
        for (let j = 0; j < items.length; j += BATCH_SIZE) {
          // Micro-batching event-loop yield to prevent UI freeze
          await new Promise(r => setTimeout(r, 0));
          const batch = items.slice(j, j + BATCH_SIZE);
          const { error: itemsErr } = await supabase
            .from('list_items')
            .upsert(batch, { onConflict: 'list_id,film_id' });
          if (itemsErr) {
            errors.push(`List items "${list.name}": ${itemsErr.message}`);
          }
        }
      }

      imported++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`List "${list.name}": ${msg}`);
    }
  }

  return { imported, errors };
}

// ═══════════════════════════════════════════════════════════════
//  REELHOUSE JSON IMPORT PATH
// ═══════════════════════════════════════════════════════════════

export async function importArchiveJSON(
  archive: ReelHouseArchive,
  userId: string,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  const errors: string[] = [];
  let logCount = 0;
  let reviewCount = 0;
  let watchlistCount = 0;
  let listCount = 0;
  let skipped = 0;

  // ── Import logs ──
  const logs = archive.logs ?? [];
  if (logs.length > 0) {
    const payloads: Record<string, unknown>[] = [];

    for (const log of logs) {
      const filmId = (log.filmId ?? log.film_id) as number | undefined;
      if (!filmId) { skipped++; continue; }

      payloads.push({
        user_id:          userId,
        film_id:          filmId,
        film_title:       (log.title ?? log.film_title ?? 'Untitled') as string,
        poster_path:      (log.poster ?? log.poster_path ?? null) as string | null,
        year:             (log.year ?? null) as number | null,
        rating:           (log.rating ?? 0) as number,
        review:           sanitizeInput((log.review ?? '') as string, 'review'), // FEAT-1
        status:           (log.status ?? 'watched') as string,
        watched_date:     normalizeDate(((log.watchedDate ?? log.watched_date ?? '') as string)),
        is_spoiler:       (log.isSpoiler ?? log.is_spoiler ?? false) as boolean,
        watched_with:     (log.watchedWith ?? log.watched_with ?? null) as string | null,
        // FEAT-1: sanitize the owner-private notes too (strip zero-width/control chars).
        private_notes:    ((log.privateNotes ?? log.private_notes ?? null) as string | null)
                            ? sanitizeInput((log.privateNotes ?? log.private_notes) as string, 'review')
                            : null,
        abandoned_reason: (log.abandonedReason ?? log.abandoned_reason ?? null) as string | null,
        physical_media:   (log.physicalMedia ?? log.physical_media ?? null) as string | null,
        is_autopsied:     (log.isAutopsied ?? log.is_autopsied ?? false) as boolean,
        autopsy:          (log.autopsy ?? null) as string | null,
        alt_poster:       (log.altPoster ?? log.alt_poster ?? null) as string | null,
        editorial_header: (log.editorialHeader ?? log.editorial_header ?? null) as string | null,
        drop_cap:         (log.dropCap ?? log.drop_cap ?? false) as boolean,
        pull_quote:       (log.pullQuote ?? log.pull_quote ?? '') as string,
        video_url:        (log.videoUrl ?? log.video_url ?? null) as string | null,
        format:           (log.format ?? 'digital') as string,
        view_count:       (log.viewCount ?? log.view_count ?? 1) as number,
        viewing_history:  (log.viewingHistory ?? log.viewing_history ?? []) as unknown[],
      });

      const review = (log.review ?? '') as string;
      if (review.length > 0) reviewCount++;
    }

    for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
      // Micro-batching event-loop yield to prevent UI freeze
      await new Promise(r => setTimeout(r, 0));
      const batch = payloads.slice(i, i + BATCH_SIZE);
      onProgress?.({
        phase: 'IMPORTING FILM LOGS',
        current: Math.min(i + BATCH_SIZE, payloads.length),
        total: payloads.length,
      });

      try {
        const { error } = await supabase
          .from('logs')
          .upsert(batch, { onConflict: 'user_id,film_id', ignoreDuplicates: true });
        if (error) errors.push(`Log batch: ${error.message}`);
        else logCount += batch.length;
      } catch (err: unknown) {
        errors.push(`Log batch: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
  }

  // ── Import watchlist ──
  const watchlist = archive.watchlist ?? [];
  if (watchlist.length > 0) {
    const payloads: Record<string, unknown>[] = [];

    for (const item of watchlist) {
      const filmId = (item.filmId ?? item.film_id) as number | undefined;
      if (!filmId) { skipped++; continue; }

      payloads.push({
        user_id:     userId,
        film_id:     filmId,
        film_title:  (item.title ?? item.film_title ?? 'Untitled') as string,
        poster_path: (item.poster ?? item.poster_path ?? null) as string | null,
        year:        (item.year ?? null) as number | null,
      });
    }

    for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
      // Micro-batching event-loop yield to prevent UI freeze
      await new Promise(r => setTimeout(r, 0));
      const batch = payloads.slice(i, i + BATCH_SIZE);
      onProgress?.({
        phase: 'IMPORTING WATCHLIST',
        current: Math.min(i + BATCH_SIZE, payloads.length),
        total: payloads.length,
      });

      try {
        const { error } = await supabase
          .from('watchlists')
          .upsert(batch, { onConflict: 'user_id,film_id', ignoreDuplicates: true });
        if (error) errors.push(`Watchlist batch: ${error.message}`);
        else watchlistCount += batch.length;
      } catch (err: unknown) {
        errors.push(`Watchlist batch: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
  }

  // ── Import vault ──
  const vault = archive.vault ?? [];
  let vaultCount = 0;
  if (vault.length > 0) {
    const payloads: Record<string, unknown>[] = [];

    for (const item of vault) {
      const filmId = (item.filmId ?? item.film_id) as number | undefined;
      if (!filmId) { skipped++; continue; }

      payloads.push({
        user_id:     userId,
        film_id:     filmId,
        film_title:  (item.title ?? item.film_title ?? 'Untitled') as string,
        poster_path: (item.poster ?? item.poster_path ?? null) as string | null,
        year:        (item.year ?? null) as number | null,
        formats:     (item.formats ?? []) as string[],
        notes:       (item.notes ?? null) as string | null,
        condition:   (item.condition ?? null) as string | null,
      });
    }

    for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
      // Micro-batching event-loop yield to prevent UI freeze
      await new Promise(r => setTimeout(r, 0));
      const batch = payloads.slice(i, i + BATCH_SIZE);
      onProgress?.({
        phase: 'IMPORTING VAULT',
        current: Math.min(i + BATCH_SIZE, payloads.length),
        total: payloads.length,
      });

      try {
        const { error } = await supabase
          .from('physical_archive')
          .upsert(batch, { onConflict: 'user_id,film_id', ignoreDuplicates: true });
        if (error) errors.push(`Vault batch: ${error.message}`);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        else vaultCount += batch.length;
      } catch (err: unknown) {
        errors.push(`Vault batch: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
  }

  // ── Import lists ──
  const lists = archive.lists ?? [];
  if (lists.length > 0) {
    for (let i = 0; i < lists.length; i++) {
      const list = lists[i];
      onProgress?.({
        phase: 'IMPORTING LISTS',
        current: i + 1,
        total: lists.length,
        detail: (list.title ?? 'Untitled') as string,
      });

      try {
        const listTitle = (list.title ?? 'Untitled') as string;
        
        // Idempotency: reuse list ID if one with the same title exists for this user
        const { data: existing } = await supabase
          .from('lists')
          .select('id')
          .eq('user_id', userId)
          .eq('title', listTitle)
          .maybeSingle();

        const listId = existing?.id ?? Crypto.randomUUID();

        const { error: listErr } = await supabase.from('lists').upsert([{
          id:          listId,
          user_id:     userId,
          title:       listTitle,
          description: (list.description ?? '') as string,
          is_private:  (list.isPrivate ?? list.is_private ?? false) as boolean,
          is_ranked:   (list.isRanked ?? list.is_ranked ?? false) as boolean,
        }], { onConflict: 'id' });

        if (listErr) {
          errors.push(`List "${list.title}": ${listErr.message}`);
          continue;
        }

        const films = (list.films ?? []) as Record<string, unknown>[];
        if (films.length > 0) {
          const items = films.map((f, pos) => ({
            list_id:     listId,
            film_id:     (f.id ?? f.film_id) as number,
            film_title:  (f.title ?? f.film_title ?? 'Unknown') as string,
            poster_path: (f.poster ?? f.poster_path ?? null) as string | null,
            position:    pos,
          })).filter(item => item.film_id);

          for (let j = 0; j < items.length; j += BATCH_SIZE) {
            // Micro-batching event-loop yield to prevent UI freeze
            await new Promise(r => setTimeout(r, 0));
            const batch = items.slice(j, j + BATCH_SIZE);
            const { error: itemErr } = await supabase
              .from('list_items')
              .upsert(batch, { onConflict: 'list_id,film_id' });
            if (itemErr) errors.push(`List items: ${itemErr.message}`);
          }
        }

        listCount++;
      } catch (err: unknown) {
        errors.push(`List: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
  }

  return { logs: logCount, reviews: reviewCount, watchlist: watchlistCount, lists: listCount, skipped, errors };
}

// ═══════════════════════════════════════════════════════════════
//  FORMAT DETECTION + MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════

/**
 * Detects whether a ZIP contains CSV files (generic app export)
 * or JSON (ReelHouse export). Returns the format type.
 */
function detectArchiveFormat(zip: JSZip): 'csv' | 'json' | 'unknown' {
  const files = Object.keys(zip.files);

  // Check for JSON first (ReelHouse export)
  const jsonFile = files.find(f => f.endsWith('.json') && !f.startsWith('__MACOSX'));
  if (jsonFile) return 'json';

  // Check for CSVs (generic app export)
  const csvFiles = files.filter(f => f.endsWith('.csv') && !f.startsWith('__MACOSX'));
  if (csvFiles.length > 0) return 'csv';

  return 'unknown';
}

/**
 * Main entry point — Universal Archive Import.
 *
 * Accepts a file URI (from DocumentPicker) pointing to either:
 *   • A ZIP archive containing CSVs or JSON
 *   • A raw .json file (ReelHouse export)
 *
 * Reports progress via onProgress callback.
 * Returns ImportResult with counts and any errors.
 */
export async function importArchiveZip(
  uri: string,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('You must be signed in to import data.');

  const fileInfo = await FileSystem.getInfoAsync(uri);
  if (fileInfo.exists && fileInfo.size > 20 * 1024 * 1024) {
    throw new Error('Archive exceeds 20MB maximum size limit. Please import a smaller file to prevent memory exhaustion.');
  }

  onProgress?.({ phase: 'READING ARCHIVE', current: 0, total: 1 });

  // Clear resolution cache for fresh import
  resolutionCache.clear();

  // ── Detect file type ──
  const isJSON = uri.toLowerCase().endsWith('.json');

  if (isJSON) {
    // Raw JSON file — ReelHouse export
    const rawText = await readAsStringAsync(uri, { encoding: EncodingType.UTF8 });
    const parsed = JSON.parse(rawText) as ReelHouseArchive;
    return importArchiveJSON(parsed, user.id, onProgress);
  }

  // ── ZIP archive ──
  const rawBase64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  const zip = await JSZip.loadAsync(rawBase64, { base64: true });

  // FEAT-2: zip-bomb defense — bound entry count and total uncompressed size
  // BEFORE reading any entry (a few-KB ZIP can decompress to gigabytes).
  const MAX_ZIP_ENTRIES = 2000;
  const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50 MB
  const entryNames = Object.keys(zip.files);
  if (entryNames.length > MAX_ZIP_ENTRIES) {
    throw new Error('This archive contains too many files to import.');
  }
  let totalUncompressed = 0;
  for (const name of entryNames) {
    // JSZip exposes the uncompressed size on the internal _data; if unavailable
    // it's treated as 0 (the entry-count cap still bounds the work).
    totalUncompressed += (zip.files[name] as unknown as { _data?: { uncompressedSize?: number } })?._data?.uncompressedSize ?? 0;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      throw new Error('This archive is too large to import.');
    }
  }

  const format = detectArchiveFormat(zip);

  if (format === 'json') {
    // ZIP containing a ReelHouse JSON export
    const jsonFile = Object.keys(zip.files).find(f => f.endsWith('.json') && !f.startsWith('__MACOSX'));
    if (!jsonFile) throw new Error('No valid archive file found in ZIP.');

    const jsonText = await zip.files[jsonFile].async('string');
    const parsed = JSON.parse(jsonText) as ReelHouseArchive;
    return importArchiveJSON(parsed, user.id, onProgress);
  }

  if (format === 'csv') {
    return importCSVArchive(zip, user.id, onProgress);
  }

  throw new Error('Unrecognized archive format. Expected a ZIP containing CSV or JSON files.');
}

/**
 * Imports a CSV-based archive (any film tracking app).
 * Detects diary, reviews, watchlist, and list CSVs by content.
 */
async function importCSVArchive(
  zip: JSZip,
  userId: string,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  const allErrors: string[] = [];
  const csvFiles = Object.entries(zip.files)
    .filter(([name]) => name.endsWith('.csv') && !name.startsWith('__MACOSX'));

  onProgress?.({ phase: 'READING ARCHIVE', current: 1, total: 1, detail: `${csvFiles.length} files found` });

  // ── Classify CSV files by content ──
  let diaryText = '';
  let reviewsText = '';
  let watchlistText = '';
  let ratingsText = '';
  const listTexts: { name: string; text: string }[] = [];

  for (const [name, file] of csvFiles) {
    const text = await file.async('string');
    const baseName = name.split('/').pop()?.toLowerCase() ?? '';

    // Classify by filename first, then by header content
    if (baseName === 'diary.csv' || baseName.includes('diary')) {
      diaryText = text;
    } else if (baseName === 'reviews.csv' || baseName.includes('review')) {
      reviewsText = text;
    } else if (baseName === 'watchlist.csv' || baseName.includes('watchlist')) {
      watchlistText = text;
    } else if (baseName === 'ratings.csv' || baseName.includes('rating')) {
      ratingsText = text;
    } else if (baseName === 'watched.csv') {
      // Some exports have watched.csv — use as diary fallback
      if (!diaryText) diaryText = text;
    } else {
      // Anything else could be a list CSV
      listTexts.push({ name: baseName, text });
    }
  }

  // If no diary but we have ratings, use ratings as the diary source
  if (!diaryText && ratingsText) {
    diaryText = ratingsText;
  }

  // ── Parse CSVs ──
  const diary = diaryText ? parseDiaryCSV(diaryText) : [];
  const reviewMap = reviewsText ? parseReviewsCSV(reviewsText) : new Map<string, string>();
  const watchlistEntries = watchlistText ? parseWatchlistCSV(watchlistText) : [];
  const parsedLists = listTexts
    .map(lt => parseListCSV(lt.text, lt.name))
    .filter(l => l.entries.length > 0);

  const totalEntries = diary.length + watchlistEntries.length + parsedLists.reduce((sum, l) => sum + l.entries.length, 0);
  if (totalEntries === 0) {
    throw new Error('No film data found in archive. Check that the ZIP contains CSV files with film titles.');
  }

  // ── Collect ALL unique films across all CSVs for batch resolution ──
  const allFilms = new Map<string, { title: string; year: string }>();

  for (const entry of diary) {
    const key = cacheKey(entry.title, entry.year);
    if (!allFilms.has(key)) allFilms.set(key, { title: entry.title, year: entry.year });
  }
  for (const entry of watchlistEntries) {
    const key = cacheKey(entry.title, entry.year);
    if (!allFilms.has(key)) allFilms.set(key, { title: entry.title, year: entry.year });
  }
  for (const list of parsedLists) {
    for (const entry of list.entries) {
      const key = cacheKey(entry.title, entry.year);
      if (!allFilms.has(key)) allFilms.set(key, { title: entry.title, year: entry.year });
    }
  }

  // ── Resolve ALL films in one pass ──
  const resolvedFilms = await resolveFilmsBatch(
    Array.from(allFilms.values()),
    onProgress,
  );

  // ── Import logs ──
  const logResult = diary.length > 0
    ? await importLogs(diary, reviewMap, resolvedFilms, userId, onProgress)
    : { imported: 0, reviewCount: 0, skipped: 0, errors: [] };
  allErrors.push(...logResult.errors);

  // ── Import watchlist ──
  const wlResult = watchlistEntries.length > 0
    ? await importWatchlist(watchlistEntries, resolvedFilms, userId, onProgress)
    : { imported: 0, skipped: 0, errors: [] };
  allErrors.push(...wlResult.errors);

  // ── Import lists ──
  const listResult = parsedLists.length > 0
    ? await importLists(parsedLists, resolvedFilms, userId, onProgress)
    : { imported: 0, errors: [] };
  allErrors.push(...listResult.errors);

  const totalSkipped = logResult.skipped + wlResult.skipped;

  return {
    logs: logResult.imported,
    reviews: logResult.reviewCount,
    watchlist: wlResult.imported,
    lists: listResult.imported,
    skipped: totalSkipped,
    errors: allErrors,
  };
}
