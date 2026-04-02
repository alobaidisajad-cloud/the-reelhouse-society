/**
 * Letterboxd Import Engine — "THE TRANSFER PROTOCOL" v5 (Final)
 * 
 * Parses a Letterboxd ZIP export and imports all data into ReelHouse:
 * - diary.csv → Film Logs (with dates, ratings, rewatch status)
 * - reviews.csv → Review text merged into matching logs
 * - ratings.csv → Gap-fill logs for rated-but-not-diaried films
 * - watched.csv → Gap-fill logs for watched-but-not-logged films 
 * - watchlist.csv → Watchlist items
 * - lists/*.csv → Stacks (film lists)
 * 
 * v5 fixes:
 *  - Handles nested ZIP folders (e.g. letterboxd-user-2026-04-01/diary.csv)
 *  - Proper date handling — NEVER uses today's date as fallback
 *  - Lists populated via batch_insert_list_items RPC
 *  - created_at set from watched_date for correct chronological ordering
 */
import JSZip from 'jszip'
import { supabase } from '../supabaseClient'
import { useAuthStore } from '../store'

// ── TMDB API for film matching ──
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY || ''
const TMDB_BASE = 'https://api.themoviedb.org/3'

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

// ── CSV PARSER (handles multiline quoted fields like Letterboxd reviews) ──
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
    // Letterboxd diary: 'Watched Date' or 'WatchedDate'
    // Other CSVs: 'Date' or 'date'
    return row['Watched Date'] || row.WatchedDate || row.Date || row.date || ''
}

// ── TMDB FILM MATCHER (rate-limited, batched) ──
const matchCache = new Map<string, TMDBMatch | null>()

async function matchFilmToTMDB(title: string, year?: string): Promise<TMDBMatch | null> {
    const cacheKey = `${title}::${year || ''}`
    if (matchCache.has(cacheKey)) return matchCache.get(cacheKey) || null
    
    try {
        const yearParam = year ? `&year=${year}` : ''
        const res = await fetch(
            `${TMDB_BASE}/search/movie?query=${encodeURIComponent(title)}${yearParam}&page=1&api_key=${TMDB_API_KEY}`
        )
        
        if (res.status === 429) {
            await sleep(2000)
            return matchFilmToTMDB(title, year)
        }
        
        if (!res.ok) {
            matchCache.set(cacheKey, null)
            return null
        }
        
        const data = await res.json()
        const results = data.results || []
        
        if (results.length === 0) {
            if (year) {
                const fallback = await matchFilmToTMDB(title)
                matchCache.set(cacheKey, fallback)
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
        matchCache.set(cacheKey, null)
        return null
    }
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Convert Letterboxd rating (0-5 with halves) to ReelHouse rating (0-5) ──
function convertRating(lbRating: string): number {
    if (!lbRating || lbRating.trim() === '') return 0
    const val = parseFloat(lbRating)
    if (isNaN(val)) return 0
    return Math.min(Math.max(val, 0), 5)
}

// ── MAIN IMPORT FUNCTION ──
export async function importLetterboxdZip(
    file: File,
    onProgress: (progress: ImportProgress) => void
): Promise<ImportResult> {
    const user = useAuthStore.getState().user
    if (!user) throw new Error('You must be signed in to import.')
    
    const result: ImportResult = { logs: 0, reviews: 0, watchlist: 0, lists: 0, skipped: 0, errors: [] }
    
    // ── Step 1: Extract ZIP ──
    onProgress({ phase: '[v5] Extracting archive...', current: 0, total: 1 })
    const zip = await JSZip.loadAsync(file)
    
    // ── Step 2: Smart CSV reader — handles nested folders ──
    // Letterboxd ZIPs may have files at root OR inside a folder like:
    //   diary.csv  OR  letterboxd-user-2026-04-01/diary.csv
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
    
    result.errors.push(`[INFO] Found: ${diary.length} diary, ${ratings.length} ratings, ${watched.length} watched, ${reviews.length} reviews, ${watchlist.length} watchlist`)
    
    // ── Find list CSVs — handles nested folders ──
    // Letterboxd list CSVs can have metadata rows at the top like:
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
    
    const listFiles: { name: string; data: Record<string, string>[]; rawPreview: string }[] = []
    const allZipPaths: string[] = []
    for (const [path, entry] of Object.entries(zip.files)) {
        allZipPaths.push(path)
        // Match any path that contains /lists/ and ends with .csv
        if ((path.includes('/lists/') || path.startsWith('lists/')) && path.endsWith('.csv') && !entry.dir) {
            const text = await entry.async('text')
            const segments = path.split('/')
            const fileName = segments[segments.length - 1]
            const listName = fileName.replace('.csv', '').replace(/-/g, ' ')
            // Use special list CSV parser that handles metadata rows
            const parsed = parseListCSV(text)
            listFiles.push({ name: listName, data: parsed, rawPreview: text.slice(0, 500) })
        }
    }
    
    // Store comprehensive diagnostics in a log entry for remote debugging
    const diagParts: string[] = []
    diagParts.push(`ZIP paths: ${allZipPaths.filter(p => p.includes('list')).join(' | ')}`)
    diagParts.push(`Lists found: ${listFiles.length}`)
    if (listFiles.length > 0) {
        const lf = listFiles[0]
        diagParts.push(`First list: "${lf.name}" (${lf.data.length} rows)`)
        if (lf.data.length > 0) {
            diagParts.push(`Cols: ${Object.keys(lf.data[0]).join(', ')}`)
            diagParts.push(`Row0 Name="${getFilmName(lf.data[0])}" Year="${getFilmYear(lf.data[0])}"`)
        }
        diagParts.push(`Raw: ${lf.rawPreview.slice(0, 200)}`)
    }
    result.errors.push(`[INFO] Found ${listFiles.length} list CSVs`)
    
    // Write diagnostics to DB so we can query remotely
    try {
        await supabase.from('logs').insert([{
            user_id: user.id,
            film_id: 0,
            film_title: '__import_debug',
            poster_path: null,
            year: null,
            rating: 0,
            review: diagParts.join('\n'),
            status: 'watched',
            is_spoiler: false,
            watched_date: '2000-01-01',
            format: 'Debug',
        }])
    } catch { /* ignore debug insert errors */ }
    
    // Log diagnostics to errors array too
    if (listFiles.length > 0) {
        const lf = listFiles[0]
        if (lf.data.length > 0) {
            result.errors.push(`[DEBUG] List "${lf.name}" cols: ${Object.keys(lf.data[0]).join(', ')}`)
            result.errors.push(`[DEBUG] Row[0]: Name="${getFilmName(lf.data[0])}", Year="${getFilmYear(lf.data[0])}"`)
        } else {
            result.errors.push(`[DEBUG] List "${lf.name}" = 0 rows. Raw: ${lf.rawPreview.slice(0, 150)}`)
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
    
    result.errors.push(`[INFO] ${allFilms.size} unique films to match`)
    
    // ── Step 4: Match all films to TMDB (batched) ──
    const filmMap = new Map<string, TMDBMatch>()
    const filmEntries = Array.from(allFilms.entries())
    const total = filmEntries.length
    
    const BATCH_SIZE = 4
    for (let i = 0; i < filmEntries.length; i += BATCH_SIZE) {
        const batch = filmEntries.slice(i, i + BATCH_SIZE)
        const matches = await Promise.all(
            batch.map(async ([key, { title, year }]) => {
                const match = await matchFilmToTMDB(title, year)
                return { key, match }
            })
        )
        
        for (const { key, match } of matches) {
            if (match) filmMap.set(key, match)
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
    
    result.errors.push(`[INFO] Matched ${filmMap.size}/${allFilms.size} films`)
    
    // ── Step 5: Fetch existing logs to prevent duplicates ──
    onProgress({ phase: 'Checking existing archive...', current: 0, total: 1 })
    const existingFilmIds = new Set<number>()
    let ePage = 0
    while (true) {
        const { data } = await supabase
            .from('logs').select('film_id').eq('user_id', user.id)
            .range(ePage * 1000, (ePage + 1) * 1000 - 1)
        if (!data || data.length === 0) break
        data.forEach((l: any) => existingFilmIds.add(l.film_id))
        if (data.length < 1000) break
        ePage++
    }
    
    const existingWatchlistIds = new Set<number>()
    const { data: existingWatchlist } = await supabase
        .from('watchlists').select('film_id').eq('user_id', user.id)
    ;(existingWatchlist || []).forEach((w: any) => existingWatchlistIds.add(w.film_id))
    
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
        const reviewText = reviewMap.get(key) || ''
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
        if (reviewText) result.reviews++
        
        if (i % 10 === 0) {
            onProgress({ phase: 'Preparing diary logs...', current: i + 1, total: diary.length, detail: film.title })
        }
    }
    
    onProgress({ phase: 'Saving diary logs...', current: 0, total: logsToInsert.length })
    for (let i = 0; i < logsToInsert.length; i += 50) {
        const chunk = logsToInsert.slice(i, i + 50)
        const { error } = await supabase.from('logs').insert(chunk)
        if (error) {
            result.errors.push(`Diary batch ${Math.floor(i/50)}: ${error.message}`)
        } else {
            result.logs += chunk.length
        }
        onProgress({ phase: 'Saving diary logs...', current: Math.min(i + 50, logsToInsert.length), total: logsToInsert.length })
    }
    
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
        
        const reviewText = reviewMap.get(key) || ''
        
        // Use Letterboxd Date column (when rating was added), then release date
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
        if (reviewText) result.reviews++
    }
    
    onProgress({ phase: 'Saving ratings...', current: 0, total: ratingsToInsert.length })
    for (let i = 0; i < ratingsToInsert.length; i += 50) {
        const chunk = ratingsToInsert.slice(i, i + 50)
        const { error } = await supabase.from('logs').insert(chunk)
        if (!error) result.logs += chunk.length
        else result.errors.push(`Ratings batch: ${error.message}`)
        onProgress({ phase: 'Saving ratings...', current: Math.min(i + 50, ratingsToInsert.length), total: ratingsToInsert.length })
    }
    
    // ── Step 9: Gap-fill from Watched ──
    const watchedToInsert: any[] = []
    for (const entry of watched) {
        const name = getFilmName(entry)
        const year = getFilmYear(entry)
        const film = filmMap.get(`${name}::${year}`)
        if (!film || existingFilmIds.has(film.id)) continue
        
        // Use Date column from Letterboxd, then film release date
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
    for (let i = 0; i < watchedToInsert.length; i += 50) {
        const chunk = watchedToInsert.slice(i, i + 50)
        const { error } = await supabase.from('logs').insert(chunk)
        if (!error) result.logs += chunk.length
        onProgress({ phase: 'Saving watched films...', current: Math.min(i + 50, watchedToInsert.length), total: watchedToInsert.length })
    }
    
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
    for (let i = 0; i < watchlistToInsert.length; i += 50) {
        const chunk = watchlistToInsert.slice(i, i + 50)
        const { error } = await supabase.from('watchlists').insert(chunk)
        if (!error) result.watchlist += chunk.length
    }
    
    // ── Step 11: Import Lists as Stacks ──
    for (let li = 0; li < listFiles.length; li++) {
        const listFile = listFiles[li]
        onProgress({ phase: 'Creating stacks...', current: li + 1, total: listFiles.length, detail: listFile.name })
        
        try {
            const listTitle = listFile.name.charAt(0).toUpperCase() + listFile.name.slice(1)
            
            // Check if list already exists
            const { data: existingList } = await supabase
                .from('lists').select('id').eq('user_id', user.id).eq('title', listTitle).maybeSingle()
            
            let listId: string
            
            if (existingList) {
                listId = existingList.id
            } else {
                const { data: listData, error: listError } = await supabase
                    .from('lists')
                    .insert([{ user_id: user.id, title: listTitle, description: '', is_private: false }])
                    .select().single()
                
                if (listError || !listData) {
                    result.errors.push(`List "${listFile.name}": ${listError?.message || 'create failed'}`)
                    continue
                }
                listId = listData.id
            }
            
            // Collect films, deduplicate
            const seenFilmIds = new Set<number>()
            const listItems: { film_id: number; film_title: string; poster_path: string | null }[] = []
            
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
                    film_id: film.id,
                    film_title: film.title,
                    poster_path: film.poster_path,
                })
            }
            
            // Report diagnostics
            if (listItems.length === 0 && listFile.data.length > 0) {
                const sampleRow = listFile.data[0]
                result.errors.push(`List "${listFile.name}": ${listFile.data.length} rows, 0 matched. Name="${getFilmName(sampleRow) || '?'}"`)
            }
            
            // Insert via RPC (SECURITY DEFINER), fallback to direct insert
            let itemsInserted = 0
            if (listItems.length > 0) {
                const { data: rpcResult, error: rpcError } = await supabase.rpc('batch_insert_list_items', {
                    p_list_id: listId,
                    p_owner_id: user.id,
                    p_items: listItems,
                })
                
                if (!rpcError && typeof rpcResult === 'number') {
                    itemsInserted = rpcResult
                } else {
                    if (rpcError && li === 0) {
                        result.errors.push(`[DEBUG] RPC error: ${rpcError.message}`)
                    }
                    // Fallback: direct insert one at a time
                    for (const item of listItems) {
                        const { error } = await supabase.from('list_items').insert([{ list_id: listId, ...item }])
                        if (!error) itemsInserted++
                        else if (li === 0 && itemsInserted === 0) {
                            result.errors.push(`[DEBUG] Insert error: ${error.message}`)
                        }
                    }
                }
            }
            
            if (itemsInserted > 0) {
                result.errors.push(`[OK] "${listFile.name}": ${itemsInserted} films`)
            } else if (listItems.length > 0) {
                result.errors.push(`"${listFile.name}": 0/${listItems.length} failed`)
            }
            
            result.lists++
        } catch (e: any) {
            result.errors.push(`List "${listFile.name}": ${e.message}`)
        }
    }
    
    // ── Final ──
    onProgress({ phase: 'Import complete!', current: 1, total: 1 })
    
    return result
}
