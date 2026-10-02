/**
 * archiveImport.ts — Universal Archive Import Engine
 * ──────────────────────────────────────────────────
 * Imports film data from any source:
 *   • CSV archives (diary, reviews, watchlist, list CSVs inside a ZIP)
 *   • ReelHouse JSON exports (ZIP or raw .json)
 *
 * The member is never shown another service's name. Headers are recognised by
 * meaning, CSV films are resolved through TMDB (title + year → id + poster), and
 * rows are upserted with ignoreDuplicates, so an import can run twice.
 */
import JSZip from 'jszip';
import { localCalendarDate, calendarDateString } from '@/src/utils/timeAgo';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/src/lib/supabase';
import { tmdb } from '@/src/lib/tmdb';
import { isTmdbUnreachable } from '@/src/lib/tmdbErrors';
import { useAuthStore } from '@/src/stores/auth';
import { logger } from '@/src/utils/logger';
import { isArchivistPlusTier, resolveTier } from '@/src/utils/tier';
// Imported text comes from any exporter, so it passes the same sanitiser as in-app writes.
import { sanitizeInput } from '@/src/utils/sanitizeInput';
import { restoreNotes } from '@/src/services/VaultService';
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
  /** The service the file came from (one per file), which fixes the rating scale. */
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
  /** The member's private notes, one to a viewing, kept apart from the logs. */
  private_notes?: Record<string, unknown>[];
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
  const rows = tokenize(text, true);
  // Ending inside a quote means broken quoting, which would swallow every later row into one
  // field. Re-read with quotes as plain text: a few stray marks, not a lost history.
  if (rows.unterminated) return tokenize(text, false).cells;
  return rows.cells;
}

/**
 * @param quoteAware false treats `"` as an ordinary character, used only to
 *   recover a file whose quoting is broken.
 */
function tokenize(text: string, quoteAware: boolean): { cells: string[][]; unterminated: boolean } {
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
      if (char === '"' && quoteAware) {
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

  return { cells: rows, unterminated: inQuotes };
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
        // First occurrence wins: a second "Name" column must not replace the title.
        if (!(h in obj)) obj[h] = row[idx] ?? '';
      });
      return obj;
    });
}

// ═══════════════════════════════════════════════════════════════
//  HEADER RESOLVER — Format-agnostic column detection
// ═══════════════════════════════════════════════════════════════

type HeaderMapping = Record<string, string>; // our field → the file's header, e.g. title → 'Name'

/**
 * Maps the file's headers to our field names, or null when there is no title column.
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


/** The exporting service, as far as its header row proves it. */
export type ImportSource = 'uri_diary' | 'const_titles' | 'snake_timestamps' | 'unknown';

/**
 * Identifies the exporting service from the header row. Every service uses a
 * FIXED rating scale, so knowing the source removes the guess entirely.
 *
 * Without it, an out-of-10 export whose highest score is a 5 looks, by max
 * value, exactly like a 5-star one: read as half-five, EVERY rating doubles —
 * permanently, because logs upserts with ignoreDuplicates. Exported for tests.
 */
export function detectSource(headers: string[]): ImportSource {
  const h = headers.map(x => x.trim().toLowerCase());
  const has = (name: string) => h.includes(name);

  const matches: Exclude<ImportSource, 'unknown'>[] = [];

  // A whole header, never a substring: a note that merely names the service is not its export.
  if (has('letterboxd uri') || has('letterboxd url')) matches.push('uri_diary');
  // A title-id column that never ships alone.
  if (has('const') && (has('title type') || has('your rating') || has('imdb rating'))) matches.push('const_titles');
  // snake_case timestamps no other exporter emits.
  if (has('rated_at') || has('watched_at') || has('trakt_rating')) matches.push('snake_timestamps');

  // One fingerprint is evidence; two (a merged file) contradict, and the numeric ladder decides.
  return matches.length === 1 ? matches[0] : 'unknown';
}

/**
 * The scale each service publishes ratings on, with the highest value that
 * service can actually emit. The ceiling matters: a value above it is proof
 * the fingerprint does not hold for this data (a merged export, a hand-edited
 * sheet, a column that only looks like a known one), and forcing the source's
 * scale anyway would clamp every value above the ceiling to a flat 5.
 */
const SOURCE_SCALE: Record<Exclude<ImportSource, 'unknown'>, { scale: 'half-five' | 'ten'; ceiling: number }> = {
  uri_diary:        { scale: 'half-five', ceiling: 5 },  // 0.5–5 in half steps
  const_titles:     { scale: 'ten',       ceiling: 10 }, // 1–10 integers
  snake_timestamps: { scale: 'ten',       ceiling: 10 }, // 1–10 integers
};

/**
 * Decides an export's rating scale, strongest evidence first:
 *   1. a recognised source whose data fits its ceiling  -> that service's scale
 *   2. max > 10 -> hundred     3. max > 5 -> ten     4. otherwise -> half-five
 *
 * The ceiling keeps a fingerprint honest: a "five-star" file holding a 9 is not
 * that service's data, and forcing half-five would clamp 7, 9 and 10 to 5 reels.
 *
 * There is no "a fraction proves five stars" rung. Where max <= 5 the answer is
 * half-five anyway; above it, a 0.5–10 tracker emits both fractions and a max
 * over 5, and the rung would clamp its 7.5 and 9 to 5.
 *
 * Rung 4 is undecidable — out-of-5 and out-of-10 data are identical there — so
 * it is covered by making the import reversible (importReceipt), not by guessing.
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
 * Decided per row, a European export half-imports: 25/03/2024 parses
 * correctly (25 cannot be a month) while 05/03/2024 silently becomes 3 May.
 * Half the dates are wrong and nothing looks broken.
 *
 * BOTH formats leave proof, and both sides must be counted:
 *   first  number > 12  ->  day-first  (25/03 — no month exceeds 12)
 *   second number > 12  ->  month-first (03/25 — likewise)
 *
 * Taking the first day-first row as decisive would let ONE malformed or
 * hand-typed row flip an entire month-first file, transposing every ambiguous
 * date in it. So the side with more evidence wins, and a file with no proof
 * either way reads MM/DD, the common export format.
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
 * True only for a calendar date that actually exists. `2024-02-31` and
 * `2024-13-01` are well-formed strings and pass a naive comparison, but both
 * fail an INSERT against a DATE column — taking their whole batch with them
 * until the row-by-row fallback isolates them, and costing the member that film.
 */
function isRealDate(iso: string): boolean {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  const probe = new Date(Date.UTC(y, mo - 1, d));
  // Date rolls Feb 31 on to Mar 2: a real date survives the round trip unchanged.
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

/**
 * Normalizes date strings to YYYY-MM-DD (the logs.watched_date column is DATE).
 * Handles: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, ISO timestamps.
 * Future dates are clamped to today — a native log can't be created in the
 * future, so imports must not be either. Exported for tests.
 */
export function normalizeDate(raw: string, format: 'MDY' | 'DMY' = 'MDY'): string {
  // The member's day, not UTC's: it is the fallback AND the future ceiling, and a UTC
  // "today" would clamp a morning's watches east of UTC back to yesterday.
  const today = localCalendarDate();
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
    const pad = (n: number) => String(n).padStart(2, '0');
    const build = (mo: number, dy: number) => `${yr}-${pad(mo)}-${pad(dy)}`;

    // A first number above 12 is proof on its own (no month exceeds 12); otherwise
    // the FILE's verdict (detectDateFormat), which saw every row, decides.
    const dayFirst = numA > 12 || format === 'DMY';
    const preferred = dayFirst ? build(numB, numA) : build(numA, numB);
    if (isRealDate(preferred)) return clamp(preferred);

    // Not a real date (05/13 in a day-first file)? The other reading may be (13 May):
    // an impossible date fails its INSERT and would cost the member that film.
    const alternate = dayFirst ? build(numA, numB) : build(numB, numA);
    if (isRealDate(alternate)) return clamp(alternate);

    // Neither reading exists: a corrupt row gets the unparseable-input fallback.
    return today;
  }

  // Fallback — try native Date parsing
  const parsed = new Date(trimmed);
  // The instant's LOCAL day: toISOString's UTC day would file Tokyo's Jul 25 as Jul 24.
  const asCalendar = isNaN(parsed.getTime()) ? null : calendarDateString(parsed);
  if (asCalendar) return clamp(asCalendar);

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

/** Said when the catalogue could not be asked mid-import: nothing has been written yet. */
export const CATALOGUE_AWAY =
  'The film catalogue could not be reached, so nothing was imported. Check your connection, then import the file again.';

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

    // Confidence gate. 'semantic' (keyword discovery) returns *a* film for any title,
    // and 'person' matched a name, not a title: neither proves the film. A rejected row
    // is reported as unmatched; a wrong match would file a review against an unseen film,
    // invisibly and for ever.
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

    // No year agrees: only an exact title match may carry it (a typo fix has no corroboration).
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
    // The catalogue could not be asked: that is no answer about a film. Carried
    // on, every film after it was counted "unmatched" and left out of the import
    // for good. So the import stops here, before a single row is written.
    if (isTmdbUnreachable(err)) throw new Error(CATALOGUE_AWAY);
    logger.warn('[archiveImport] TMDB resolve failed for', title, err);
    // Not cached: an answer that went wrong is no answer about a film.
    return null;
  }
}

/**
 * Resolves a batch of films with rate limiting and progress reporting.
 * (Exported for its test.)
 */
export async function resolveFilmsBatch(
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

  // Two decisions that belong to the FILE, made here: the only place that sees every row.
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

  // The same file-wide date verdict as the diary: two exports of one account must agree.
  const dateFormat = detectDateFormat(rows.map(r => getField(r, mapping, 'watchedDate')));

  return rows.map(row => {
    const raw = getField(row, mapping, 'watchedDate');
    return {
      title:     getField(row, mapping, 'title'),
      year:      getField(row, mapping, 'year'),
      // Empty stays empty: "no date given" is not "dated today".
      addedDate: raw ? normalizeDate(raw, dateFormat) : '',
    };
  }).filter(e => e.title.length > 0);
}

const ALL_HEADER_SYNONYMS = new Set(Object.values(HEADER_MAP).flat());
/**
 * True when a raw row IS a header row: 3+ cells are known column names, one a
 * title synonym. A list export's film table ("Position,Name,Year,URL,…") has 5;
 * a film row would need three cells that are literally header words.
 */
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
    // First occurrence wins, as in parseCSV — a repeated column name must not
    // silently discard the earlier one.
    headers.forEach((h, idx) => { if (!(h in obj)) obj[h] = row[idx] ?? ''; });
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
  /** Every watch as the FILE has it: count what was written here (`latest` may inherit). */
  sourceWatches: ParsedDiaryEntry[];
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
      sourceWatches: sorted,
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

const MAX_COLLECTED_ERRORS = 20;
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
 * are collected, capped (MAX_COLLECTED_ERRORS) so a filthy file can't flood the report.
 */
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
 * Does this CSV's HEADER ROW actually look like the kind of file we are about
 * to treat it as?
 *
 * The filename alone is not enough. A member's list named after a film
 * ("Overrating the 80s") matches the 'rating' substring, and claiming an
 * unfilled slot on that basis both loses the list and imports it as something
 * it is not. The header row is the honest discriminator.
 *
 * Deliberately permissive: it only has to reject a LIST export, whose columns
 * are Position / Name / Year / URL / Description.
 */
export function csvLooksLike(text: string, kind: 'diary' | 'reviews' | 'watchlist'): boolean {
  const rows = parseCSVRows(text);
  if (rows.length < 2) return false;
  const mapping = resolveHeaders(rows[0]);
  if (!mapping) return false;

  switch (kind) {
    // A diary or ratings export carries the member's own scores, or when they
    // watched something. A list carries neither.
    case 'diary':
      return Boolean(mapping.rating || mapping.watchedDate);
    // 'description' is a list's blurb and is NOT a review synonym, so this
    // cannot be satisfied by a list export.
    case 'reviews':
      return Boolean(mapping.review);
    // A watchlist is titles plus when they were added. A list export is
    // distinguished by its placement column and its blurb.
    case 'watchlist':
      return !mapping.position && !mapping.description;
  }
}

/**
 * The member's own stack with this title, which an import merges into rather
 * than copying. The oldest, if they hold two: `maybeSingle` REFUSED two (an
 * error), and the error was not read, so each import of a file naming that
 * stack made one more copy of it. A read that fails is an error to report,
 * never "there is none" — that too made a copy.
 */
async function findOwnStack(userId: string, title: string): Promise<
  { existing: { id: string; is_private: boolean | null; is_ranked: boolean | null; description: string | null } | null; error: null }
  | { existing: null; error: { message: string } }
> {
  const { data, error } = await supabase
    .from('lists')
    .select('id, is_private, is_ranked, description')
    .eq('user_id', userId)
    .eq('title', title)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) return { existing: null, error };
  return { existing: data?.[0] ?? null, error: null };
}

const ITEM_PAGE = 1000;
/**
 * Every existing item of one stack, paginated.
 *
 * A bare .select() is capped by PostgREST's max-rows (1000 on a default
 * Supabase project), and a SILENT truncation here is dangerous in two ways:
 * the rank offset would be computed from a partial set and collide with real
 * placements, and — far worse — films the member already owned would be absent
 * from preExistingFilmIds and therefore look like rows this import created,
 * which would let UNDO delete their own films. Returns null if any page errors,
 * so callers can fail safe instead of acting on a partial answer.
 */
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
  // fingerprint) settles it outright when known — a five-star export is always
  // 5, IMDb and Trakt always out of 10 — so a 1–10 export from someone who
  // never scored above 5 can no longer be misread as out-of-5 and doubled.
  const source = diary.find(e => e.source)?.source ?? 'unknown';
  const allRatings = diary.map(e => e.rating).filter(r => r > 0);
  const ratingScale = allRatings.length > 0 || source !== 'unknown'
    ? detectRatingScale(allRatings, source)
    : 'half-five';

  // One row per film, the latest watch current, earlier ones in viewing_history.
  const films = aggregateDiaryEntries(diary);

  // Build payloads
  const payloads: Record<string, unknown>[] = [];
  for (const agg of films) {
    const key = cacheKey(agg.title, agg.year);
    const film = resolvedFilms.get(key);
    if (!film) {
      // One unmatched FILM, not one per viewing: the member is told films, not watches.
      skipped += 1;
      continue;
    }

    // Merge review from reviews.csv if the diary review is shorter
    let review = agg.latest.review;
    const reviewFromFile = reviewMap.get(key);
    if (reviewFromFile && reviewFromFile.length > review.length) {
      review = reviewFromFile;
    }
    review = sanitizeInput(review, 'review');
    // Reviews counted from the FILE's watches: the latest alone misses earlier ones, and latest +
    // earlier counts an inherited one twice. reviews.csv may add one the diary lacked.
    const reviewedWatches = agg.sourceWatches.filter(w => sanitizeInput(w.review, 'review').length > 0).length;
    reviewCount += reviewedWatches > 0 ? reviewedWatches : (review.length > 0 ? 1 : 0);

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
    // ignoreDuplicates: these rows did not exist before, so undo never touches the member's own.
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
      // Untrusted text, held to the in-app editor's caps (lossless for our own exports).
      const safeTitle = sanitizeInput(list.name, 'listTitle') || 'Imported Stack';
      const safeDescription = sanitizeInput(list.description, 'listDescription');

      // Idempotency: reuse list ID if one with the same title exists for this
      // user. Read the member's OWN settings too — merging into a stack they
      // already have must never silently rewrite how it is configured.
      const { existing, error: findErr } = await findOwnStack(userId, safeTitle);
      if (findErr) {
        errors.push(`List "${safeTitle}": ${findErr.message}`);
        continue;
      }

      const listId = existing?.id ?? Crypto.randomUUID();
      const { error: listErr } = await supabase.from('lists').upsert([{
        id:          listId,
        user_id:     userId,
        title:       safeTitle,
        // The member's settings, kept: a file sharing a PRIVATE stack's title must not
        // publish it. Their description wins; the imported one only fills a gap.
        description: existing ? (existing.description || safeDescription) : safeDescription,
        is_private:  existing?.is_private ?? false,
        is_ranked:   existing?.is_ranked ?? false,
      }], { onConflict: 'id' });

      if (listErr) {
        errors.push(`List "${safeTitle}": ${listErr.message}`);
        continue;
      }

      // Undo removes a stack this import made; of the member's own, only the films it added.
      if (!existing?.id) receipt.listsCreated.push(listId);

      // Appended after their last film, never from 0: restarting would land imported films
      // on existing ranks and scramble a ranked stack the member ordered by hand.
      let rankOffset = 0;
      let preExistingFilmIds = new Set<number>();
      // Undo entries only when we know EXACTLY what was here; a guess could delete their films.
      let priorItemsKnown = true;
      if (existing?.id) {
        // list_items upserts without ignoreDuplicates, so its result mixes updates with
        // inserts: what is new is established here, and anything present is the member's.
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

      // In order: rank_position is the app's 0-based ordering column (as listSlice writes it).
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

        // Only films not already in their stack are ours to undo (a stack we created goes whole,
        // items by the cascade). An unknown prior state records nothing: a smaller undo beats
        // deleting a film the member added themselves.
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

const ARCHIVE_PARTS = ['logs', 'watchlist', 'vault', 'lists'] as const;

/**
 * An exported viewing history with a fresh identity on every viewing, and the
 * old → new pairs so each viewing's note can follow it. The file's identities
 * are still the original log's, and a viewing belongs to one log only. A
 * history stored as a JSON string, as older clients wrote it, is read first.
 * Exported for tests.
 */
export function freshViewings(raw: unknown): { history: unknown[]; renamed: [string, string][] } {
  let list: unknown = raw;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch { list = []; }
  }
  if (list && typeof list === 'object' && !Array.isArray(list)) list = [list];
  if (!Array.isArray(list)) return { history: [], renamed: [] };
  const renamed: [string, string][] = [];
  const history = list.map((e) => {
    if (!e || typeof e !== 'object' || Array.isArray(e)) return e;
    const fresh = Crypto.randomUUID();
    const old = (e as Record<string, unknown>).viewingId;
    if (typeof old === 'string' && old) renamed.push([old, fresh]);
    return { ...(e as Record<string, unknown>), viewingId: fresh };
  });
  return { history, renamed };
}

export async function importArchiveJSON(
  archive: ReelHouseArchive,
  userId: string,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  // The one gate for every way a JSON file arrives. "null", "42", "[]" and "{}"
  // all parse, and would import as a cheerful, empty success.
  const parts = archive as Record<string, unknown> | null;
  if (!parts || typeof parts !== 'object' || Array.isArray(parts) || !ARCHIVE_PARTS.some((k) => Array.isArray(parts[k]))) {
    throw new Error('This file is not a ReelHouse archive.');
  }
  // Same undo guarantee as the CSV path, including the try/finally: rows
  // already written must stay reversible even if the import throws.
  const receipt = emptyReceipt(userId, 'your archive');
  try {
    return await runJSONImport(archive, userId, receipt, onProgress);
  } finally {
    saveReceipt(receipt);
  }
}

async function runJSONImport(
  archive: ReelHouseArchive,
  userId: string,
  receipt: ImportReceipt,
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
  // The notes, by the viewing each was written on.
  const noteByViewing = new Map<string, string>();
  for (const n of archive.private_notes ?? []) {
    if (n?.viewing_id && typeof n.notes === 'string' && n.notes) noteByViewing.set(String(n.viewing_id), n.notes);
  }
  const noteFor = (viewing: unknown) => (viewing ? noteByViewing.get(String(viewing)) : undefined);
  // Notes on earlier viewings, written once their logs are (the current one rides the log).
  const earlierNotes: { log_id: string; viewing_id: string; user_id: string; notes: string }[] = [];
  if (logs.length > 0) {
    const payloads: Record<string, unknown>[] = [];

    for (const log of logs) {
      const filmId = (log.filmId ?? log.film_id) as number | undefined;
      if (!filmId) { skipped++; continue; }

      // Fresh identities for the log and every viewing, so each note can be
      // filed on the viewing it was written on.
      const logId = Crypto.randomUUID();
      const { history, renamed } = freshViewings(log.viewingHistory ?? log.viewing_history);
      for (const [oldId, newId] of renamed) {
        const note = sanitizeInput(noteFor(oldId) ?? '', 'review').slice(0, 1000);
        if (note) earlierNotes.push({ log_id: logId, viewing_id: newId, user_id: userId, notes: note });
      }
      const currentNote = ((log.privateNotes ?? log.private_notes) as string | null) || noteFor(log.viewingId ?? log.viewing_id) || null;

      const watchedDate = normalizeDate(((log.watchedDate ?? log.watched_date ?? '') as string));
      // Native-parity timeline: preserve the original created_at from the
      // export (a migrated account keeps its true history); fall back to
      // backdating from the watch date. Never in the future.
      const originalCreated = importableTimestamp(log.createdAt ?? log.created_at);
      const originalUpdated = importableTimestamp(log.updatedAt ?? log.updated_at);
      const fallback = backdatedTimestamps(watchedDate);
      const created_at = originalCreated ?? fallback.created_at;

      payloads.push({
        id:               logId,
        viewing_id:       Crypto.randomUUID(),
        user_id:          userId,
        film_id:          filmId,
        film_title:       (log.title ?? log.film_title ?? 'Untitled') as string,
        poster_path:      (log.poster ?? log.poster_path ?? null) as string | null,
        year:             (log.year ?? null) as number | null,
        rating:           clampRating(log.rating), // hard DB CHECK is [0,5]
        review:           sanitizeInput((log.review ?? '') as string, 'review'),
        status:           (log.status ?? 'watched') as string,
        watched_date:     watchedDate,
        is_spoiler:       (log.isSpoiler ?? log.is_spoiler ?? false) as boolean,
        watched_with:     (log.watchedWith ?? log.watched_with ?? null) as string | null,
        // Filed by the database on the log's current viewing (sanitised, as all imported text).
        private_notes:    currentNote ? sanitizeInput(currentNote, 'review') : null,
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
        viewing_history:  history,
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

    // Earlier viewings' notes, for the logs this import wrote. Below the
    // Archivist a note is discarded, as the database does with the current one.
    const written = new Set(receipt.logIds);
    const notes = earlierNotes.filter((n) => written.has(n.log_id));
    if (notes.length > 0 && isArchivistPlusTier(resolveTier(useAuthStore.getState().user))) {
      for (const message of await restoreNotes(notes, BATCH_SIZE)) {
        if (errors.length < MAX_COLLECTED_ERRORS) errors.push(`Private notes: ${message}`);
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
        // Untrusted text: the review sanitiser and cap (lossless for anything written in-app).
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
        phase: 'IMPORTING SHELVES',
        current: Math.min(i + BATCH_SIZE, payloads.length),
        total: payloads.length,
      });
      const newVaultIds = await upsertCounted('physical_archive', batch, 'user_id,film_id', true, 'Physical Archive', errors);
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
        // Untrusted title and description: the in-app editor's caps.
        const listTitle = sanitizeInput((list.title ?? 'Untitled') as string, 'listTitle') || 'Imported Stack';
        const listDescription = sanitizeInput((list.description ?? '') as string, 'listDescription');
        const originalCreated = importableTimestamp(list.createdAt ?? list.created_at);

        // Idempotency: reuse list ID if one with the same title exists for this user
        const { existing, error: findErr } = await findOwnStack(userId, listTitle);
        if (findErr) {
          errors.push(`List "${listTitle}": ${findErr.message}`);
          continue;
        }

        const listId = existing?.id ?? Crypto.randomUUID();

        // Merged into a stack they already have, the member's own settings stand,
        // as in the CSV path: an older export must not make a private stack public,
        // nor move when it was made.
        const { error: listErr } = await supabase.from('lists').upsert([existing ? {
          id:          listId,
          user_id:     userId,
          title:       listTitle,
          description: existing.description || listDescription,
          is_private:  existing.is_private ?? false,
          is_ranked:   existing.is_ranked ?? false,
        } : {
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
    let parsed: ReelHouseArchive;
    try {
      parsed = JSON.parse(rawText) as ReelHouseArchive;
    } catch {
      throw new Error('Invalid JSON format.');
    }
    return importArchiveJSON(parsed, user.id, onProgress);
  }

  // ── ZIP archive ──
  const rawBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const zip = await JSZip.loadAsync(rawBase64, { base64: true });

  // Zip-bomb defence: entry count and total uncompressed size are bounded BEFORE any
  // entry is read (a few-KB ZIP can decompress to gigabytes).
  const MAX_ZIP_ENTRIES = 2000;
  const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50 MB
  const entryNames = Object.keys(zip.files);
  if (entryNames.length > MAX_ZIP_ENTRIES) {
    throw new Error('This archive contains too many files to import.');
  }
  let totalUncompressed = 0;
  let unmeasurable = 0;
  for (const name of entryNames) {
    if (zip.files[name].dir) continue; // directory entries carry no payload
    // The size is on an INTERNAL JSZip field. Never `?? 0`: were it renamed, every entry would
    // score 0 and the cap would silently stop existing. An unreadable size is counted instead.
    const size = (zip.files[name] as unknown as { _data?: { uncompressedSize?: unknown } })?._data?.uncompressedSize;
    if (typeof size === 'number' && Number.isFinite(size)) totalUncompressed += size;
    else unmeasurable++;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      throw new Error('This archive is too large to import.');
    }
  }
  // Fail CLOSED on ANY unmeasurable entry (one measured beside 1,999 unmeasured would pass
  // the caps). Real exports lose nothing: under JSZip 3.10.1 every entry reports its size.
  if (unmeasurable > 0) {
    throw new Error('This archive could not be inspected safely. Try exporting it again.');
  }

  const format = detectArchiveFormat(zip);

  if (format === 'json') {
    // ZIP containing a ReelHouse JSON export
    const jsonFile = Object.keys(zip.files).find(f => f.endsWith('.json') && !f.startsWith('__MACOSX'));
    if (!jsonFile) throw new Error('No valid archive file found in ZIP.');

    const jsonText = await zip.files[jsonFile].async('string');
    let parsed: ReelHouseArchive;
    try {
      parsed = JSON.parse(jsonText) as ReelHouseArchive;
    } catch {
      // Tells the member the FILE is the problem, as the single-JSON-file path does.
      throw new Error('Invalid JSON format.');
    }
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
  // What this import creates, so it can be taken back (importReceipt.ts). Saved in a
  // `finally`: a half-imported archive, thrown mid-way, is when undo matters most.
  const receipt = emptyReceipt(userId, 'your archive');
  try {
    return await runCSVImport(zip, userId, receipt, onProgress);
  } finally {
    saveReceipt(receipt);
  }
}

async function runCSVImport(
  zip: JSZip,
  userId: string,
  receipt: ImportReceipt,
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

  // Read once, classified in two passes. One substring pass would let a list named
  // "Diary of a Country Priest" replace the real diary.csv, and the member's whole
  // history would vanish from the import along with the list.
  const loaded: { base: string; text: string }[] = [];
  for (const [name, file] of csvFiles) {
    loaded.push({ base: name.split('/').pop()?.toLowerCase() ?? '', text: await file.async('string') });
  }

  const EXACT: Record<string, 'diary' | 'reviews' | 'watchlist' | 'ratings' | 'watched'> = {
    'diary.csv': 'diary',
    'reviews.csv': 'reviews',
    'watchlist.csv': 'watchlist',
    'ratings.csv': 'ratings',
    'watched.csv': 'watched',
  };
  const slot: Partial<Record<'diary' | 'reviews' | 'watchlist' | 'ratings' | 'watched', string>> = {};
  const unclaimed: { base: string; text: string }[] = [];

  // Pass 1 — EXACT filenames. These are what the real exporters emit, and a
  // list named after a film can never displace one.
  for (const f of loaded) {
    const kind = EXACT[f.base];
    if (kind && slot[kind] === undefined) slot[kind] = f.text;
    else unclaimed.push(f);
  }

  // Pass 2 — substring fallback, for exporters that prefix their filenames
  // ("archive-diary.csv"). Only ever fills a slot nothing has claimed, so it
  // can add information but never overwrite a genuine file.
  // The name must match AND the header row must support it — otherwise a list
  // called "Overrating the 80s" claims the empty ratings slot, and is both
  // lost as a list and imported as ratings it never contained.
  for (const f of unclaimed.splice(0, unclaimed.length)) {
    if (f.base.includes('diary') && slot.diary === undefined && csvLooksLike(f.text, 'diary')) slot.diary = f.text;
    else if (f.base.includes('review') && slot.reviews === undefined && csvLooksLike(f.text, 'reviews')) slot.reviews = f.text;
    else if (f.base.includes('watchlist') && slot.watchlist === undefined && csvLooksLike(f.text, 'watchlist')) slot.watchlist = f.text;
    else if (f.base.includes('rating') && slot.ratings === undefined && csvLooksLike(f.text, 'diary')) slot.ratings = f.text;
    else unclaimed.push(f);
  }

  diaryText = slot.diary ?? '';
  reviewsText = slot.reviews ?? '';
  watchlistText = slot.watchlist ?? '';
  ratingsText = slot.ratings ?? '';
  // Some exports ship watched.csv instead of a diary.
  if (!diaryText && slot.watched) diaryText = slot.watched;
  // Everything still unclaimed is a list.
  for (const f of unclaimed) listTexts.push({ name: f.base, text: f.text });

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
