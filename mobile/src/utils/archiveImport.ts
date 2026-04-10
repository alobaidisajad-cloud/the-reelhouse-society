/**
 * Archive Import Engine — "THE TRANSFER PROTOCOL" (Native)
 *
 * Parses a film data ZIP export and imports into ReelHouse:
 * - diary.csv → Film Logs (with dates, ratings, rewatch status)
 * - reviews.csv → Review text merged into matching logs
 * - ratings.csv → Gap-fill logs for rated-but-not-diaried films
 * - watched.csv → Gap-fill logs for watched-but-not-logged films
 * - watchlist.csv → Watchlist items
 * - lists/*.csv → Stacks (film lists)
 */
import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth';

const TMDB_API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';

interface TMDBMatch {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
}

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

// ── CSV PARSER (handles multiline quoted fields) ──
function parseCSV(text: string): Record<string, string>[] {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const records: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (char === '"') {
      if (inQuotes && normalized[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
      current += char;
    } else if (char === '\n' && !inQuotes) {
      if (current.trim()) records.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) records.push(current);
  if (records.length < 2) return [];

  const headers = parseCSVLine(records[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < records.length; i++) {
    const values = parseCSVLine(records[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h.trim()] = (values[idx] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current); current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function getFilmName(row: Record<string, string>): string {
  return row.Name || row.name || row.Title || row.title || '';
}
function getFilmYear(row: Record<string, string>): string {
  return row.Year || row.year || '';
}
function getWatchedDate(row: Record<string, string>): string {
  return row['Watched Date'] || row.WatchedDate || row.Date || row.date || '';
}

// ── TMDB FILM MATCHER ──
const matchCache = new Map<string, TMDBMatch | null>();

async function matchFilmToTMDB(title: string, year?: string): Promise<TMDBMatch | null> {
  const cacheKey = `${title}::${year || ''}`;
  if (matchCache.has(cacheKey)) return matchCache.get(cacheKey) || null;

  try {
    const yearParam = year ? `&year=${year}` : '';
    const res = await fetch(
      `${TMDB_BASE}/search/movie?query=${encodeURIComponent(title)}${yearParam}&page=1&api_key=${TMDB_API_KEY}`
    );
    if (res.status === 429) { await sleep(2000); return matchFilmToTMDB(title, year); }
    if (!res.ok) { matchCache.set(cacheKey, null); return null; }

    const data = await res.json();
    const results = data.results || [];
    if (results.length === 0) {
      if (year) { const fb = await matchFilmToTMDB(title); matchCache.set(cacheKey, fb); return fb; }
      matchCache.set(cacheKey, null); return null;
    }

    const match = results[0];
    const result: TMDBMatch = {
      id: match.id, title: match.title,
      poster_path: match.poster_path, release_date: match.release_date || '',
    };
    matchCache.set(cacheKey, result);
    return result;
  } catch {
    matchCache.set(cacheKey, null); return null;
  }
}

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

function convertRating(r: string): number {
  if (!r || r.trim() === '') return 0;
  const val = parseFloat(r);
  return isNaN(val) ? 0 : Math.min(Math.max(val, 0), 5);
}

// ── List CSV parser (handles metadata rows) ──
function parseListCSV(text: string): Record<string, string>[] {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter(l => l.trim());
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cols = parseCSVLine(lines[i]).map(c => c.trim());
    if (cols.includes('Name') && cols.includes('Year')) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return parseCSV(text);

  const headers = parseCSVLine(lines[headerIdx]).map(h => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim(); });
    if (row.Name || row.name) rows.push(row);
  }
  return rows;
}

// ══════════════════════════════════════
//  MAIN IMPORT FUNCTION
// ══════════════════════════════════════
export async function importArchiveZip(
  fileUri: string,
  onProgress: (progress: ImportProgress) => void
): Promise<ImportResult> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('You must be signed in to import.');

  const result: ImportResult = { logs: 0, reviews: 0, watchlist: 0, lists: 0, skipped: 0, errors: [] };

  // ── Step 1: Read file and extract ZIP ──
  onProgress({ phase: 'Extracting archive...', current: 0, total: 1 });
  const fileBase64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
  const zip = await JSZip.loadAsync(fileBase64, { base64: true });

  // ── Step 2: Smart CSV reader — handles nested folders ──
  const findFile = (name: string): any => {
    let entry = zip.file(name);
    if (entry) return entry;
    for (const [path, zipEntry] of Object.entries(zip.files)) {
      if (!(zipEntry as any).dir && (path.endsWith('/' + name) || path === name)) return zipEntry;
    }
    return null;
  };

  const readCSV = async (name: string): Promise<Record<string, string>[]> => {
    const entry = findFile(name);
    if (!entry) return [];
    const text = await entry.async('text');
    return parseCSV(text);
  };

  const diary = await readCSV('diary.csv');
  const reviews = await readCSV('reviews.csv');
  const ratings = await readCSV('ratings.csv');
  const watched = await readCSV('watched.csv');
  const watchlist = await readCSV('watchlist.csv');

  result.errors.push(`[INFO] Found: ${diary.length} diary, ${ratings.length} ratings, ${watched.length} watched, ${reviews.length} reviews, ${watchlist.length} watchlist`);

  // ── Find list CSVs ──
  const listFiles: { name: string; data: Record<string, string>[] }[] = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if ((path.includes('/lists/') || path.startsWith('lists/')) && path.endsWith('.csv') && !(entry as any).dir) {
      const text = await (entry as any).async('text');
      const segments = path.split('/');
      const fileName = segments[segments.length - 1];
      const listName = fileName.replace('.csv', '').replace(/-/g, ' ');
      listFiles.push({ name: listName, data: parseListCSV(text) });
    }
  }

  // ── Step 3: Collect all unique films ──
  const allFilms = new Map<string, { title: string; year?: string }>();
  const addFilm = (title: string, year?: string) => {
    if (!title) return;
    const key = `${title}::${year || ''}`;
    if (!allFilms.has(key)) allFilms.set(key, { title, year });
  };

  diary.forEach(r => addFilm(getFilmName(r), getFilmYear(r)));
  reviews.forEach(r => addFilm(getFilmName(r), getFilmYear(r)));
  ratings.forEach(r => addFilm(getFilmName(r), getFilmYear(r)));
  watched.forEach(r => addFilm(getFilmName(r), getFilmYear(r)));
  watchlist.forEach(r => addFilm(getFilmName(r), getFilmYear(r)));
  listFiles.forEach(list => list.data.forEach(r => addFilm(getFilmName(r), getFilmYear(r))));

  result.errors.push(`[INFO] ${allFilms.size} unique films to match`);

  // ── Step 4: Match films to TMDB ──
  const filmMap = new Map<string, TMDBMatch>();
  const filmEntries = Array.from(allFilms.entries());
  const total = filmEntries.length;
  const BATCH_SIZE = 4;

  for (let i = 0; i < filmEntries.length; i += BATCH_SIZE) {
    const batch = filmEntries.slice(i, i + BATCH_SIZE);
    const matches = await Promise.all(
      batch.map(async ([key, { title, year }]) => {
        const match = await matchFilmToTMDB(title, year);
        return { key, match };
      })
    );
    for (const { key, match } of matches) {
      if (match) filmMap.set(key, match);
      else result.skipped++;
    }
    const current = Math.min(i + BATCH_SIZE, total);
    const lastFilm = batch[batch.length - 1];
    onProgress({
      phase: 'Matching films to database...',
      current, total,
      detail: `${lastFilm[1].title} (${lastFilm[1].year || '?'})`,
    });
    if (i + BATCH_SIZE < filmEntries.length) await sleep(300);
  }

  // ── Step 5: Fetch existing to prevent duplicates ──
  onProgress({ phase: 'Checking existing archive...', current: 0, total: 1 });
  const existingFilmIds = new Set<number>();
  let ePage = 0;
  while (true) {
    const { data } = await supabase
      .from('logs').select('film_id').eq('user_id', user.id)
      .range(ePage * 1000, (ePage + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    data.forEach((l: any) => existingFilmIds.add(l.film_id));
    if (data.length < 1000) break;
    ePage++;
  }

  const existingWatchlistIds = new Set<number>();
  const { data: existingWatchlist } = await supabase
    .from('watchlists').select('film_id').eq('user_id', user.id);
  (existingWatchlist || []).forEach((w: any) => existingWatchlistIds.add(w.film_id));

  // ── Step 6: Review map ──
  const reviewMap = new Map<string, string>();
  reviews.forEach(r => {
    const name = getFilmName(r);
    const year = getFilmYear(r);
    const reviewText = r.Review || r.review || '';
    if (name && reviewText) reviewMap.set(`${name}::${year}`, reviewText);
  });

  // ── Step 7: Import Diary ──
  const logsToInsert: any[] = [];
  for (let i = 0; i < diary.length; i++) {
    const entry = diary[i];
    const name = getFilmName(entry);
    const year = getFilmYear(entry);
    const key = `${name}::${year}`;
    const film = filmMap.get(key);
    if (!film || existingFilmIds.has(film.id)) continue;

    const rating = convertRating(entry.Rating || entry.rating || '');
    const reviewText = reviewMap.get(key) || '';
    const isRewatch = (entry.Rewatch || entry.rewatch || '') === 'Yes';
    let watchedDate = getWatchedDate(entry);
    if (!watchedDate && film.release_date) watchedDate = film.release_date;
    if (!watchedDate) watchedDate = '2025-01-01';

    logsToInsert.push({
      user_id: user.id, film_id: film.id, film_title: film.title,
      poster_path: film.poster_path,
      year: film.release_date ? parseInt(film.release_date.slice(0, 4)) : null,
      rating, review: reviewText,
      status: isRewatch ? 'rewatched' : 'watched',
      is_spoiler: false, watched_date: watchedDate,
      created_at: new Date(watchedDate + 'T12:00:00Z').toISOString(),
      format: 'Digital',
    });
    existingFilmIds.add(film.id);
    if (reviewText) result.reviews++;
    if (i % 10 === 0) onProgress({ phase: 'Preparing diary logs...', current: i + 1, total: diary.length, detail: film.title });
  }

  onProgress({ phase: 'Saving diary logs...', current: 0, total: logsToInsert.length });
  for (let i = 0; i < logsToInsert.length; i += 50) {
    const chunk = logsToInsert.slice(i, i + 50);
    const { error } = await supabase.from('logs').insert(chunk);
    if (!error) result.logs += chunk.length;
    else result.errors.push(`Diary batch ${Math.floor(i / 50)}: ${error.message}`);
    onProgress({ phase: 'Saving diary logs...', current: Math.min(i + 50, logsToInsert.length), total: logsToInsert.length });
  }

  // ── Step 8: Gap-fill Ratings ──
  const ratingsToInsert: any[] = [];
  for (const entry of ratings) {
    const name = getFilmName(entry);
    const year = getFilmYear(entry);
    const key = `${name}::${year}`;
    const film = filmMap.get(key);
    if (!film || existingFilmIds.has(film.id)) continue;
    const rating = convertRating(entry.Rating || entry.rating || '');
    if (rating === 0) continue;
    const reviewText = reviewMap.get(key) || '';
    let ratingDate = entry.Date || entry.date || '';
    if (!ratingDate && film.release_date) ratingDate = film.release_date;
    if (!ratingDate) ratingDate = '2025-01-01';

    ratingsToInsert.push({
      user_id: user.id, film_id: film.id, film_title: film.title,
      poster_path: film.poster_path,
      year: film.release_date ? parseInt(film.release_date.slice(0, 4)) : null,
      rating, review: reviewText, status: 'watched',
      is_spoiler: false, watched_date: ratingDate,
      created_at: new Date(ratingDate + 'T12:00:00Z').toISOString(),
      format: 'Digital',
    });
    existingFilmIds.add(film.id);
    if (reviewText) result.reviews++;
  }

  for (let i = 0; i < ratingsToInsert.length; i += 50) {
    const chunk = ratingsToInsert.slice(i, i + 50);
    const { error } = await supabase.from('logs').insert(chunk);
    if (!error) result.logs += chunk.length;
  }

  // ── Step 9: Gap-fill Watched ──
  const watchedToInsert: any[] = [];
  for (const entry of watched) {
    const name = getFilmName(entry);
    const year = getFilmYear(entry);
    const film = filmMap.get(`${name}::${year}`);
    if (!film || existingFilmIds.has(film.id)) continue;
    let watchedDate = entry.Date || entry.date || '';
    if (!watchedDate && film.release_date) watchedDate = film.release_date;
    if (!watchedDate) watchedDate = '2025-01-01';
    watchedToInsert.push({
      user_id: user.id, film_id: film.id, film_title: film.title,
      poster_path: film.poster_path,
      year: film.release_date ? parseInt(film.release_date.slice(0, 4)) : null,
      rating: 0, review: '', status: 'watched',
      is_spoiler: false, watched_date: watchedDate,
      created_at: new Date(watchedDate + 'T12:00:00Z').toISOString(),
      format: 'Digital',
    });
    existingFilmIds.add(film.id);
  }

  for (let i = 0; i < watchedToInsert.length; i += 50) {
    const chunk = watchedToInsert.slice(i, i + 50);
    await supabase.from('logs').insert(chunk);
    result.logs += chunk.length;
  }

  // ── Step 10: Import Watchlist ──
  const watchlistToInsert: any[] = [];
  for (const entry of watchlist) {
    const name = getFilmName(entry);
    const year = getFilmYear(entry);
    const film = filmMap.get(`${name}::${year}`);
    if (!film || existingWatchlistIds.has(film.id) || existingFilmIds.has(film.id)) continue;
    watchlistToInsert.push({
      user_id: user.id, film_id: film.id, film_title: film.title,
      poster_path: film.poster_path,
      year: film.release_date ? parseInt(film.release_date.slice(0, 4)) : null,
    });
    existingWatchlistIds.add(film.id);
  }

  for (let i = 0; i < watchlistToInsert.length; i += 50) {
    const chunk = watchlistToInsert.slice(i, i + 50);
    const { error } = await supabase.from('watchlists').insert(chunk);
    if (!error) result.watchlist += chunk.length;
  }

  // ── Step 11: Import Lists ──
  for (let li = 0; li < listFiles.length; li++) {
    const listFile = listFiles[li];
    onProgress({ phase: 'Creating stacks...', current: li + 1, total: listFiles.length, detail: listFile.name });
    try {
      const listTitle = listFile.name.charAt(0).toUpperCase() + listFile.name.slice(1);
      const { data: existingList } = await supabase
        .from('lists').select('id').eq('user_id', user.id).eq('title', listTitle).maybeSingle();

      let listId: string;
      if (existingList) {
        listId = existingList.id;
      } else {
        const { data: listData, error: listError } = await supabase
          .from('lists').insert([{ user_id: user.id, title: listTitle, description: '', is_private: false }])
          .select().single();
        if (listError || !listData) { result.errors.push(`List "${listFile.name}": ${listError?.message || 'create failed'}`); continue; }
        listId = listData.id;
      }

      const seenIds = new Set<number>();
      const listItems: { film_id: number; film_title: string; poster_path: string | null }[] = [];
      for (const entry of listFile.data) {
        const name = getFilmName(entry);
        const year = getFilmYear(entry);
        if (!name) continue;
        const film = filmMap.get(`${name}::${year}`);
        if (!film || seenIds.has(film.id)) continue;
        seenIds.add(film.id);
        listItems.push({ film_id: film.id, film_title: film.title, poster_path: film.poster_path });
      }

      let itemsInserted = 0;
      if (listItems.length > 0) {
        const { data: rpcResult, error: rpcError } = await supabase.rpc('batch_insert_list_items', {
          p_list_id: listId, p_owner_id: user.id, p_items: listItems,
        });
        if (!rpcError && typeof rpcResult === 'number') {
          itemsInserted = rpcResult;
        } else {
          for (const item of listItems) {
            const { error } = await supabase.from('list_items').insert([{ list_id: listId, ...item }]);
            if (!error) itemsInserted++;
          }
        }
      }
      if (itemsInserted > 0) result.errors.push(`[OK] "${listFile.name}": ${itemsInserted} films`);
      result.lists++;
    } catch (e: any) {
      result.errors.push(`List "${listFile.name}": ${e.message}`);
    }
  }

  onProgress({ phase: 'Import complete!', current: 1, total: 1 });
  return result;
}
