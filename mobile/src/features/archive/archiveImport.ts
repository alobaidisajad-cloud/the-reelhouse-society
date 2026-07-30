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
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/src/lib/supabase';
import { tmdb } from '@/src/lib/tmdb';
import { useAuthStore } from '@/src/stores/auth';
import { logger } from '@/src/utils/logger';
// FEAT-1: imported review/notes text is untrusted (from arbitrary third-party
// exports) — run it through the same sanitizer as in-app writes.
import { sanitizeInput } from '@/src/utils/sanitizeInput';
import { ImportReceipt, emptyReceipt } from './importReceipt';
import { saveReceipt } from './undoImport';

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
  vault: number;
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
  /** Which service this row came from — fixes the rating scale exactly.
   *  Identical for every row of a file; carried per-entry so the import
   *  stage can read it without re-threading the parse result. */
  source?: ImportSource;
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
 * Tokenizes CSV text into raw rows (arrays of cells).
 * Handles: quoted fields, embedded commas, multiline reviews,
 * escaped quotes (""), BOM markers, and mixed line endings.
 * Exported for tests.
 */
export function parseCSVRows(text: string): string[][] {
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

  return rows;
}

/**
 * Parses CSV text into an array of record objects keyed by the first row's
 * headers. Exported for tests.
 */
export function parseCSV(text: string): Record<string, string>[] {
  const rows = parseCSVRows(text);
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
export type ImportSource = 'letterboxd' | 'imdb' | 'trakt' | 'unknown';

/**
 * Identifies the exporting service from the header row. Every service uses a
 * FIXED rating scale, so knowing the source removes the guess entirely.
 *
 * This is the fix for the worst silent corruption in import: an IMDb export
 * from someone whose highest score was a 5 looks identical, by max value, to a
 * 5-star export. Read by max alone it is misread as half-five and EVERY rating
 * is doubled — permanently, because logs upserts with ignoreDuplicates.
 * Exported for tests.
 */
export function detectSource(headers: string[]): ImportSource {
  const h = headers.map(x => x.trim().toLowerCase());
  const has = (name: string) => h.includes(name);

  // Letterboxd stamps its own URI column into every export it produces.
  if (h.some(x => x.includes('letterboxd'))) return 'letterboxd';
  // IMDb: 'Const' is its title id, and it ships with 'Title Type'.
  if (has('const') && (has('title type') || has('your rating') || has('imdb rating'))) return 'imdb';
  // Trakt uses snake_case timestamps no other exporter emits.
  if (has('rated_at') || has('watched_at') || has('trakt_rating')) return 'trakt';
  return 'unknown';
}

/**
 * The scale each service publishes ratings on, with the highest value that
 * service can actually emit. The ceiling matters: a value above it is proof
 * the fingerprint does not hold for this data (a merged export, a hand-edited
 * sheet, a column that only looks like a known one), and forcing the source's
 * scale anyway would clamp every value above the ceiling to a flat 5.
 */
const SOURCE_SCALE: Record<Exclude<ImportSource, 'unknown'>, { scale: 'half-five' | 'ten'; ceiling: number }> = {
  letterboxd: { scale: 'half-five', ceiling: 5 },  // 0.5–5 in half steps
  imdb:       { scale: 'ten',       ceiling: 10 }, // 1–10 integers
  trakt:      { scale: 'ten',       ceiling: 10 }, // 1–10 integers
};

/**
 * Decides the rating scale of an export. A decision ladder, strongest evidence
 * first — every rung is a fact, not a heuristic:
 *
 *   1. a recognised source, and the data fits what that service can emit
 *                           -> that service's published scale
 *   2. max > 10             -> hundred
 *   3. max > 5              -> ten
 *   4. otherwise            -> half-five
 *
 * Rung 1 is checked against the source's CEILING rather than trusted blindly.
 * A file fingerprinted Letterboxd but carrying a 9 cannot really be Letterboxd
 * data, and forcing half-five onto it would clamp 7, 9 and 10 all to 5 reels.
 * When the data contradicts the fingerprint, the data wins and we fall to the
 * numeric ladder.
 *
 * WHY THERE IS NO "a fractional value proves a 5-star scale" RUNG:
 * it reads as compelling — an integer 1–10 scale cannot emit 3.5 — but it is
 * only sound when the maximum is already at or below 5, where the answer is
 * half-five regardless. Above that it is actively wrong: a tracker using
 * 0.5–10 in half steps emits BOTH fractional values and a max above 5, and
 * treating it as half-five clamps 7, 7.5 and 9 all to a flat 5 reels. So the
 * check would be redundant where it is right and destructive where it is not.
 * Max alone is the honest signal once the source is unknown.
 *
 * Rung 4 is the only genuinely undecidable case (a hand-made file, no
 * recognisable source, nothing above 5) — out-of-5 and out-of-10 produce
 * byte-identical data there, so no algorithm can separate them. That case is
 * covered by making the import reversible, not by guessing harder.
 */
export function detectRatingScale(
  ratings: number[],
  source: ImportSource = 'unknown',
): 'half-five' | 'ten' | 'hundred' {
  const positive = ratings.filter(r => r > 0);

  if (source !== 'unknown') {
    const { scale, ceiling } = SOURCE_SCALE[source];
    // No ratings at all: nothing can contradict the fingerprint, so trust it.
    if (positive.length === 0) return scale;
    if (Math.max(...positive) <= ceiling) return scale;
    // Data exceeds what this service can emit — the fingerprint does not hold.
  }

  if (positive.length === 0) return 'half-five';

  const max = Math.max(...positive);
  if (max > 10) return 'hundred';
  if (max > 5) return 'ten';
  return 'half-five';
}

/**
 * Decides DD/MM vs MM/DD for an ENTIRE file, in one pass.
 *
 * Deciding this per row is why a European export half-imports today:
 * 25/03/2024 parses correctly (25 cannot be a month) while 05/03/2024 silently
 * becomes 3 May. Half the dates are wrong and nothing looks broken.
 *
 * BOTH formats leave proof, and both sides must be counted:
 *   first  number > 12  ->  day-first  (25/03 — no month exceeds 12)
 *   second number > 12  ->  month-first (03/25 — likewise)
 *
 * Taking the first day-first row as decisive would let ONE malformed or
 * hand-typed row flip an entire month-first file, transposing every ambiguous
 * date in it. So the side with more evidence wins, and a file with no proof
 * either way keeps today's MM/DD default (the common export format).
 */
export function detectDateFormat(dates: string[]): 'MDY' | 'DMY' {
  let dayFirst = 0;
  let monthFirst = 0;
  for (const d of dates) {
    const m = String(d ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/\d{4}$/);
    if (!m) continue;
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (a > 12 && b <= 12) dayFirst++;
    else if (b > 12 && a <= 12) monthFirst++;
    // a > 12 && b > 12 is not a date in either reading — it proves nothing.
  }
  return dayFirst > monthFirst ? 'DMY' : 'MDY';
}

/**
 * Clamps any rating into the DB's hard CHECK range [0, 5]. Without this, a
 * single out-of-range value (e.g. a 200 on a "hundred" scale → 10, or a corrupt
 * JSON rating of 9) violates logs_rating_check and kills its whole insert batch.
 * Exported for tests.
 */
export function clampRating(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(5, n);
}

export function normalizeRatingWithScale(raw: number, scale: 'half-five' | 'ten' | 'hundred'): number {
  if (!raw || raw <= 0) return 0;
  switch (scale) {
    case 'ten':     return clampRating(Math.round((raw / 2) * 2) / 2);
    case 'hundred': return clampRating(Math.round((raw / 20) * 2) / 2);
    case 'half-five':
    default:        return clampRating(Math.round(raw * 2) / 2);
  }
}

// ═══════════════════════════════════════════════════════════════
//  DATE PARSER — Handles multiple date formats
// ═══════════════════════════════════════════════════════════════

/**
 * Normalizes date strings to YYYY-MM-DD (the logs.watched_date column is DATE).
 * Handles: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, ISO timestamps.
 * Future dates are clamped to today — a native log can't be created in the
 * future, so imports must not be either. Exported for tests.
 */
export function normalizeDate(raw: string, format: 'MDY' | 'DMY' = 'MDY'): string {
  const today = new Date().toISOString().slice(0, 10);
  if (!raw) return today;

  const trimmed = raw.trim();
  const clamp = (d: string) => (d > today ? today : d);

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return clamp(trimmed);

  // ISO timestamp — extract date part
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return clamp(trimmed.slice(0, 10));

  // MM/DD/YYYY or DD/MM/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, a, b, yr] = slashMatch;
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    const day   = (n: number) => String(n).padStart(2, '0');
    // A first number above 12 is proof on its own — no month exceeds 12.
    // Otherwise defer to the FILE-level verdict from detectDateFormat, which
    // saw every row. Deciding per row is what makes a European export
    // half-correct: 25/03 survives, 05/03 silently becomes 3 May.
    if (numA > 12 || format === 'DMY') return clamp(`${yr}-${day(numB)}-${day(numA)}`);
    return clamp(`${yr}-${day(numA)}-${day(numB)}`);
  }

  // Fallback — try native Date parsing
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) return clamp(parsed.toISOString().slice(0, 10));

  return today;
}

/**
 * Native-parity timestamps for an imported row: a film watched in 2019 was
 * *logged* in 2019, so created_at/updated_at are backdated to the watch date
 * (noon UTC — timezone-safe for a DATE), clamped to now. This is also what
 * keeps a large import from flooding the community feed (which orders by
 * created_at) with hundreds of "just now" entries. Exported for tests.
 */
export function backdatedTimestamps(watchedDate: string): { created_at: string; updated_at: string } {
  const nowIso = new Date().toISOString();
  let ts = `${normalizeDate(watchedDate)}T12:00:00.000Z`;
  if (ts > nowIso) ts = nowIso;
  return { created_at: ts, updated_at: ts };
}

/**
 * Validates a timestamp coming from an archive (ReelHouse JSON export) for
 * passthrough. Returns the ISO string if parseable and not in the future,
 * else null (caller falls back to backdating). Exported for tests.
 */
export function importableTimestamp(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) return null;
  const iso = parsed.toISOString();
  return iso > new Date().toISOString() ? null : iso;
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

    // CONFIDENCE GATE. tmdb.search already reports HOW it found a result, and
    // this resolver used to ignore it and take movies[0] regardless. 'semantic'
    // is keyword discovery — it will happily return *a* film for a title that
    // has no genuine match, and the member's review is then filed against a
    // film they have never seen. 'person' matched an actor or director, not a
    // title. Neither is evidence of the right film, so neither is accepted.
    // A rejected row is reported as unmatched; a wrong match is invisible forever.
    const st = searchResult.searchType;
    if (st === 'semantic' || st === 'person' || st === 'failed') {
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

    // No year agreement. The title alone has to carry it, so accept the top
    // result only for an exact title match — a typo correction with a year that
    // also disagrees has nothing corroborating it and is declined.
    if (!best && (!yearNum || st === 'exact' || st === undefined)) best = movies[0] ?? null;

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

  // Two decisions that belong to the FILE, not to a row. Made once, here,
  // where every row is in hand — the parse boundary is the only place that
  // sees the whole export.
  const source = detectSource(headers);
  const dateFormat = detectDateFormat(rows.map(r => getField(r, mapping, 'watchedDate')));

  return rows.map(row => ({
    title:       getField(row, mapping, 'title'),
    year:        getField(row, mapping, 'year'),
    rating:      parseFloat(getField(row, mapping, 'rating')) || 0,
    review:      getField(row, mapping, 'review'),
    // Resolved to YYYY-MM-DD here using the file-wide verdict. Downstream
    // normalizeDate calls then pass it straight through (it is idempotent on
    // ISO dates), so no call site needs to know about the format.
    watchedDate: normalizeDate(getField(row, mapping, 'watchedDate'), dateFormat),
    source,
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
    addedDate: getField(row, mapping, 'watchedDate'),
  })).filter(e => e.title.length > 0);
}

/**
 * True when a raw CSV row *is* a header row: at least 3 of its cells are
 * literal known column names, one of them a title synonym. The real film-table
 * header of a two-section list export ("Position,Name,Year,URL,Description")
 * matches 5; a genuine film row would need three cells that are literally
 * header words to false-positive — effectively impossible.
 */
const ALL_HEADER_SYNONYMS = new Set(Object.values(HEADER_MAP).flat());
function isHeaderRow(cells: string[]): boolean {
  const lowered = cells.map(c => c.toLowerCase().trim());
  if (!lowered.some(c => HEADER_MAP.title.includes(c))) return false;
  return lowered.filter(c => ALL_HEADER_SYNONYMS.has(c)).length >= 3;
}

/**
 * Parses a list CSV — including the common two-section format, where a
 * metadata block about the list itself (name/description) precedes the actual
 * film table with its own embedded header row. We anchor on the LAST
 * header-looking row within the first few rows; single-section files resolve
 * to row 0, byte-identical to the simple path. Entries honor an explicit
 * position/rank column when present, so ranked stacks import with every film
 * in its right placement. Exported for tests.
 */
export function parseListCSV(text: string, fileName: string): ParsedListFile {
  const rawRows = parseCSVRows(text).filter(row => row.some(cell => cell.length > 0));

  // Fallback list name from filename: "best-of-2024.csv" → "Best Of 2024"
  let name = fileName
    .replace(/\.csv$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  if (rawRows.length < 2) return { name, description: '', entries: [] };

  // Anchor the film table on the last header row within the scan window.
  const SCAN_WINDOW = Math.min(6, rawRows.length - 1);
  let headerIdx = 0;
  for (let i = 0; i <= SCAN_WINDOW; i++) {
    if (isHeaderRow(rawRows[i])) headerIdx = i;
  }

  const headers = rawRows[headerIdx];
  const mapping = resolveHeaders(headers);

  // Two-section format: the metadata block above the film table carries the
  // list's EXACT original name (punctuation, casing — better than the slugified
  // filename) and its description. Prefer both when present.
  let description = '';
  if (headerIdx > 0) {
    const metaMapping = resolveHeaders(rawRows[0]);
    if (metaMapping) {
      if (metaMapping.title) {
        const nameIdx = rawRows[0].indexOf(metaMapping.title);
        const exactName = rawRows[1]?.[nameIdx]?.trim();
        if (exactName) name = exactName;
      }
      if (metaMapping.description) {
        const metaIdx = rawRows[0].indexOf(metaMapping.description);
        description = rawRows[1]?.[metaIdx] ?? '';
      }
    }
  }

  if (!mapping) return { name, description, entries: [] };

  const toRecord = (row: string[]): Record<string, string> => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = row[idx] ?? ''; });
    return obj;
  };

  const records = rawRows.slice(headerIdx + 1).map(toRecord);
  if (!description) description = records.length > 0 ? getField(records[0], mapping, 'description') : '';

  let entries = records
    .map((row, idx) => ({
      title: getField(row, mapping, 'title'),
      year:  getField(row, mapping, 'year'),
      _pos:  parseInt(getField(row, mapping, 'position'), 10),
      _idx:  idx,
    }))
    .filter(e => e.title.length > 0);

  // Honor an explicit position/rank column (stable; file order breaks ties).
  if (mapping.position && entries.some(e => Number.isFinite(e._pos))) {
    entries = entries.slice().sort((a, b) => {
      const pa = Number.isFinite(a._pos) ? a._pos : a._idx + 1e9;
      const pb = Number.isFinite(b._pos) ? b._pos : b._idx + 1e9;
      return pa - pb || a._idx - b._idx;
    });
  }

  return { name, description, entries: entries.map(({ title, year }) => ({ title, year })) };
}

// ═══════════════════════════════════════════════════════════════
//  NATIVE-PARITY HELPERS — ordering, rewatch aggregation
// ═══════════════════════════════════════════════════════════════

/**
 * Orders films from an archive for list-item placement: by rank_position when
 * present (ReelHouse exports), else a legacy/third-party `position`, else
 * original array order. Stable — every film lands in its right placement.
 * Exported for tests.
 */
export function orderImportedFilms<T extends Record<string, unknown>>(films: T[]): T[] {
  return films
    .map((f, idx) => ({ f, idx }))
    .sort((a, b) => {
      const ra = Number(a.f.rank_position ?? a.f.position ?? NaN);
      const rb = Number(b.f.rank_position ?? b.f.position ?? NaN);
      const ka = Number.isFinite(ra) ? ra : a.idx + 1e9;
      const kb = Number.isFinite(rb) ? rb : b.idx + 1e9;
      return ka - kb || a.idx - b.idx;
    })
    .map(({ f }) => f);
}

/** One film aggregated from possibly-multiple diary rows (rewatches). */
export interface AggregatedDiaryFilm {
  title: string;
  year: string;
  /** The latest watch — becomes the current row (native rewatch semantics). */
  latest: ParsedDiaryEntry;
  /** Earlier watches, oldest→newest — archived into viewing_history. */
  earlier: ParsedDiaryEntry[];
  viewCount: number;
  isRewatch: boolean;
}

/**
 * Groups diary rows by film so rewatches import the way the app itself records
 * them (see logOperations.applyRewatchMerge): ONE row per film holding the
 * latest watch, earlier watches archived into viewing_history, view_count =
 * number of watches. Without this, ignoreDuplicates silently discarded every
 * watch after the first. Exported for tests.
 */
export function aggregateDiaryEntries(diary: ParsedDiaryEntry[]): AggregatedDiaryFilm[] {
  const byFilm = new Map<string, ParsedDiaryEntry[]>();
  for (const entry of diary) {
    const key = cacheKey(entry.title, entry.year);
    const arr = byFilm.get(key);
    if (arr) arr.push(entry); else byFilm.set(key, [entry]);
  }

  const result: AggregatedDiaryFilm[] = [];
  for (const watches of byFilm.values()) {
    // Oldest → newest by normalized watch date (stable for same-day watches).
    const sorted = watches
      .map((w, idx) => ({ w, d: normalizeDate(w.watchedDate), idx }))
      .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.idx - b.idx))
      .map(({ w }) => w);

    const latest = sorted[sorted.length - 1];
    const earlier = sorted.slice(0, -1);

    // Native "empty keeps previous" merge: if the latest watch carries no
    // rating/review, inherit the most recent earlier one that does.
    let rating = latest.rating;
    let review = latest.review;
    for (let i = earlier.length - 1; i >= 0 && (rating <= 0 || review.length === 0); i--) {
      if (rating <= 0 && earlier[i].rating > 0) rating = earlier[i].rating;
      if (review.length === 0 && earlier[i].review.length > 0) review = earlier[i].review;
    }

    result.push({
      title: latest.title,
      year: latest.year,
      latest: { ...latest, rating, review },
      earlier,
      viewCount: sorted.length,
      isRewatch: sorted.length > 1 || sorted.some(w => w.isRewatch),
    });
  }
  return result;
}

/**
 * Archives earlier watches in the app's exact native viewing_history shape
 * (camelCase entries, newest-first — mirrors logOperations.applyRewatchMerge).
 * Exported for tests.
 */
export function buildViewingHistory(
  earlier: ParsedDiaryEntry[],
  ratingScale: 'half-five' | 'ten' | 'hundred',
): Record<string, unknown>[] {
  return earlier
    .slice()
    .reverse() // newest-first, matching [archivedEntry, ...oldHistory]
    .map(w => ({
      date: normalizeDate(w.watchedDate),
      rating: normalizeRatingWithScale(w.rating, ratingScale),
      review: sanitizeInput(w.review, 'review'),
      isSpoiler: false,
      watchedWith: '',
      privateNotes: '',
      physicalMedia: 'None',
      status: 'watched',
      abandonedReason: null,
      isAutopsied: false,
      autopsy: null,
      altPoster: null,
      editorialHeader: null,
      dropCap: false,
      pullQuote: '',
      videoUrl: null,
      format: 'digital',
    }));
}

// ═══════════════════════════════════════════════════════════════
//  DATABASE IMPORTERS — Batch upsert with error collection
// ═══════════════════════════════════════════════════════════════

/**
 * Upserts a batch and returns the ids of the rows ACTUALLY written.
 *
 * With ignoreDuplicates: true, .select('id') returns ONLY genuine inserts —
 * conflicting rows are skipped and never come back. That is what makes both the
 * honest count (.length) and a safe undo possible: an id here is a row that did
 * not exist before, so deleting it cannot touch anything the member already had.
 *
 * With ignoreDuplicates: false the result also includes UPDATED rows, so a
 * caller in that mode must establish for itself which keys are new
 * (see the pre-existing-film_ids probe in the list importer).
 *
 * If the whole batch fails (e.g. one row violates a CHECK constraint), retries
 * row-by-row so a single bad row can't sink its 49 neighbors; per-row errors
 * are collected, capped so a filthy file can't flood the report.
 */
const MAX_COLLECTED_ERRORS = 20;
async function upsertCounted(
  table: string,
  batch: Record<string, unknown>[],
  onConflict: string,
  ignoreDuplicates: boolean,
  label: string,
  errors: string[],
): Promise<string[]> {
  const idsOf = (rows: { id?: unknown }[] | null) =>
    (rows ?? []).map(r => String(r.id)).filter(id => id && id !== 'undefined');
  try {
    const { data, error } = await supabase
      .from(table)
      .upsert(batch, { onConflict, ignoreDuplicates })
      .select('id');
    if (!error) return idsOf(data);

    // Batch rejected — isolate the poison row(s) instead of losing the batch.
    const ok: string[] = [];
    for (const row of batch) {
      const { data: single, error: rowErr } = await supabase
        .from(table)
        .upsert([row], { onConflict, ignoreDuplicates })
        .select('id');
      if (rowErr) {
        if (errors.length < MAX_COLLECTED_ERRORS) errors.push(`${label}: ${rowErr.message}`);
      } else {
        ok.push(...idsOf(single));
      }
    }
    return ok;
  } catch (err: unknown) {
    if (errors.length < MAX_COLLECTED_ERRORS) {
      errors.push(`${label}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    return [];
  }
}

/**
 * Every existing item of one stack, paginated.
 *
 * A bare .select() is capped by PostgREST's max-rows (1000 on a default
 * Supabase project), and a SILENT truncation here is dangerous in two ways:
 * the rank offset would be computed from a partial set and collide with real
 * placements, and — far worse — films the member already owned would be absent
 * from preExistingFilmIds and therefore look like rows this import created,
 * which would let UNDO delete their own films. Paginate rather than trust the
 * default. Returns null if any page errors, so callers can fail safe instead of
 * acting on a partial answer.
 */
const ITEM_PAGE = 1000;
async function fetchAllListItems(
  listId: string,
): Promise<{ film_id: unknown; rank_position: unknown }[] | null> {
  const all: { film_id: unknown; rank_position: unknown }[] = [];
  for (let from = 0; ; from += ITEM_PAGE) {
    const { data, error } = await supabase
      .from('list_items')
      .select('film_id, rank_position')
      .eq('list_id', listId)
      .order('film_id', { ascending: true })
      .range(from, from + ITEM_PAGE - 1);
    if (error) return null;
    const page = data ?? [];
    all.push(...page);
    if (page.length < ITEM_PAGE) return all;
  }
}

async function importLogs(
  diary: ParsedDiaryEntry[],
  reviewMap: Map<string, string>,
  resolvedFilms: Map<string, TMDBMatch>,
  userId: string,
  receipt: ImportReceipt,
  onProgress?: (progress: ImportProgress) => void,
): Promise<{ imported: number; reviewCount: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let imported = 0;
  let reviewCount = 0;
  let skipped = 0;

  // Rating scale for the whole dataset. The source (from the export's header
  // fingerprint) settles it outright when known — Letterboxd is always out of
  // 5, IMDb and Trakt always out of 10 — so a 1–10 export from someone who
  // never scored above 5 can no longer be misread as out-of-5 and doubled.
  const source = diary.find(e => e.source)?.source ?? 'unknown';
  const allRatings = diary.map(e => e.rating).filter(r => r > 0);
  const ratingScale = allRatings.length > 0 || source !== 'unknown'
    ? detectRatingScale(allRatings, source)
    : 'half-five';

  // Native rewatch semantics: one row per film, latest watch current, earlier
  // watches archived into viewing_history (see aggregateDiaryEntries).
  const films = aggregateDiaryEntries(diary);

  // Build payloads
  const payloads: Record<string, unknown>[] = [];
  for (const agg of films) {
    const key = cacheKey(agg.title, agg.year);
    const film = resolvedFilms.get(key);
    if (!film) {
      // One unidentified FILM, not one per viewing. The UI labels this
      // "films could not be matched", so a film watched six times used to
      // report six unmatched films and inflate the number the member sees.
      skipped += 1;
      continue;
    }

    // Merge review from reviews.csv if the diary review is shorter
    let review = agg.latest.review;
    const reviewFromFile = reviewMap.get(key);
    if (reviewFromFile && reviewFromFile.length > review.length) {
      review = reviewFromFile;
    }
    if (review.length > 0) reviewCount++;
    review = sanitizeInput(review, 'review'); // FEAT-1

    // Native-parity timeline: the row was created at the FIRST watch and last
    // touched at the LATEST — exactly as if logged + rewatched in the app.
    const firstWatch = agg.earlier.length > 0 ? agg.earlier[0].watchedDate : agg.latest.watchedDate;
    const { created_at } = backdatedTimestamps(firstWatch);
    const { created_at: updated_at } = backdatedTimestamps(agg.latest.watchedDate);

    payloads.push({
      user_id:          userId,
      film_id:          film.id,
      film_title:       film.title,
      poster_path:      film.poster_path,
      year:             film.year,
      rating:           normalizeRatingWithScale(agg.latest.rating, ratingScale),
      review:           review,
      status:           agg.isRewatch ? 'rewatched' : 'watched',
      watched_date:     normalizeDate(agg.latest.watchedDate),
      is_spoiler:       false,
      view_count:       agg.viewCount,
      viewing_history:  buildViewingHistory(agg.earlier, ratingScale),
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
      created_at,
      updated_at,
    });
  }

  // Batch upsert — honest counts + per-row fallback on batch failure
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
    const newLogIds = await upsertCounted('logs', batch, 'user_id,film_id', true, 'Film log', errors);
    imported += newLogIds.length;
    // ignoreDuplicates: true — these ids are rows that did NOT exist before,
    // so undo can delete them without touching anything the member already had.
    receipt.logIds.push(...newLogIds);
  }

  return { imported, reviewCount, skipped, errors };
}

async function importWatchlist(
  entries: ParsedWatchlistEntry[],
  resolvedFilms: Map<string, TMDBMatch>,
  userId: string,
  receipt: ImportReceipt,
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
      // Native parity: added when the source says it was added, not "now".
      ...(entry.addedDate ? backdatedTimestamps(entry.addedDate) : {}),
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
    const newWatchIds = await upsertCounted('watchlists', batch, 'user_id,film_id', true, 'Watchlist', errors);
    imported += newWatchIds.length;
    receipt.watchlistIds.push(...newWatchIds);
  }

  return { imported, skipped, errors };
}

async function importLists(
  lists: ParsedListFile[],
  resolvedFilms: Map<string, TMDBMatch>,
  userId: string,
  receipt: ImportReceipt,
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
      // FEAT-1: list name/description come from untrusted files — sanitize with
      // the same caps the in-app editor enforces (lossless for native content).
      const safeTitle = sanitizeInput(list.name, 'listTitle') || 'Imported Stack';
      const safeDescription = sanitizeInput(list.description, 'listDescription');

      // Idempotency: reuse list ID if one with the same title exists for this
      // user. Read the member's OWN settings too — merging into a stack they
      // already have must never silently rewrite how it is configured.
      const { data: existing } = await supabase
        .from('lists')
        .select('id, is_private, is_ranked, description')
        .eq('user_id', userId)
        .eq('title', safeTitle)
        .maybeSingle();

      const listId = existing?.id ?? Crypto.randomUUID();
      const { error: listErr } = await supabase.from('lists').upsert([{
        id:          listId,
        user_id:     userId,
        title:       safeTitle,
        // Round-trip the member's settings instead of overwriting them. The
        // hardcoded `false` here meant importing a file that happened to share
        // a title with an existing PRIVATE stack published it — no warning, no
        // trace. Their own description wins; the imported one only fills a gap.
        description: existing ? (existing.description || safeDescription) : safeDescription,
        is_private:  existing?.is_private ?? false,
        is_ranked:   existing?.is_ranked ?? false,
      }], { onConflict: 'id' });

      if (listErr) {
        errors.push(`List "${safeTitle}": ${listErr.message}`);
        continue;
      }

      // A stack we created is ours to remove entirely on undo. A stack that
      // already existed is the member's — only the films we add to it may be
      // taken back, never the stack itself.
      if (!existing?.id) receipt.listsCreated.push(listId);

      // Appending to a stack the member already has must not renumber what is
      // already in it. Start after their last film instead of restarting at 0,
      // which would collide every imported film onto an existing rank and
      // scramble the order of a ranked stack they had curated by hand.
      let rankOffset = 0;
      let preExistingFilmIds = new Set<number>();
      // Only safe to record undo entries for this stack if we know EXACTLY what
      // was in it beforehand. A failed probe means we don't, and guessing could
      // let undo delete the member's own films.
      let priorItemsKnown = true;
      if (existing?.id) {
        // list_items is upserted with ignoreDuplicates: false, so its .select()
        // returns updated rows as well as inserted ones and cannot be trusted to
        // say what is new. Establish that here instead: anything already present
        // is the member's and must survive an undo.
        const priorItems = await fetchAllListItems(listId);
        if (priorItems === null) {
          priorItemsKnown = false;
        } else {
          preExistingFilmIds = new Set(priorItems.map(r => Number(r.film_id)));
          const maxRank = priorItems.reduce(
            (m, r) => (typeof r.rank_position === 'number' && r.rank_position > m ? r.rank_position : m),
            -1,
          );
          rankOffset = maxRank + 1;
        }
      }

      // Resolve and insert list items in order — rank_position is the app's
      // ordering column (0-based, matching listSlice), so every film lands in
      // its right placement.
      const items: Record<string, unknown>[] = [];
      for (const entry of list.entries) {
        const key = cacheKey(entry.title, entry.year);
        const film = resolvedFilms.get(key);
        if (!film) continue;

        items.push({
          list_id:       listId,
          film_id:       film.id,
          film_title:    film.title,
          poster_path:   film.poster_path,
          rank_position: rankOffset + items.length,
        });
      }

      if (items.length > 0) {
        for (let j = 0; j < items.length; j += BATCH_SIZE) {
          // Micro-batching event-loop yield to prevent UI freeze
          await new Promise(r => setTimeout(r, 0));
          const batch = items.slice(j, j + BATCH_SIZE);
          await upsertCounted('list_items', batch, 'list_id,film_id', false, `List items "${safeTitle}"`, errors);
        }

        // Only films that were NOT already in this stack are ours to undo. For a
        // stack we created the whole list is on the receipt already, so its items
        // would be removed by the FK cascade — recording them again would be
        // redundant, not wrong, but we keep the receipt minimal and honest.
        // priorItemsKnown gates this: if the probe failed we cannot tell our
        // films from theirs, so we record NOTHING. A smaller undo is a fair
        // price; deleting a film the member added themselves is not.
        if (existing?.id && priorItemsKnown) {
          const addedFilmIds = items
            .map(it => Number(it.film_id))
            .filter(id => Number.isFinite(id) && !preExistingFilmIds.has(id));
          if (addedFilmIds.length > 0) {
            receipt.listItemsAdded.push({ listId, filmIds: addedFilmIds });
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
  // Same undo guarantee as the CSV path — see importReceipt.ts.
  const receipt = emptyReceipt(userId, 'your archive');
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

      const watchedDate = normalizeDate(((log.watchedDate ?? log.watched_date ?? '') as string));
      // Native-parity timeline: preserve the original created_at from the
      // export (a migrated account keeps its true history); fall back to
      // backdating from the watch date. Never in the future.
      const originalCreated = importableTimestamp(log.createdAt ?? log.created_at);
      const originalUpdated = importableTimestamp(log.updatedAt ?? log.updated_at);
      const fallback = backdatedTimestamps(watchedDate);
      const created_at = originalCreated ?? fallback.created_at;

      payloads.push({
        user_id:          userId,
        film_id:          filmId,
        film_title:       (log.title ?? log.film_title ?? 'Untitled') as string,
        poster_path:      (log.poster ?? log.poster_path ?? null) as string | null,
        year:             (log.year ?? null) as number | null,
        rating:           clampRating(log.rating), // hard DB CHECK is [0,5]
        review:           sanitizeInput((log.review ?? '') as string, 'review'), // FEAT-1
        status:           (log.status ?? 'watched') as string,
        watched_date:     watchedDate,
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
        created_at,
        updated_at:       originalUpdated ?? created_at,
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
      const newLogIds = await upsertCounted('logs', batch, 'user_id,film_id', true, 'Film log', errors);
      logCount += newLogIds.length;
      receipt.logIds.push(...newLogIds);
    }
  }

  // ── Import watchlist ──
  const watchlist = archive.watchlist ?? [];
  if (watchlist.length > 0) {
    const payloads: Record<string, unknown>[] = [];

    for (const item of watchlist) {
      const filmId = (item.filmId ?? item.film_id) as number | undefined;
      if (!filmId) { skipped++; continue; }

      const originalCreated = importableTimestamp(item.createdAt ?? item.created_at);
      payloads.push({
        user_id:     userId,
        film_id:     filmId,
        film_title:  (item.title ?? item.film_title ?? 'Untitled') as string,
        poster_path: (item.poster ?? item.poster_path ?? null) as string | null,
        year:        (item.year ?? null) as number | null,
        // Native parity: keep the original "added" date when the export has it.
        ...(originalCreated ? { created_at: originalCreated, updated_at: originalCreated } : {}),
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
      const newWatchIds = await upsertCounted('watchlists', batch, 'user_id,film_id', true, 'Watchlist', errors);
      watchlistCount += newWatchIds.length;
      receipt.watchlistIds.push(...newWatchIds);
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

      const originalCreated = importableTimestamp(item.createdAt ?? item.created_at);
      const rawNotes = (item.notes ?? null) as string | null;
      payloads.push({
        user_id:     userId,
        film_id:     filmId,
        film_title:  (item.title ?? item.film_title ?? 'Untitled') as string,
        poster_path: (item.poster ?? item.poster_path ?? null) as string | null,
        year:        (item.year ?? null) as number | null,
        formats:     (item.formats ?? []) as string[],
        // FEAT-1: vault notes are untrusted text — same sanitizer as reviews
        // ('review' cap = 5000, lossless for anything written in-app).
        notes:       rawNotes ? sanitizeInput(rawNotes, 'review') : null,
        condition:   (item.condition ?? null) as string | null,
        ...(originalCreated ? { created_at: originalCreated } : {}),
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
      const newVaultIds = await upsertCounted('physical_archive', batch, 'user_id,film_id', true, 'Vault', errors);
      vaultCount += newVaultIds.length;
      receipt.physicalArchiveIds.push(...newVaultIds);
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
        // FEAT-1: untrusted title/description — same caps as the in-app editor.
        const listTitle = sanitizeInput((list.title ?? 'Untitled') as string, 'listTitle') || 'Imported Stack';
        const listDescription = sanitizeInput((list.description ?? '') as string, 'listDescription');
        const originalCreated = importableTimestamp(list.createdAt ?? list.created_at);

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
          description: listDescription,
          is_private:  (list.isPrivate ?? list.is_private ?? false) as boolean,
          is_ranked:   (list.isRanked ?? list.is_ranked ?? false) as boolean,
          ...(originalCreated ? { created_at: originalCreated } : {}),
        }], { onConflict: 'id' });

        if (listErr) {
          errors.push(`List "${listTitle}": ${listErr.message}`);
          continue;
        }

        // A stack we created is ours to remove on undo; one that already
        // existed is the member's, so only the films we add to it are.
        if (!existing?.id) receipt.listsCreated.push(listId);
        let priorFilmIds = new Set<number>();
        // Same rule as the CSV path: without a complete picture of what was
        // already in this stack we record no undo entries for it, because a
        // truncated or failed probe would make the member's own films look
        // like ours to delete.
        let priorKnown = true;
        if (existing?.id) {
          const priorItems = await fetchAllListItems(listId);
          if (priorItems === null) priorKnown = false;
          else priorFilmIds = new Set(priorItems.map(r => Number(r.film_id)));
        }

        // Order films by rank_position (ReelHouse exports) / legacy position /
        // array order, then write the app's real ordering column (0-based) —
        // every film in its right placement, even from old bloated exports.
        const films = orderImportedFilms((list.films ?? []) as Record<string, unknown>[]);
        if (films.length > 0) {
          const items = films.map((f) => ({
            list_id:     listId,
            film_id:     (f.id ?? f.film_id) as number,
            film_title:  (f.title ?? f.film_title ?? 'Unknown') as string,
            poster_path: (f.poster ?? f.poster_path ?? null) as string | null,
            ...(importableTimestamp(f.created_at) ? { created_at: importableTimestamp(f.created_at) } : {}),
          })).filter(item => item.film_id)
             .map((item, pos) => ({ ...item, rank_position: pos }));

          for (let j = 0; j < items.length; j += BATCH_SIZE) {
            // Micro-batching event-loop yield to prevent UI freeze
            await new Promise(r => setTimeout(r, 0));
            const batch = items.slice(j, j + BATCH_SIZE);
            await upsertCounted('list_items', batch, 'list_id,film_id', false, `List items "${listTitle}"`, errors);
          }

          if (existing?.id && priorKnown) {
            const addedFilmIds = items
              .map(it => Number(it.film_id))
              .filter(id => Number.isFinite(id) && !priorFilmIds.has(id));
            if (addedFilmIds.length > 0) receipt.listItemsAdded.push({ listId, filmIds: addedFilmIds });
          }
        }

        listCount++;
      } catch (err: unknown) {
        errors.push(`List: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
  }

  saveReceipt(receipt);

  return { logs: logCount, reviews: reviewCount, watchlist: watchlistCount, vault: vaultCount, lists: listCount, skipped, errors };
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
    const rawText = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
    const parsed = JSON.parse(rawText) as ReelHouseArchive;
    return importArchiveJSON(parsed, user.id, onProgress);
  }

  // ── ZIP archive ──
  const rawBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
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
  // Accumulates exactly what this import creates, so it can be taken back.
  // See importReceipt.ts for why undo is the answer to the one rating case
  // that is genuinely undecidable.
  const receipt = emptyReceipt(userId, 'your archive');
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
    ? await importLogs(diary, reviewMap, resolvedFilms, userId, receipt, onProgress)
    : { imported: 0, reviewCount: 0, skipped: 0, errors: [] };
  allErrors.push(...logResult.errors);

  // ── Import watchlist ──
  const wlResult = watchlistEntries.length > 0
    ? await importWatchlist(watchlistEntries, resolvedFilms, userId, receipt, onProgress)
    : { imported: 0, skipped: 0, errors: [] };
  allErrors.push(...wlResult.errors);

  // ── Import lists ──
  const listResult = parsedLists.length > 0
    ? await importLists(parsedLists, resolvedFilms, userId, receipt, onProgress)
    : { imported: 0, errors: [] };
  allErrors.push(...listResult.errors);

  const totalSkipped = logResult.skipped + wlResult.skipped;

  // Written even when there were errors: a partial import is exactly the case
  // where being able to take it back matters most.
  saveReceipt(receipt);

  return {
    logs: logResult.imported,
    reviews: logResult.reviewCount,
    watchlist: wlResult.imported,
    vault: 0, // CSV archives don't carry physical-media data
    lists: listResult.imported,
    skipped: totalSkipped,
    errors: allErrors,
  };
}
