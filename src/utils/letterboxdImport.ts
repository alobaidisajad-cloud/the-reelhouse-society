/**
 * Letterboxd Import Engine — "THE TRANSFER PROTOCOL" v3
 * 
 * Parses a Letterboxd ZIP export and imports all data into ReelHouse:
 * - diary.csv → Film Logs (with dates, ratings, rewatch status)
 * - reviews.csv → Review text merged into matching logs
 * - ratings.csv → Gap-fill logs for rated-but-not-diaried films
 * - watched.csv → Gap-fill logs for watched-but-not-logged films 
 * - watchlist.csv → Watchlist items
 * - lists/*.csv → Stacks (film lists)
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
    // Strip BOM and normalize line endings
    const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    
    // Split into records respecting quoted fields that span multiple lines
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

// ── Helper: get film name from CSV row (handles both "Name" and "Title" columns) ──
function getFilmName(row: Record<string, string>): string {
    return row.Name || row.name || row.Title || row.title || ''
}
function getFilmYear(row: Record<string, string>): string {
    return row.Year || row.year || ''
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
    // Letterboxd uses 0-5 scale, same as ReelHouse — NO multiplication needed
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
    onProgress({ phase: 'Extracting archive...', current: 0, total: 1 })
    const zip = await JSZip.loadAsync(file)
    
    // ── Step 2: Read CSV files ──
    const readCSV = async (name: string): Promise<Record<string, string>[]> => {
        const entry = zip.file(name)
        if (!entry) return []
        const text = await entry.async('text')
        return parseCSV(text)
    }
    
    const diary = await readCSV('diary.csv')
    const reviews = await readCSV('reviews.csv')
    const ratings = await readCSV('ratings.csv')
    const watched = await readCSV('watched.csv')
    const watchlist = await readCSV('watchlist.csv')
    
    // Find list CSVs in lists/ folder
    const listFiles: { name: string; data: Record<string, string>[] }[] = []
    for (const [path, entry] of Object.entries(zip.files)) {
        if (path.startsWith('lists/') && path.endsWith('.csv') && !entry.dir) {
            const text = await entry.async('text')
            const listName = path.replace('lists/', '').replace('.csv', '').replace(/-/g, ' ')
            const parsed = parseCSV(text)
            listFiles.push({ name: listName, data: parsed })
        }
    }
    
    // Log diagnostics
    if (listFiles.length > 0 && listFiles[0].data.length > 0) {
        const sampleHeaders = Object.keys(listFiles[0].data[0])
        result.errors.push(`[DEBUG] List CSV headers: ${sampleHeaders.join(', ')}`)
        result.errors.push(`[DEBUG] Sample row: ${JSON.stringify(listFiles[0].data[0]).slice(0, 200)}`)
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
    
    // ── Step 5: Fetch existing logs to prevent duplicates (paginated) ──
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
    
    // ── Step 6b: Update EXISTING logs with reviews they're missing ──
    onProgress({ phase: 'Applying reviews to existing logs...', current: 0, total: reviewMap.size })
    let reviewsApplied = 0
    let reviewIdx = 0
    for (const [key, reviewText] of reviewMap.entries()) {
        reviewIdx++
        const film = filmMap.get(key)
        if (!film) continue
        if (!existingFilmIds.has(film.id)) continue
        
        // First check if the log actually needs a review update
        const { data: existingLog } = await supabase
            .from('logs')
            .select('id, review')
            .eq('user_id', user.id)
            .eq('film_id', film.id)
            .limit(1)
            .maybeSingle()
        
        if (existingLog && (!existingLog.review || existingLog.review.trim() === '')) {
            const { error: updateErr } = await supabase
                .from('logs')
                .update({ review: reviewText })
                .eq('id', existingLog.id)
            
            if (!updateErr) {
                reviewsApplied++
            }
        }
        
        if (reviewIdx % 10 === 0) {
            onProgress({
                phase: 'Applying reviews to existing logs...',
                current: reviewIdx,
                total: reviewMap.size,
                detail: film.title,
            })
        }
    }
    result.reviews += reviewsApplied
    
    // ── Step 6c: Update EXISTING logs with ratings they're missing ──
    onProgress({ phase: 'Applying ratings to existing logs...', current: 0, total: ratings.length })
    for (const entry of ratings) {
        const name = getFilmName(entry)
        const year = getFilmYear(entry)
        const film = filmMap.get(`${name}::${year}`)
        if (!film || !existingFilmIds.has(film.id)) continue
        
        const rating = convertRating(entry.Rating || entry.rating || '')
        if (rating === 0) continue
        
        await supabase
            .from('logs')
            .update({ rating })
            .eq('user_id', user.id)
            .eq('film_id', film.id)
            .eq('rating', 0)
    }
    
    // ── Step 7: Import NEW Diary Logs ──
    const diaryTotal = diary.length
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
            watched_date: entry['Watched Date'] || entry.Date || entry.date || new Date().toISOString(),
            format: 'Digital',
        })
        existingFilmIds.add(film.id)
        
        if (reviewText) result.reviews++
        
        onProgress({
            phase: 'Importing film diary...',
            current: i + 1,
            total: diaryTotal,
            detail: film.title,
        })
    }
    
    for (let i = 0; i < logsToInsert.length; i += 50) {
        const chunk = logsToInsert.slice(i, i + 50)
        const { error } = await supabase.from('logs').insert(chunk)
        if (error) {
            result.errors.push(`Diary batch ${Math.floor(i/50)}: ${error.message}`)
        } else {
            result.logs += chunk.length
        }
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
            watched_date: entry.Date || entry.date || new Date().toISOString(),
            format: 'Digital',
        })
        existingFilmIds.add(film.id)
        if (reviewText) result.reviews++
    }
    
    onProgress({ phase: 'Importing ratings...', current: 0, total: ratingsToInsert.length })
    for (let i = 0; i < ratingsToInsert.length; i += 50) {
        const chunk = ratingsToInsert.slice(i, i + 50)
        const { error } = await supabase.from('logs').insert(chunk)
        if (!error) result.logs += chunk.length
        else result.errors.push(`Ratings batch: ${error.message}`)
    }
    
    // ── Step 9: Gap-fill from Watched ──
    const watchedToInsert: any[] = []
    for (const entry of watched) {
        const name = getFilmName(entry)
        const year = getFilmYear(entry)
        const film = filmMap.get(`${name}::${year}`)
        if (!film || existingFilmIds.has(film.id)) continue
        
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
            watched_date: entry.Date || entry.date || new Date().toISOString(),
            format: 'Digital',
        })
        existingFilmIds.add(film.id)
    }
    
    onProgress({ phase: 'Importing watched films...', current: 0, total: watchedToInsert.length })
    for (let i = 0; i < watchedToInsert.length; i += 50) {
        const chunk = watchedToInsert.slice(i, i + 50)
        const { error } = await supabase.from('logs').insert(chunk)
        if (!error) result.logs += chunk.length
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
        onProgress({
            phase: 'Creating stacks...',
            current: li + 1,
            total: listFiles.length,
            detail: listFile.name,
        })
        
        try {
            const listTitle = listFile.name.charAt(0).toUpperCase() + listFile.name.slice(1)
            
            // Check if list already exists
            const { data: existingList } = await supabase
                .from('lists')
                .select('id')
                .eq('user_id', user.id)
                .eq('title', listTitle)
                .maybeSingle()
            
            let listId: string
            
            if (existingList) {
                listId = existingList.id
            } else {
                const { data: listData, error: listError } = await supabase
                    .from('lists')
                    .insert([{
                        user_id: user.id,
                        title: listTitle,
                        description: 'Imported from Letterboxd',
                        is_private: false,
                    }])
                    .select()
                    .single()
                
                if (listError || !listData) {
                    result.errors.push(`List "${listFile.name}": ${listError?.message || 'create failed'}`)
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
            
            // Report if no films were collected
            if (listItems.length === 0 && listFile.data.length > 0) {
                const sampleRow = listFile.data[0]
                result.errors.push(`List "${listFile.name}": ${listFile.data.length} rows but 0 films matched. Headers: ${Object.keys(sampleRow).join(',')}. Sample: ${getFilmName(sampleRow) || '(empty name)'}`)
            }
            
            // Insert items one at a time
            let itemsInserted = 0
            for (const item of listItems) {
                const { error: itemError } = await supabase.from('list_items').insert([item])
                if (itemError) {
                    if (!itemError.message.includes('duplicate') && !itemError.message.includes('unique') && !itemError.message.includes('already exists')) {
                        if (itemsInserted === 0) {
                            result.errors.push(`List "${listFile.name}" insert error: ${itemError.message}`)
                        }
                    }
                } else {
                    itemsInserted++
                }
            }
            
            if (itemsInserted > 0) {
                result.errors.push(`[OK] List "${listFile.name}": ${itemsInserted}/${listItems.length} films added`)
            } else if (listItems.length > 0) {
                result.errors.push(`List "${listFile.name}": 0/${listItems.length} films added — DB insert rejected`)
            }
            
            result.lists++
        } catch (e: any) {
            result.errors.push(`List "${listFile.name}": ${e.message}`)
        }
    }
    
    // ── Final ──
    onProgress({ phase: 'Synchronizing archive...', current: 1, total: 1 })
    
    return result
}
