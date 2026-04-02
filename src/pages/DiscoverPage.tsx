import { useEffect, useState, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, SlidersHorizontal, ChevronDown, Bookmark } from 'lucide-react'
import reelToast from '../utils/reelToast'
import { tmdb, obscurityScore } from '../tmdb'
import { FilmCard, SectionHeader, LoadingReel, ObscurityBadge, PersonPlaceholder } from '../components/UI'
import { useUIStore, useDiscoverStore, useFilmStore, useAuthStore } from '../store'
import PageSEO from '../components/PageSEO'
import Poster from '../components/film/Poster'

import { useViewport } from '../hooks/useViewport'


// ── FILTER DATA ──
const GENRES = [
    { id: 28, name: 'Action' }, { id: 27, name: 'Horror' }, { id: 878, name: 'Sci-Fi' },
    { id: 18, name: 'Drama' }, { id: 35, name: 'Comedy' }, { id: 80, name: 'Crime' },
    { id: 14, name: 'Fantasy' }, { id: 9648, name: 'Mystery' }, { id: 37, name: 'Western' },
    { id: 16, name: 'Animation' }, { id: 99, name: 'Documentary' }, { id: 10749, name: 'Romance' },
    { id: 53, name: 'Thriller' }, { id: 10751, name: 'Family' }, { id: 36, name: 'History' },
]

const DECADES = [
    { label: '2020s', from: '2020-01-01', to: '2029-12-31' },
    { label: '2010s', from: '2010-01-01', to: '2019-12-31' },
    { label: '2000s', from: '2000-01-01', to: '2009-12-31' },
    { label: '1990s', from: '1990-01-01', to: '1999-12-31' },
    { label: '1980s', from: '1980-01-01', to: '1989-12-31' },
    { label: '70s & Earlier', from: '1900-01-01', to: '1979-12-31' },
]

const SORT_OPTIONS = [
    { value: 'popularity.desc', label: 'Most Popular' },
    { value: 'vote_average.desc', label: 'Highest Rated' },
    { value: 'release_date.desc', label: 'Newest First' },
    { value: 'release_date.asc', label: 'Oldest First' },
    { value: 'revenue.desc', label: 'Box Office' },
    { value: 'vote_count.desc', label: 'Most Voted' },
]

// Languages
const LANGUAGES = [
    { iso: 'en', name: 'English' },
    { iso: 'fr', name: 'French' },
    { iso: 'es', name: 'Spanish' },
    { iso: 'ja', name: 'Japanese' },
    { iso: 'ko', name: 'Korean' },
    { iso: 'it', name: 'Italian' },
    { iso: 'de', name: 'German' },
    { iso: 'zh', name: 'Chinese' },
    { iso: 'ar', name: 'Arabic' },
    { iso: 'hi', name: 'Hindi' },
]

const MOODS = [
    { label: 'Emotional', sub: 'Heavy, profound stories that move you.', glyph: '†', genre: 18, sort: 'vote_average.desc', color: '#4A1A3A', accent: '#C06080' },
    { label: 'Terrifying', sub: 'Dark, chilling nightmares.', glyph: '◉', genre: 27, sort: 'vote_average.desc', color: '#1A1A0A', accent: '#8B3A1A' },
    { label: 'Awe-Inspiring', sub: 'Epic, magical worlds.', glyph: '✦', genre: 14, sort: 'vote_average.desc', color: '#0A1A2A', accent: '#3A7A8B' },
    { label: 'Heartwarming', sub: 'Stories of love and connection.', glyph: '▣', genre: 10749, sort: 'release_date.asc', voteGte: 500, color: '#1C1208', accent: '#8B6914' },
    { label: 'Thrilling', sub: 'High-octane cinema.', glyph: <><X size={12} style={{ display: "inline-block", verticalAlign: "middle" }} /></>, genre: 28, sort: 'popularity.desc', color: '#2A0A0A', accent: '#8B1A1A' },
    { label: 'Hilarious', sub: 'Pure joy and laughter.', glyph: '◎', genre: 35, sort: 'vote_average.desc', voteGte: 200, color: '#0A1A0A', accent: '#4A8B3A' },
]

const Chip = ({ active, onClick, children, color }: any) => (
    <button onClick={onClick} style={{
        flexShrink: 0, padding: '0.35rem 0.75rem',
        background: active ? (color || 'var(--sepia)') : 'rgba(18,14,9,0.8)',
        border: `1px solid ${active ? (color || 'var(--sepia)') : 'rgba(139,105,20,0.22)'}`,
        color: active ? 'var(--ink)' : 'var(--bone)',
        fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase',
        borderRadius: '2px', cursor: 'pointer', whiteSpace: 'nowrap',
        transition: 'all 0.18s',
        boxShadow: active ? '0 2px 8px rgba(139,105,20,0.3)' : 'none',
    }}>
        {children}
    </button>
)

// ── FILTER PANEL COMPONENT ──
function FilterPanel({ filters, onChange, onClear, isSearching, style }: any) {
    const { genreId, decade, sortBy, language, minRating } = filters
    const hasFilters = genreId || decade || language || minRating > 0

    return (
        <div style={style}>
            {/* Genre row */}
            <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.6rem' }}>GENRE</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {GENRES.map((g: any) => (
                        <Chip key={g.id} active={genreId === g.id} onClick={() => onChange({ genreId: genreId === g.id ? null : g.id })}>{g.name}</Chip>
                    ))}
                </div>
            </div>

            {/* Decade row */}
            <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.6rem' }}>DECADE</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {DECADES.map((d: any) => (
                        <Chip key={d.label} active={decade?.label === d.label} onClick={() => onChange({ decade: decade?.label === d.label ? null : d })}>{d.label}</Chip>
                    ))}
                </div>
            </div>

            {/* Language row */}
            <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.6rem' }}>LANGUAGE</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {LANGUAGES.map((l: any) => (
                        <Chip key={l.iso} active={language === l.iso} onClick={() => onChange({ language: language === l.iso ? null : l.iso })}>{l.name}</Chip>
                    ))}
                </div>
            </div>

            {/* Sort + Rating row */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '0.5rem' }}>
                <div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>SORT BY</div>
                    <select value={sortBy} onChange={e => onChange({ sortBy: e.target.value })} style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.08em', background: 'var(--soot)', border: '1px solid var(--ash)', color: 'var(--parchment)', padding: '0.5rem 0.75rem', borderRadius: '2px', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', minWidth: 140 }}>
                        {SORT_OPTIONS.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>
                <div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>MIN RATING: {minRating > 0 ? `${minRating}+` : 'ANY'}</div>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                        {[0, 6, 7, 7.5, 8, 8.5].map((r: any) => (
                            <Chip key={r} active={minRating === r} onClick={() => onChange({ minRating: minRating === r ? 0 : r })}>
                                {r === 0 ? 'Any' : `${r}+`}
                            </Chip>
                        ))}
                    </div>
                </div>
                {hasFilters && (
                    <button onClick={onClear} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.75rem', background: 'transparent', border: '1px dashed rgba(180,60,60,0.5)', color: 'rgba(200,80,80,0.8)', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', borderRadius: '2px', cursor: 'pointer', marginBottom: 1 }}>
                        <X size={11} /> CLEAR ALL
                    </button>
                )}
            </div>
        </div>
    )
}

// Use a 3-col grid on mobile — more films visible without excessive swiping
const mobileGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.6rem',
}
const desktopGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
    gap: '1.25rem',
}

const FilmGrid = ({ films }: { films: any[] }) => {
    const { isTouch: IS_TOUCH } = useViewport()
    const { isAuthenticated } = useAuthStore()
    const logs = useFilmStore(s => s.logs)
    const watchlist = useFilmStore(s => s.watchlist)
    const addToWatchlist = useFilmStore(s => s.addToWatchlist)
    const removeFromWatchlist = useFilmStore(s => s.removeFromWatchlist)
    const openSignupModal = useUIStore(s => s.openSignupModal)
    const loggedFilmIds = new Set(logs.map((l: any) => l.filmId))
    const watchlistIds = new Set(watchlist.map((w: any) => w.filmId))
    return (
    <div style={IS_TOUCH ? mobileGridStyle : desktopGridStyle}>
        {films.map((item: any, idx: number) => {
            const isPerson = item.media_type === 'person'
            const isLogged = isAuthenticated && !isPerson && loggedFilmIds.has(item.id)
            const isSaved = isAuthenticated && !isPerson && watchlistIds.has(item.id)
            return (
                <Link
                    key={`${item.media_type || 'movie'}-${item.id}-${idx}`}
                    to={isPerson ? `/person/${item.id}` : `/film/${item.id}`}
                    style={{ display: 'block', textDecoration: 'none', position: 'relative' }}
                    className={IS_TOUCH ? '' : 'fade-in-up discover-poster-wrap'}
                >
                    {isPerson ? (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ width: '100%', aspectRatio: '1', borderRadius: '2px', overflow: 'hidden', border: '1px solid var(--ash)', background: 'var(--soot)', position: 'relative' }}>
                                {item.profile_path
                                    ? <img src={tmdb.profile(item.profile_path, 'w185') || undefined} alt={item.name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9 }} />
                                    : <PersonPlaceholder />}
                            </div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? '0.6rem' : '0.9rem', color: 'var(--parchment)', marginTop: '0.4rem', lineHeight: 1.2 }}>{item.name}</div>
                        </div>
                    ) : (
                        <>
                            <FilmCard film={item} showRating />
                            {isLogged && (
                                <div style={{
                                    position: 'absolute', top: 6, right: 6, zIndex: 5,
                                    width: 20, height: 20, borderRadius: '50%',
                                    background: 'rgba(139,105,20,0.9)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                                    border: '1px solid rgba(242,232,160,0.3)',
                                }} title="You've logged this film">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                </div>
                            )}
                            {/* Quick Save to Watchlist */}
                            {!isPerson && (
                                <button
                                    className="discover-quick-save"
                                    onClick={(e) => {
                                        e.preventDefault(); e.stopPropagation()
                                        if (!isAuthenticated) { openSignupModal(); return }
                                        if (isSaved) {
                                            removeFromWatchlist(item.id)
                                            reelToast.success('Removed from watchlist')
                                        } else {
                                            addToWatchlist({ id: item.id, title: item.title || item.name, poster_path: item.poster_path, release_date: item.release_date })
                                            reelToast.success('Saved to watchlist ✦')
                                        }
                                    }}
                                    title={isSaved ? 'Remove from watchlist' : 'Save to watchlist'}
                                    style={{
                                        position: 'absolute', top: 6, left: 6, zIndex: 6,
                                        width: 26, height: 26, borderRadius: '4px',
                                        background: isSaved ? 'rgba(139,105,20,0.95)' : 'rgba(10,7,3,0.85)',
                                        backdropFilter: 'blur(4px)',
                                        border: isSaved ? '1px solid rgba(242,232,160,0.4)' : '1px solid rgba(139,105,20,0.3)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', padding: 0,
                                        transition: 'all 0.2s ease',
                                        opacity: IS_TOUCH ? 1 : undefined,
                                    }}
                                >
                                    <Bookmark size={12} fill={isSaved ? 'var(--ink)' : 'none'} color={isSaved ? 'var(--ink)' : 'var(--sepia)'} strokeWidth={2} />
                                </button>
                            )}
                            {!IS_TOUCH && <div style={{ marginTop: '0.4rem' }}><ObscurityBadge score={obscurityScore(item)} /></div>}
                        </>
                    )}
                </Link>
            )
        })}
    </div>
    )
}

// ── MAIN PAGE ──
export default function DiscoverPage() {
    const { isTouch: IS_TOUCH } = useViewport()
    const [searchParams] = useSearchParams()

    const page = useDiscoverStore(s => s.page)
    const setPage = useDiscoverStore(s => s.setPage)
    const mood: any = useDiscoverStore(s => s.mood)
    const setMood = useDiscoverStore(s => s.setMood)
    const query = useDiscoverStore(s => s.query)
    const setQuery = useDiscoverStore(s => s.setQuery)
    const inputVal = useDiscoverStore(s => s.inputVal)
    const setInputVal = useDiscoverStore(s => s.setInputVal)
    const accumulatedFilms = useDiscoverStore(s => s.accumulatedFilms)
    const setAccumulatedFilms = useDiscoverStore(s => s.setAccumulatedFilms)
    const filters: any = useDiscoverStore(s => s.filters)
    const setFilters = useDiscoverStore(s => s.setFilters)
    const clearFilters = useDiscoverStore(s => s.clearFilters)
    const updateFilter = useDiscoverStore(s => s.updateFilter)
    const clearSearch = useDiscoverStore(s => s.clearSearch)

    const [suggestions, setSuggestions] = useState<any[]>([])
    const [showFilters, setShowFilters] = useState(false)

    const isSearching = !!query

    const hasActiveFilter = filters.genreId || filters.decade || filters.language || filters.minRating > 0
    const activeFilterCount = [filters.genreId, filters.decade, filters.language, filters.minRating > 0 ? 1 : null].filter(Boolean).length

    const initialRender = useRef(true)
    useEffect(() => {
        if (initialRender.current) { initialRender.current = false; return }
        setPage(1)
    }, [query, filters, mood, setPage])

    useEffect(() => {
        const raw = searchParams.get('q')
        if (raw) {
            // Sanitize: trim whitespace, cap at 100 chars to prevent TMDB API abuse
            const urlQ = raw.trim().slice(0, 100)
            if (urlQ && urlQ !== query) {
                setQuery(urlQ)
                setInputVal(urlQ)
            }
        }
    }, [searchParams])

    useEffect(() => {
        if (!inputVal.trim() || inputVal.length < 2) { setSuggestions([]); return }
        const id = setTimeout(async () => {
            try {
                const raw = await tmdb.searchMulti(inputVal.trim())
                setSuggestions(raw)
            } catch { }
        }, 200)
        return () => clearTimeout(id)
    }, [inputVal])

    const { data: searchResults, isLoading: searchLoading, isFetching: searchFetching } = useQuery({
        queryKey: ['search', query, page],
        queryFn: () => tmdb.search(query, page),
        enabled: !!query,
    })

    const { data: discoverResults, isLoading: discoverLoading, isFetching: discoverFetching } = useQuery({
        queryKey: ['discover', filters, mood?.label, page],
        queryFn: () => {
            const params: any = {
                sort_by: mood ? mood.sort : filters.sortBy,
                page,
                'vote_count.gte': mood?.voteGte ?? 20,
            }
            if (filters.genreId) params.with_genres = filters.genreId
            else if (mood) params.with_genres = mood.genre
            if (filters.decade) {
                params['primary_release_date.gte'] = filters.decade.from
                params['primary_release_date.lte'] = filters.decade.to
            }
            if (filters.language) params.with_original_language = filters.language
            if (filters.minRating > 0) params['vote_average.gte'] = filters.minRating
            return tmdb.discover(params)
        },
        enabled: !query,
    })

    const currentResults = isSearching ? searchResults : discoverResults
    const isLoading = (isSearching ? searchLoading : discoverLoading) && accumulatedFilms.length === 0
    const isFetching = isSearching ? searchFetching : discoverFetching

    useEffect(() => {
        if (currentResults?.results) {
            // Filter out films without posters — they render as ugly placeholders
            const withPosters = currentResults.results.filter((f: any) => f.poster_path || f.profile_path)
            if (page === 1) {
                setAccumulatedFilms(withPosters)
            } else {
                setAccumulatedFilms((prev: any[]) => {
                    const keys = new Set(prev.map((f: any) => `${f.media_type || 'movie'}-${f.id}`))
                    return [...prev, ...withPosters.filter((f: any) => !keys.has(`${f.media_type || 'movie'}-${f.id}`))]
                })
            }
        }
    }, [currentResults, page])

    const handleSearch = (e: any) => { e.preventDefault(); setQuery(inputVal); setSuggestions([]) }
    // clearSearch is imported from useDiscoverStore
    const selectMood = (m: any) => {
        if (!m) { setMood(null); clearFilters(); return }
        setMood(m); setFilters((prev: any) => ({ ...prev, genreId: m.genre })); clearSearch()
    }

    const sectionLabel = isSearching
        ? (searchResults?.searchType === 'person' ? `ARTIST DOSSIER: ${searchResults.matchedContext?.toUpperCase()}` : `ARCHIVE SEARCH: "${query.toUpperCase()}"`)
        : mood ? `MOOD: ${mood.label.toUpperCase()}` : 'THE ARCHIVE STACKS'
    const sectionTitle = isSearching
        ? `${searchResults?.total_results || accumulatedFilms.length || 0} Matches Found`
        : mood ? mood.sub : 'Discover Titles'

    return (
        <div style={{ paddingTop: 70, minHeight: '100dvh', background: 'var(--ink)' }}>
            {/* ── SEARCH HEADER ── */}
            <div style={{ background: 'var(--ink)', borderBottom: '1px solid var(--ash)', padding: IS_TOUCH ? '2rem 0 1.5rem' : '4rem 0 3rem', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', height: '100%', background: 'radial-gradient(ellipse at top, rgba(139,105,20,0.18) 0%, rgba(139,105,20,0.06) 40%, transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(139,105,20,0.35), transparent)', pointerEvents: 'none' }} />
                <div className="container" style={{ position: 'relative', zIndex: 1, maxWidth: 800, textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.4em', color: 'var(--sepia)', marginBottom: '0.75rem' }}>THE DARKROOM</div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? 'clamp(1.8rem, 7vw, 2.5rem)' : 'clamp(2.5rem, 6vw, 4.5rem)', color: 'var(--parchment)', marginBottom: IS_TOUCH ? '1.25rem' : '2.5rem', lineHeight: 1 }}>
                        Search the Archive
                    </h1>
                    <form onSubmit={handleSearch} style={{ position: 'relative' }}>
                        <Search size={IS_TOUCH ? 16 : 22} style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--sepia)', opacity: 0.8, zIndex: 1 }} />
                        <input
                            className="input"
                            style={{ width: '100%', padding: IS_TOUCH ? '0.9rem 2.5rem 0.9rem 3rem' : '1.4rem 3rem 1.4rem 4rem', fontSize: IS_TOUCH ? '1rem' : '1.2rem', fontFamily: 'var(--font-sub)', background: 'var(--soot)', borderColor: 'var(--ash)', color: 'var(--parchment)', borderRadius: 'var(--radius-card)', boxShadow: 'inset 0 4px 20px rgba(0,0,0,0.8)', outline: 'none', transition: 'border-color 0.3s', boxSizing: 'border-box' }}
                            placeholder="Film title, director, actor..."
                            value={inputVal}
                            onChange={e => setInputVal(e.target.value)}
                            onFocus={e => e.target.style.borderColor = 'var(--sepia)'}
                            onBlur={e => e.target.style.borderColor = 'var(--ash)'}
                            autoFocus
                        />
                        {query && (
                            <button type="button" onClick={clearSearch} style={{ position: 'absolute', right: '1.25rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer' }}>
                                <X size={18} />
                            </button>
                        )}
                        <AnimatePresence>
                            {suggestions.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                                    style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'rgba(10,7,3,0.98)', border: '1px solid var(--ash)', borderRadius: '0 0 var(--radius-card) var(--radius-card)', zIndex: 10000, marginTop: '2px', overflow: 'hidden' }}
                                >
                                    {suggestions.map((item: any) => {
                                        const isPerson = item.media_type === 'person'
                                        return (
                                            <Link key={`${item.media_type}-${item.id}`} to={isPerson ? `/person/${item.id}` : `/film/${item.id}`} onClick={() => setSuggestions([])}
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem', textDecoration: 'none', borderBottom: '1px solid rgba(139,105,20,0.05)' }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(242,232,160,0.04)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                {item.poster_path || item.profile_path ? (
                                                    <div style={{ width: isPerson ? 24 : 18, height: isPerson ? 24 : 28, flexShrink: 0, borderRadius: isPerson ? '50%' : '2px', overflow: 'hidden' }}>
                                                        {isPerson ? (
                                                            <Poster path={item.profile_path} title={item.name} aspectRatio="square" sizeHint="sm" />
                                                        ) : (
                                                            <Poster path={item.poster_path} title={item.title} sizeHint="sm" />
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div style={{ width: 18, height: 28, background: 'var(--ash)', flexShrink: 0, borderRadius: '2px' }} />
                                                )}
                                                <div style={{ flex: 1, overflow: 'hidden', textAlign: 'left' }}>
                                                    <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: 'var(--parchment)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isPerson ? item.name : item.title}</div>
                                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.05em' }}>{isPerson ? 'ARTIST' : `${item.release_date?.slice(0, 4) || 'TBA'} · FILM`}</div>
                                                </div>
                                            </Link>
                                        )
                                    })}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </form>
                </div>
            </div>

            <main style={{ padding: IS_TOUCH ? '1rem 0 6rem' : '3rem 0 6rem' }}>
                <div className="container">

                    {/* ── MOOD ORACLE ── */}
                    {!isSearching && (
                        <div style={{ marginBottom: IS_TOUCH ? '1rem' : '3rem' }}>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.3em', color: 'var(--sepia)', marginBottom: IS_TOUCH ? '0.6rem' : '1.25rem', textAlign: 'center' }}>✦ DEVELOP BY MOOD ✦</div>
                            {IS_TOUCH ? (
                                <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '0.5rem', marginLeft: '-1.25rem', marginRight: '-1.25rem', paddingLeft: '1.25rem', paddingRight: '1.25rem' }}>
                                    {MOODS.map((m: any) => {
                                        const active = mood?.label === m.label
                                        return (
                                            <button key={m.label} onClick={() => selectMood(active ? null : m)} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', background: active ? m.color : 'var(--soot)', border: `1px solid ${active ? m.accent : 'rgba(139,105,20,0.2)'}`, color: active ? 'var(--flicker)' : 'var(--bone)', borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 'clamp(0.55rem, 3vw, 0.65rem)', letterSpacing: '0.1em', transition: 'all 0.2s', boxShadow: active ? `0 0 10px ${m.accent}55` : 'none', maxWidth: '160px' }}>
                                                <span>{m.glyph}</span> 
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                                    {MOODS.map((m: any) => {
                                        const active = mood?.label === m.label
                                        return (
                                            <button key={m.label} onClick={() => selectMood(active ? null : m)}
                                                style={{
                                                    background: active ? m.color : `${m.color}cc`,
                                                    border: `1px solid ${active ? m.accent : `${m.accent}55`}`,
                                                    color: 'var(--parchment)',
                                                    padding: '1.75rem 0.75rem',
                                                    borderRadius: '2px',
                                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                                                    transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
                                                    cursor: 'pointer',
                                                    boxShadow: active ? `0 0 24px ${m.accent}66, inset 0 0 20px rgba(0,0,0,0.3)` : 'inset 0 0 20px rgba(0,0,0,0.3)',
                                                    transform: active ? 'scale(1.03)' : 'scale(1)',
                                                    position: 'relative', overflow: 'hidden',
                                                }}
                                                onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = m.accent; e.currentTarget.style.boxShadow = `0 0 12px ${m.accent}44, inset 0 0 20px rgba(0,0,0,0.3)` } }}
                                                onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = `${m.accent}55`; e.currentTarget.style.boxShadow = 'inset 0 0 20px rgba(0,0,0,0.3)' } }}
                                            >
                                                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)', pointerEvents: 'none' }} />
                                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', marginBottom: '0.6rem', filter: active ? `drop-shadow(0 0 8px ${m.accent})` : 'none', transition: 'filter 0.3s' }}>{m.glyph}</div>
                                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: active ? 'var(--flicker)' : 'var(--bone)' }}>{m.label}</div>
                                                {active && <div style={{ width: '20px', height: '1px', background: m.accent, marginTop: '0.5rem', boxShadow: `0 0 6px ${m.accent}` }} />}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── FILTER TOGGLE BAR ── */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => setShowFilters(f => !f)}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1rem', background: showFilters ? 'rgba(139,105,20,0.15)' : 'var(--soot)', border: `1px solid ${showFilters ? 'var(--sepia)' : 'var(--ash)'}`, color: showFilters ? 'var(--sepia)' : 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.12em', borderRadius: '2px', cursor: 'pointer', transition: 'all 0.2s' }}
                        >
                            <SlidersHorizontal size={13} />
                            {showFilters ? '[-] HIDE ARCHIVE FILTERS' : '[+] EXPAND ARCHIVE FILTERS'}
                            {activeFilterCount > 0 && (
                                <span style={{ background: 'var(--sepia)', color: 'var(--ink)', width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', fontWeight: 'bold' }}>{activeFilterCount}</span>
                            )}
                            <ChevronDown size={11} style={{ transform: showFilters ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
                        </button>

                        {/* Active filter summary pills */}
                        {filters.genreId && <span style={{ padding: '0.3rem 0.6rem', background: 'rgba(139,105,20,0.1)', border: '1px solid rgba(139,105,20,0.3)', color: 'var(--sepia)', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.08em', borderRadius: '2px' }}>{GENRES.find(g => g.id === filters.genreId)?.name || ''}</span>}
                        {filters.decade && <span style={{ padding: '0.3rem 0.6rem', background: 'rgba(139,105,20,0.1)', border: '1px solid rgba(139,105,20,0.3)', color: 'var(--sepia)', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.08em', borderRadius: '2px' }}>{filters.decade.label}</span>}
                        {filters.language && <span style={{ padding: '0.3rem 0.6rem', background: 'rgba(139,105,20,0.1)', border: '1px solid rgba(139,105,20,0.3)', color: 'var(--sepia)', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.08em', borderRadius: '2px' }}>{LANGUAGES.find(l => l.iso === filters.language)?.name}</span>}
                        {filters.minRating > 0 && <span style={{ padding: '0.3rem 0.6rem', background: 'rgba(139,105,20,0.1)', border: '1px solid rgba(139,105,20,0.3)', color: 'var(--sepia)', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.08em', borderRadius: '2px' }}>{filters.minRating}+</span>}

                        {hasActiveFilter && (
                            <button onClick={clearFilters} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.6rem', background: 'transparent', border: '1px dashed rgba(180,60,60,0.4)', color: 'rgba(200,80,80,0.7)', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.08em', borderRadius: '2px', cursor: 'pointer' }}>
                                <X size={10} /> CLEAR
                            </button>
                        )}

                        <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>
                            {accumulatedFilms.length > 0 && `${accumulatedFilms.length} TITLES`}
                        </div>
                    </div>

                    {/* ── COLLAPSIBLE FILTER PANEL ── */}
                    <AnimatePresence>
                        {showFilters && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: 'easeInOut' }}
                                style={{ overflow: 'hidden', marginBottom: '1.5rem' }}
                            >
                                <FilterPanel
                                    filters={filters}
                                    onChange={updateFilter}
                                    onClear={clearFilters}
                                    isSearching={isSearching}
                                    style={{ background: 'var(--soot)', border: '1px solid var(--ash)', borderRadius: '2px', padding: IS_TOUCH ? '1rem' : '1.5rem' }}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* ── SECTION HEADER ── */}
                    <SectionHeader label={String(sectionLabel)} title={sectionTitle} />

                    {/* ── FILM GRID ── */}
                    {isLoading && accumulatedFilms.length === 0 ? (
                        <LoadingReel />
                    ) : (
                        <>
                            {accumulatedFilms.length === 0 && !isFetching && (
                                <div style={{ padding: '3rem 1.5rem', textAlign: 'center', background: 'rgba(18,14,9,0.6)', border: '1px solid rgba(139,105,20,0.12)', borderLeft: '2px solid rgba(139,105,20,0.3)', borderRadius: '0 6px 6px 0', position: 'relative', overflow: 'hidden', maxWidth: 600, margin: '2rem auto' }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(139,105,20,0.25), transparent)' }} />
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.35em', color: 'var(--sepia)', opacity: 0.6, marginBottom: '0.75rem' }}>THE VAULT IS SEALED</div>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)', opacity: 0.65, marginBottom: '0.4rem' }}>No titles match your criteria.</div>
                                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--bone)', opacity: 0.45, fontStyle: 'italic' }}>Adjust the filters or clear your search to reopen the archive.</div>
                                </div>
                            )}
                            <FilmGrid films={accumulatedFilms} />

                            {accumulatedFilms.length > 0 && currentResults?.page < currentResults?.total_pages && (
                                <div style={{ marginTop: IS_TOUCH ? '2rem' : '4rem', textAlign: 'center' }}>
                                    <button
                                        onClick={() => setPage(page + 1)}
                                        disabled={isFetching}
                                        style={{ border: '1px solid rgba(139,105,20,0.7)', background: isFetching ? 'rgba(139,105,20,0.08)' : 'rgba(139,105,20,0.04)', color: isFetching ? 'var(--fog)' : 'var(--sepia)', padding: IS_TOUCH ? '0.9rem 2.5rem' : '1.1rem 3.5rem', fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.3em', textTransform: 'uppercase', cursor: isFetching ? 'default' : 'pointer', transition: 'all 0.3s', borderRadius: '2px', boxShadow: isFetching ? 'none' : '0 4px 20px rgba(139,105,20,0.2), 0 0 0 1px rgba(242,232,160,0.06)' }}
                                        onMouseEnter={e => { if (!isFetching) { e.currentTarget.style.background = 'var(--sepia)'; e.currentTarget.style.color = 'var(--ink)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(139,105,20,0.5)' } }}
                                        onMouseLeave={e => { if (!isFetching) { e.currentTarget.style.background = 'rgba(139,105,20,0.04)'; e.currentTarget.style.color = 'var(--sepia)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(139,105,20,0.2), 0 0 0 1px rgba(242,232,160,0.06)' } }}
                                    >
                                        {isFetching ? 'PULLING FOCUS...' : 'DEVELOP MORE FILMS'}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </main>
        </div>
    )
}
