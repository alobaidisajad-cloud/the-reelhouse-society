/**
 * Archive Import Engine — "THE TRANSFER PROTOCOL"
 *
 * Parses an archive ZIP export and imports all data into ReelHouse:
 * - diary.csv → Film Logs (with dates, ratings, rewatch status)
 * - reviews.csv → Review text merged into matching logs
 * - ratings.csv → Gap-fill logs for rated-but-not-diaried films
 * - watched.csv → Gap-fill logs for watched-but-not-logged films 
 * - watchlist.csv → Watchlist items
 * - lists/*.csv → Stacks (film lists)
 * 
 *  - Handles nested ZIP folders (e.g. archive-export-2026-04-01/diary.csv)
 *  - Never uses today's date as a fallback; created_at follows watched_date
 *  - The member is told only what went wrong, in words: a row the database
 *    refuses costs itself and not its batch, an archive that cannot be read
 *    stops the import before it writes, and a review past the limit is cut
 */
import JSZip from 'jszip'
import { supabase } from '../supabaseClient'
import { useAuthStore } from '../store'
import { cutChars } from './cutChars'
import { LIMITS } from './limits'

// ── TMDB API for film matching ──
// Routed through the tmdb-proxy edge function so the key is never in the bundle.
// See the note at the top of src/tmdb.ts. `/search/movie` is on the proxy's
// allow-list. One proxy call per film, same as the direct call it replaces.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const PROXY_URL = `${SUPABASE_URL}/functions/v1/tmdb-proxy`

interface TMDBMatch {
    id: number
    title: string
    poster_path: string | null
    release_date: string
}

interface ImportProgress {
    phase: string
    current: number
    total: number
    detail?: string
}

interface ImportResult {
    logs: number
    reviews: number
    watchlist: number
    lists: number
    skipped: number
    errors: string[]
}

// ── CSV PARSER (handles multiline quoted fields like imported reviews) ──
function parseCSV(text: string): Record<string, string>[] {
    const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    
    const records: string[] = []
    let current = ''
    let inQuotes = false
    
    for (let i = 0; i < normalized.length; i++) {
        const char = normalized[i]
        if (char === '"') {
            if (inQuotes && normalized[i + 1] === '"') {
                current += '"'
                i++
            } else {
                inQuotes = !inQuotes
            }
            current += char
        } else if (char === '\n' && !inQuotes) {
            if (current.trim()) records.push(current)
            current = ''
        } else {
            current += char
        }
    }
    if (current.trim()) records.push(current)
    
    if (records.length < 2) return []
    
    const headers = parseCSVLine(records[0])
    const rows: Record<string, string>[] = []
    
    for (let i = 1; i < records.length; i++) {
        const values = parseCSVLine(records[i])
        const row: Record<string, string> = {}
        headers.forEach((h, idx) => {
            row[h.trim()] = (values[idx] || '').trim()
        })
        rows.push(row)
    }
    return rows
}

function parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"'
                i++
            } else {
                inQuotes = !inQuotes
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current)
            current = ''
        } else {
            current += char
        }
    }
    result.push(current)
    return result
}

// ── Helpers: get film data from CSV row (handles column name variations) ──
function getFilmName(row: Record<string, string>): string {
    return row.Name || row.name || row.Title || row.title || ''
}
function getFilmYear(row: Record<string, string>): string {
    return row.Year || row.year || ''
}
function getWatchedDate(row: Record<string, string>): string {
    // Imported diary: 'Watched Date' or 'WatchedDate'
    // Other CSVs: 'Date' or 'date'
    return row['Watched Date'] || row.WatchedDate || row.Date || row.date || ''
}

// ── TMDB FILM MATCHER (rate-limited, batched) ──
/** TMDB could not be asked (busy past its retries, down, or offline): not the same as "no such film". */
const UNREACHABLE = 'unreachable' as const
type Lookup = TMDBMatch | null | typeof UNREACHABLE

const matchCache = new Map<string, TMDBMatch | null>()

/** How many times a busy TMDB is asked again before the film is left for the next import. */
const TMDB_RETRIES = 3

async function matchFilmToTMDB(title: string, year?: string, attempt = 0): Promise<Lookup> {
    const cacheKey = `${title}::${year || ''}`
    if (matchCache.has(cacheKey)) return matchCache.get(cacheKey) || null

    try {
        const yearParam = year ? `&year=${year}` : ''
        const res = await fetch(PROXY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
                path: `/search/movie?query=${encodeURIComponent(title)}${yearParam}&page=1`,
            }),
        })

        if (res.status === 429) {
            if (attempt >= TMDB_RETRIES) return UNREACHABLE
            await sleep(2000 * (attempt + 1))
            return matchFilmToTMDB(title, year, attempt + 1)
        }

        if (!res.ok) return UNREACHABLE

        const data = await res.json()
        const results = data.results || []

        if (results.length === 0) {
            if (year) {
                const fallback = await matchFilmToTMDB(title)
                if (fallback !== UNREACHABLE) matchCache.set(cacheKey, fallback)
                return fallback
            }
            matchCache.set(cacheKey, null)
            return null
        }

        const match = results[0]
        const result: TMDBMatch = {
            id: match.id,
            title: match.title,
            poster_path: match.poster_path,
            release_date: match.release_date || '',
        }
        matchCache.set(cacheKey, result)
        return result
    } catch {
        return UNREACHABLE
    }
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Writes rows fifty at a time. A batch the database refuses is written again
 * row by row, so one bad row costs itself and not its forty-nine neighbours. A
 * row already kept (the film is already in the archive or the stack) is not a
 * failure. Returns the rows saved and how many could not be.
 */
async function saveRows<T>(
    table: 'logs' | 'watchlists' | 'list_items',
    rows: T[],
    onBatch?: (done: number) => void,
): Promise<{ saved: T[]; failed: number }> {
    const saved: T[] = []
    let failed = 0
    for (let i = 0; i < rows.length; i += 50) {
        const chunk = rows.slice(i, i + 50)
        const { error } = await supabase.from(table).insert(chunk)
        if (!error) {
            saved.push(...chunk)
        } else {
            for (const row of chunk) {
                const { error: rowError } = await supabase.from(table).insert([row])
                if (!rowError) saved.push(row)
                else if (rowError.code !== '23505') failed++
            }
        }
        onBatch?.(Math.min(i + 50, rows.length))
    }
    return { saved, failed }
}

/** "1 diary entry" / "3 diary entries". */
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// ── Convert imported rating (0-5 with halves) to ReelHouse rating (0-5) ──
function convertRating(lbRating: string): number {
    if (!lbRating || lbRating.trim() === '') return 0
    const val = parseFloat(lbRating)
    if (isNaN(val)) return 0
    return Math.min(Math.max(val, 0), 5)
}

// ── MAIN IMPORT FUNCTION ──
export async function importArchiveZip(
    file: File,
    onProgress: (progress: ImportProgress) => void
): Promise<ImportResult> {
    const user = useAuthStore.getState().user
    if (!user) throw new Error('You must be signed in to import.')
    
    const result: ImportResult = { logs: 0, reviews: 0, watchlist: 0, lists: 0, skipped: 0, errors: [] }
    
    // ── Step 1: Extract ZIP ──
    onProgress({ phase: 'Extracting archive...', current: 0, total: 1 })
    const zip = await JSZip.loadAsync(file)
    
    // ── Step 2: Smart CSV reader — handles nested folders ──
    // Archive ZIPs may have files at root OR inside a folder like:
    //   diary.csv  OR  archive-export-2026-04-01/diary.csv
    const findFile = (name: string): any => {
        // Try exact path first
        let entry = zip.file(name)
        if (entry) return entry
        
        // Search all files for one ending with this name
        for (const [path, zipEntry] of Object.entries(zip.files)) {
            if (!zipEntry.dir && (path.endsWith('/' + name) || path === name)) {
                return zipEntry
            }
        }
        return null
    }
    
    const readCSV = async (name: string): Promise<Record<string, string>[]> => {
        const entry = findFile(name)
        if (!entry) return []
        const text = await entry.async('text')
        return parseCSV(text)
    }
    
    const diary = await readCSV('diary.csv')
    const reviews = await readCSV('reviews.csv')
    const ratings = await readCSV('ratings.csv')
    const watched = await readCSV('watched.csv')
    const watchlist = await readCSV('watchlist.csv')

    // ── Find list CSVs — handles nested folders ──
    // Imported list CSVs can have metadata rows at the top like:
    //   Name,My List
    //   Date,2024-01-15
    //   URL,https://...
    //   (blank line)
    //   Position,Name,Year,URL
    //   1,The Matrix,1999,...
    // We need to find the REAL header row (contains Name + Year columns)
    function parseListCSV(text: string): Record<string, string>[] {
        const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        const lines = normalized.split('\n').filter(l => l.trim())
        
        // Find the header row that contains both 'Name' and 'Year' as separate columns
        let headerIdx = -1
        for (let i = 0; i < Math.min(lines.length, 10); i++) {
            const cols = parseCSVLine(lines[i]).map(c => c.trim())
            // Check if this line has both Name and Year as separate column headers
            if (cols.includes('Name') && cols.includes('Year')) {
                headerIdx = i
                break
            }
        }
        
        // If no proper header found, fall back to standard parseCSV
        if (headerIdx === -1) {
            return parseCSV(text)
        }
        
        // Parse from the real header row
        const headers = parseCSVLine(lines[headerIdx]).map(h => h.trim())
        const rows: Record<string, string>[] = []
        for (let i = headerIdx + 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i])
            const row: Record<string, string> = {}
            headers.forEach((h, idx) => {
                row[h] = (values[idx] || '').trim()
            })
            // Only include rows that actually have a Name value
            if (row.Name || row.name) rows.push(row)
        }
        return rows
    }
    
    const listFiles: { name: string; data: Record<string, string>[] }[] = []
    for (const [path, entry] of Object.entries(zip.files)) {
        // Match any path that contains /lists/ and ends with .csv
        if ((path.includes('/lists/') || path.startsWith('lists/')) && path.endsWith('.csv') && !entry.dir) {
            const text = await entry.async('text')
            const segments = path.split('/')
            const fileName = segments[segments.length - 1]
            const listName = fileName.replace('.csv', '').replace(/-/g, ' ')
            // Use special list CSV parser that handles metadata rows
            const parsed = parseListCSV(text)
            listFiles.push({ name: listName, data: parsed })
        }
    }

    // ── Step 3: Collect all unique films to match ──
    const allFilms = new Map<string, { title: string; year?: string }>()
    
    const addFilm = (title: string, year?: string) => {
        if (!title) return
        const key = `${title}::${year || ''}`
        if (!allFilms.has(key)) allFilms.set(key, { title, year })
    }
    
    diary.forEach(r => addFilm(getFilmName(r), getFilmYear(r)))
    reviews.forEach(r => addFilm(getFilmName(r), getFilmYear(r)))
    ratings.forEach(r => addFilm(getFilmName(r), getFilmYear(r)))
    watched.forEach(r => addFilm(getFilmName(r), getFilmYear(r)))
    watchlist.forEach(r => addFilm(getFilmName(r), getFilmYear(r)))
    listFiles.forEach(list => list.data.forEach(r => addFilm(getFilmName(r), getFilmYear(r))))

    // ── Step 4: Match all films to TMDB (batched) ──
    const filmMap = new Map<string, TMDBMatch>()
    const filmEntries = Array.from(allFilms.entries())
    const total = filmEntries.length
    
    const BATCH_SIZE = 4
    let unreachable = 0
    for (let i = 0; i < filmEntries.length; i += BATCH_SIZE) {
        const batch = filmEntries.slice(i, i + BATCH_SIZE)
        const matches = await Promise.all(
            batch.map(async ([key, { title, year }]) => {
                const match = await matchFilmToTMDB(title, year)
                return { key, match }
            })
        )
        
        for (const { key, match } of matches) {
            if (match === UNREACHABLE) unreachable++
            else if (match) filmMap.set(key, match)
            else result.skipped++
        }
        
        const current = Math.min(i + BATCH_SIZE, total)
        const lastFilm = batch[batch.length - 1]
        onProgress({
            phase: 'Matching films to database...',
            current,
            total,
            detail: `${lastFilm[1].title} (${lastFilm[1].year || '?'})`,
        })
        
        if (i + BATCH_SIZE < filmEntries.length) {
            await sleep(300)
        }
    }
    
    if (unreachable > 0) {
        result.errors.push(`${count(unreachable, 'film', 'films')} could not be looked up just now. Import the same file again to add ${unreachable === 1 ? 'it' : 'them'}.`)
    }

    // ── Step 5: Fetch existing logs to prevent duplicates ──
    // An archive that could not be read is not an empty one: everything already
    // logged would be sent again and refused, fifty at a time.
    const unreadable = 'Your archive could not be read just now, so nothing was imported. Please try again.'
    onProgress({ phase: 'Checking existing archive...', current: 0, total: 1 })
    const existingFilmIds = new Set<number>()
    let ePage = 0
    while (true) {
        const { data, error } = await supabase
            .from('logs').select('film_id').eq('user_id', user.id)
            .range(ePage * 1000, (ePage + 1) * 1000 - 1)
        if (error) throw new Error(unreadable)
        if (!data || data.length === 0) break
        data.forEach((l: any) => existingFilmIds.add(l.film_id))
        if (data.length < 1000) break
        ePage++
    }

    const existingWatchlistIds = new Set<number>()
    const { data: existingWatchlist, error: watchlistError } = await supabase
        .from('watchlists').select('film_id').eq('user_id', user.id)
    if (watchlistError) throw new Error(unreadable)
    ;(existingWatchlist || []).forEach((w: any) => existingWatchlistIds.add(w.film_id))

    // A review past the house's limit is cut between characters, and the member told.
    let shortened = 0
    const fit = (review: string) => {
        const cut = cutChars(review, LIMITS.review)
        if (cut.length < review.length) shortened++
        return cut
    }

    // ── Step 6: Build review map from reviews.csv ──
    const reviewMap = new Map<string, string>()
    reviews.forEach(r => {
        const name = getFilmName(r)
        const year = getFilmYear(r)
        const reviewText = r.Review || r.review || ''
        if (name && reviewText) {
            const key = `${name}::${year}`
            reviewMap.set(key, reviewText)
        }
    })
    
    // ── Step 7: Import Diary Logs ──
    const logsToInsert: any[] = []
    for (let i = 0; i < diary.length; i++) {
        const entry = diary[i]
        const name = getFilmName(entry)
        const year = getFilmYear(entry)
        const key = `${name}::${year}`
        const film = filmMap.get(key)
        if (!film) continue
        if (existingFilmIds.has(film.id)) continue
        
        const rating = convertRating(entry.Rating || entry.rating || '')
        const reviewText = fit(reviewMap.get(key) || '')
        const isRewatch = (entry.Rewatch || entry.rewatch || '') === 'Yes'
        
        // Use WatchedDate from diary, fall back to Date, then release year
        let watchedDate = getWatchedDate(entry)
        if (!watchedDate && film.release_date) {
            watchedDate = film.release_date
        }
        if (!watchedDate) watchedDate = '2025-01-01'
        
        logsToInsert.push({
            user_id: user.id,
            film_id: film.id,
            film_title: film.title,
            poster_path: film.poster_path,
            year: film.release_date ? parseInt(film.release_date.slice(0, 4)) : null,
            rating,
            review: reviewText,
            status: isRewatch ? 'rewatched' : 'watched',
            is_spoiler: false,
            watched_date: watchedDate,
            created_at: new Date(watchedDate + 'T12:00:00Z').toISOString(),
            format: 'Digital',
        })
        existingFilmIds.add(film.id)

        if (i % 10 === 0) {
            onProgress({ phase: 'Preparing diary logs...', current: i + 1, total: diary.length, detail: film.title })
        }
    }

    onProgress({ phase: 'Saving diary logs...', current: 0, total: logsToInsert.length })
    const diarySaved = await saveRows('logs', logsToInsert, (done) =>
        onProgress({ phase: 'Saving diary logs...', current: done, total: logsToInsert.length }))
    result.logs += diarySaved.saved.length
    result.reviews += diarySaved.saved.filter((r) => r.review).length
    if (diarySaved.failed > 0) result.errors.push(`${count(diarySaved.failed, 'diary entry', 'diary entries')} could not be saved.`)
    
    // ── Step 8: Gap-fill from Ratings ──
    const ratingsToInsert: any[] = []
    for (const entry of ratings) {
        const name = getFilmName(entry)
        const year = getFilmYear(entry)
        const key = `${name}::${year}`
        const film = filmMap.get(key)
        if (!film || existingFilmIds.has(film.id)) continue
        
        const rating = convertRating(entry.Rating || entry.rating || '')
        if (rating === 0) continue
        
        const reviewText = fit(reviewMap.get(key) || '')

        // Use the imported Date column (when rating was added), then release date
        let ratingDate = entry.Date || entry.date || ''
        if (!ratingDate && film.release_date) ratingDate = film.release_date
        if (!ratingDate) ratingDate = '2025-01-01'
        
        ratingsToInsert.push({
            user_id: user.id,
            film_id: film.id,
            film_title: film.title,
            poster_path: film.poster_path,
            year: film.release_date ? parseInt(film.release_date.slice(0, 4)) : null,
            rating,
            review: reviewText,
            status: 'watched',
            is_spoiler: false,
            watched_date: ratingDate,
            created_at: new Date(ratingDate + 'T12:00:00Z').toISOString(),
            format: 'Digital',
        })
        existingFilmIds.add(film.id)
    }

    onProgress({ phase: 'Saving ratings...', current: 0, total: ratingsToInsert.length })
    const ratingsSaved = await saveRows('logs', ratingsToInsert, (done) =>
        onProgress({ phase: 'Saving ratings...', current: done, total: ratingsToInsert.length }))
    result.logs += ratingsSaved.saved.length
    result.reviews += ratingsSaved.saved.filter((r) => r.review).length
    if (ratingsSaved.failed > 0) result.errors.push(`${count(ratingsSaved.failed, 'rated film', 'rated films')} could not be saved.`)
    
    // ── Step 9: Gap-fill from Watched ──
    const watchedToInsert: any[] = []
    for (const entry of watched) {
        const name = getFilmName(entry)
        const year = getFilmYear(entry)
        const film = filmMap.get(`${name}::${year}`)
        if (!film || existingFilmIds.has(film.id)) continue
        
        // Use the Date column from the import, then film release date
        let watchedFilmDate = entry.Date || entry.date || ''
        if (!watchedFilmDate && film.release_date) watchedFilmDate = film.release_date
        if (!watchedFilmDate) watchedFilmDate = '2025-01-01'
        
        watchedToInsert.push({
            user_id: user.id,
            film_id: film.id,
            film_title: film.title,
            poster_path: film.poster_path,
            year: film.release_date ? parseInt(film.release_date.slice(0, 4)) : null,
            rating: 0,
            review: '',
            status: 'watched',
            is_spoiler: false,
            watched_date: watchedFilmDate,
            created_at: new Date(watchedFilmDate + 'T12:00:00Z').toISOString(),
            format: 'Digital',
        })
        existingFilmIds.add(film.id)
    }
    
    onProgress({ phase: 'Saving watched films...', current: 0, total: watchedToInsert.length })
    const watchedSaved = await saveRows('logs', watchedToInsert, (done) =>
        onProgress({ phase: 'Saving watched films...', current: done, total: watchedToInsert.length }))
    result.logs += watchedSaved.saved.length
    if (watchedSaved.failed > 0) result.errors.push(`${count(watchedSaved.failed, 'watched film', 'watched films')} could not be saved.`)
    
    // ── Step 10: Import Watchlist ──
    const watchlistToInsert: any[] = []
    for (const entry of watchlist) {
        const name = getFilmName(entry)
        const year = getFilmYear(entry)
        const film = filmMap.get(`${name}::${year}`)
        if (!film || existingWatchlistIds.has(film.id) || existingFilmIds.has(film.id)) continue
        
        watchlistToInsert.push({
            user_id: user.id,
            film_id: film.id,
            film_title: film.title,
            poster_path: film.poster_path,
            year: film.release_date ? parseInt(film.release_date.slice(0, 4)) : null,
        })
        existingWatchlistIds.add(film.id)
    }
    
    onProgress({ phase: 'Importing watchlist...', current: 0, total: watchlistToInsert.length })
    const watchlistSaved = await saveRows('watchlists', watchlistToInsert, (done) =>
        onProgress({ phase: 'Importing watchlist...', current: done, total: watchlistToInsert.length }))
    result.watchlist += watchlistSaved.saved.length
    if (watchlistSaved.failed > 0) result.errors.push(`${count(watchlistSaved.failed, 'watchlist film', 'watchlist films')} could not be saved.`)
    
    // ── Step 11: Import Lists as Stacks ──
    for (let li = 0; li < listFiles.length; li++) {
        const listFile = listFiles[li]
        onProgress({ phase: 'Creating stacks...', current: li + 1, total: listFiles.length, detail: listFile.name })
        const listTitle = cutChars(listFile.name.charAt(0).toUpperCase() + listFile.name.slice(1), LIMITS.listTitle)

        try {
            // Check if list already exists
            const { data: existingList, error: findError } = await supabase
                .from('lists').select('id').eq('user_id', user.id).eq('title', listTitle).maybeSingle()
            if (findError) {
                result.errors.push(`The stack "${listTitle}" could not be checked just now, so it was not imported.`)
                continue
            }

            let listId: string

            if (existingList) {
                listId = existingList.id
            } else {
                const { data: listData, error: listError } = await supabase
                    .from('lists')
                    .insert([{ user_id: user.id, title: listTitle, description: '', is_private: false }])
                    .select().single()

                if (listError || !listData) {
                    result.errors.push(`The stack "${listTitle}" could not be created.`)
                    continue
                }
                listId = listData.id
            }

            // Collect films, deduplicate
            const seenFilmIds = new Set<number>()
            const listItems: { list_id: string; film_id: number; film_title: string; poster_path: string | null }[] = []

            for (const entry of listFile.data) {
                const name = getFilmName(entry)
                const year = getFilmYear(entry)
                if (!name) continue
                const key = `${name}::${year}`
                const film = filmMap.get(key)
                if (!film) continue
                if (seenFilmIds.has(film.id)) continue
                seenFilmIds.add(film.id)

                listItems.push({
                    list_id: listId,
                    film_id: film.id,
                    film_title: film.title,
                    poster_path: film.poster_path,
                })
            }

            if (listItems.length === 0 && listFile.data.length > 0) {
                result.errors.push(`None of the films in "${listTitle}" could be matched.`)
            }

            // Inserted directly: RLS takes the owner from the session.
            const itemsSaved = await saveRows('list_items', listItems)
            if (itemsSaved.failed > 0) {
                result.errors.push(`${count(itemsSaved.failed, 'film', 'films')} in "${listTitle}" could not be added.`)
            }

            result.lists++
        } catch {
            result.errors.push(`The stack "${listTitle}" could not be imported.`)
        }
    }

    if (shortened > 0) {
        result.errors.push(`${count(shortened, 'review was', 'reviews were')} longer than ${LIMITS.review.toLocaleString('en-US')} characters, so ${shortened === 1 ? 'it was' : 'they were'} shortened to fit.`)
    }

    // ── Final ──
    onProgress({ phase: 'Import complete!', current: 1, total: 1 })
    
    return result
}
