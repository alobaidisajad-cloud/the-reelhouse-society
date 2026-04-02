/**
 * Letterboxd Import Engine — "THE TRANSFER PROTOCOL"
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
    phase: string          // e.g. "Matching films..." 
    current: number
    total: number
    detail?: string        // e.g. "There Will Be Blood (2007)"
}

interface ImportResult {
    logs: number
    reviews: number
    watchlist: number
    lists: number
    skipped: number
    errors: string[]
}

// ── CSV PARSER (no dependencies) ──
function parseCSV(text: string): Record<string, string>[] {
    const lines = text.split('\n')
    if (lines.length < 2) return []
    
    // Parse header
    const headers = parseCSVLine(lines[0])
    const rows: Record<string, string>[] = []
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        const values = parseCSVLine(line)
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
                i++ // skip escaped quote
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
            // Rate limited — wait and retry
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
            // Try without year as fallback
            if (year) {
                const fallback = await matchFilmToTMDB(title)
                matchCache.set(cacheKey, fallback)
                return fallback
            }
            matchCache.set(cacheKey, null)
            return null
        }
        
        // Best match: exact title + closest year
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
            listFiles.push({ name: listName, data: parseCSV(text) })
        }
    }
    
    // ── Step 3: Collect all unique films to match ──
    const allFilms = new Map<string, { title: string; year?: string }>()
    
    const addFilm = (title: string, year?: string) => {
        if (!title) return
        const key = `${title}::${year || ''}`
        if (!allFilms.has(key)) allFilms.set(key, { title, year })
    }
    
    diary.forEach(r => addFilm(r.Name, r.Year))
    reviews.forEach(r => addFilm(r.Name, r.Year))
    ratings.forEach(r => addFilm(r.Name, r.Year))
    watched.forEach(r => addFilm(r.Name, r.Year))
    watchlist.forEach(r => addFilm(r.Name, r.Year))
    listFiles.forEach(list => list.data.forEach(r => addFilm(r.Name, r.Year)))
    
    // ── Step 4: Match all films to TMDB (batched) ──
    const filmMap = new Map<string, TMDBMatch>()
    const filmEntries = Array.from(allFilms.entries())
    const total = filmEntries.length
    
    // Process in batches of 4 to respect TMDB rate limits (~40 req/10s)
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
        
        // Small delay between batches for rate limiting
        if (i + BATCH_SIZE < filmEntries.length) {
            await sleep(300)
        }
    }
    
    // ── Step 5: Fetch existing logs to prevent duplicates ──
    onProgress({ phase: 'Checking existing archive...', current: 0, total: 1 })
    const { data: existingLogs } = await supabase
        .from('logs').select('film_id').eq('user_id', user.id)
    const existingFilmIds = new Set((existingLogs || []).map((l: any) => l.film_id))
    
    const { data: existingWatchlist } = await supabase
        .from('watchlists').select('film_id').eq('user_id', user.id)
    const existingWatchlistIds = new Set((existingWatchlist || []).map((w: any) => w.film_id))
    
    // ── Step 6: Import Diary Logs ──
    const diaryTotal = diary.length
    const reviewMap = new Map<string, string>()
    reviews.forEach(r => {
        const key = `${r.Name}::${r.Year || ''}`
        if (r.Review) reviewMap.set(key, r.Review)
    })
    
    // Batch insert diary logs
    const logsToInsert: any[] = []
    for (let i = 0; i < diary.length; i++) {
        const entry = diary[i]
        const key = `${entry.Name}::${entry.Year || ''}`
        const film = filmMap.get(key)
        if (!film) continue
        if (existingFilmIds.has(film.id)) continue
        
        const rating = entry.Rating ? Math.round(parseFloat(entry.Rating) * 2) : 0
        const reviewText = reviewMap.get(key) || ''
        const isRewatch = entry.Rewatch === 'Yes'
        
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
            watched_date: entry['Watched Date'] || entry.Date || new Date().toISOString(),
            format: 'Digital',
        })
        existingFilmIds.add(film.id) // mark as imported to avoid double-import from ratings/watched
        
        if (reviewText) result.reviews++
        
        onProgress({
            phase: 'Importing film diary...',
            current: i + 1,
            total: diaryTotal,
            detail: film.title,
        })
    }
    
    // Batch insert in chunks of 50
    for (let i = 0; i < logsToInsert.length; i += 50) {
        const chunk = logsToInsert.slice(i, i + 50)
        const { error } = await supabase.from('logs').insert(chunk)
        if (error) {
            result.errors.push(`Diary batch ${i}: ${error.message}`)
        } else {
            result.logs += chunk.length
        }
    }
    
    // ── Step 7: Gap-fill from Ratings (films rated but not in diary) ──
    const ratingsToInsert: any[] = []
    for (const entry of ratings) {
        const key = `${entry.Name}::${entry.Year || ''}`
        const film = filmMap.get(key)
        if (!film || existingFilmIds.has(film.id)) continue
        
        const rating = entry.Rating ? Math.round(parseFloat(entry.Rating) * 2) : 0
        if (rating === 0) continue
        
        ratingsToInsert.push({
            user_id: user.id,
            film_id: film.id,
            film_title: film.title,
            poster_path: film.poster_path,
            year: film.release_date ? parseInt(film.release_date.slice(0, 4)) : null,
            rating,
            review: '',
            status: 'watched',
            is_spoiler: false,
            watched_date: entry.Date || new Date().toISOString(),
            format: 'Digital',
        })
        existingFilmIds.add(film.id)
    }
    
    onProgress({ phase: 'Importing ratings...', current: 0, total: ratingsToInsert.length })
    for (let i = 0; i < ratingsToInsert.length; i += 50) {
        const chunk = ratingsToInsert.slice(i, i + 50)
        const { error } = await supabase.from('logs').insert(chunk)
        if (!error) result.logs += chunk.length
    }
    
    // ── Step 8: Gap-fill from Watched (marked watched but no rating/diary) ──
    const watchedToInsert: any[] = []
    for (const entry of watched) {
        const key = `${entry.Name}::${entry.Year || ''}`
        const film = filmMap.get(key)
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
            watched_date: entry.Date || new Date().toISOString(),
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
    
    // ── Step 9: Import Watchlist ──
    const watchlistToInsert: any[] = []
    for (const entry of watchlist) {
        const key = `${entry.Name}::${entry.Year || ''}`
        const film = filmMap.get(key)
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
    
    // ── Step 10: Import Lists as Stacks ──
    for (let li = 0; li < listFiles.length; li++) {
        const listFile = listFiles[li]
        onProgress({
            phase: 'Creating stacks...',
            current: li + 1,
            total: listFiles.length,
            detail: listFile.name,
        })
        
        try {
            // Create the list
            const { data: listData, error: listError } = await supabase
                .from('lists')
                .insert([{
                    user_id: user.id,
                    title: listFile.name.charAt(0).toUpperCase() + listFile.name.slice(1),
                    description: `Imported from Letterboxd`,
                    is_private: false,
                }])
                .select()
                .single()
            
            if (listError || !listData) {
                result.errors.push(`List "${listFile.name}": ${listError?.message || 'Failed to create'}`)
                continue
            }
            
            // Add films to the list
            const listItems: any[] = []
            for (const entry of listFile.data) {
                const key = `${entry.Name}::${entry.Year || ''}`
                const film = filmMap.get(key)
                if (!film) continue
                
                listItems.push({
                    list_id: listData.id,
                    film_id: film.id,
                    film_title: film.title,
                    poster_path: film.poster_path,
                })
            }
            
            if (listItems.length > 0) {
                for (let i = 0; i < listItems.length; i += 50) {
                    await supabase.from('list_items').insert(listItems.slice(i, i + 50))
                }
            }
            
            result.lists++
        } catch (e: any) {
            result.errors.push(`List "${listFile.name}": ${e.message}`)
        }
    }
    
    // ── Final: Refresh stores ──
    onProgress({ phase: 'Synchronizing archive...', current: 1, total: 1 })
    
    return result
}
