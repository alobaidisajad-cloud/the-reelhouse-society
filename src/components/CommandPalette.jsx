import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Popcorn, Search, Calendar, Star, Film, User, Hash } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { tmdb } from '../tmdb'
import { useUIStore, useSoundscape } from '../store'
import { PersonPlaceholder } from './UI'
import { useFocusTrap } from '../hooks/useFocusTrap'

export default function CommandPalette() {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [results, setResults] = useState([])
    const [searchType, setSearchType] = useState('exact')
    const [searchContext, setSearchContext] = useState('')
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [searching, setSearching] = useState(false)
    const inputRef = useRef(null)
    const searchTimeout = useRef(null)
    const navigate = useNavigate()
    const openLogModal = useUIStore(state => state.openLogModal)
    const playShutter = useSoundscape(state => state.playShutter)
    const focusTrapRef = useFocusTrap(open, () => setOpen(false))

    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault()
                setOpen(o => !o)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

    useEffect(() => {
        if (open) {
            setQuery('')
            setResults([])
            setSelectedIndex(0)
            setTimeout(() => inputRef.current?.focus(), 100)
            playShutter()
        }
    }, [open, playShutter])

    const handleSearch = (q) => {
        setQuery(q)
        setSelectedIndex(0)
        clearTimeout(searchTimeout.current)
        if (!q.trim()) { setResults([]); return }
        setSearching(true)
        searchTimeout.current = setTimeout(async () => {
            try {
                const data = await tmdb.search(q)
                setResults(data.results?.slice(0, 5) || [])
                setSearchType(data.searchType || 'exact')
                setSearchContext(data.matchedContext || '')
            } catch { setResults([]); setSearchType('exact') }
            finally { setSearching(false) }
        }, 300)
    }

    const executeAction = (item) => {
        setOpen(false)
        if (item.media_type === 'person') {
            navigate(`/person/${item.id}`)
        } else {
            navigate(`/film/${item.id}`)
        }
    }

    const logAction = (film, e) => {
        e.stopPropagation()
        setOpen(false)
        openLogModal(film)
    }

    useEffect(() => {
        if (!open) return
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') setOpen(false)
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedIndex(i => Math.min(i + 1, results.length - 1))
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedIndex(i => Math.max(i - 1, 0))
            }
            if (e.key === 'Enter' && results.length > 0) {
                e.preventDefault()
                executeAction(results[selectedIndex])
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [open, results, selectedIndex])

    if (!open) return null

    return (
        <AnimatePresence>
            <motion.div
                key="cmd-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setOpen(false)}
                style={{
                    position: 'fixed', inset: 0, zIndex: 99999,
                    background: 'rgba(5,3,1,0.92)',
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                    paddingTop: '15vh',
                    paddingLeft: '1rem',
                    paddingRight: '1rem',
                }}
                role="dialog"
                aria-modal="true"
                aria-label="Search the archive"
            >
                <motion.div
                    key="cmd-palette"
                    initial={{ opacity: 0, scale: 0.95, y: -20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -20 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        background: 'var(--ink)',
                        border: '1px solid var(--sepia)',
                        borderRadius: 'var(--radius-card)',
                        width: 'calc(100% - 2rem)',
                        maxWidth: 600,
                        boxShadow: '0 30px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(139,105,20,0.2)',
                        overflow: 'hidden',
                        display: 'flex', flexDirection: 'column'
                    }}
                >
                    {/* Search Input */}
                    <div style={{ display: 'flex', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid var(--ash)', background: 'var(--soot)' }}>
                        <Search size={22} style={{ color: 'var(--sepia)', marginRight: '1rem' }} />
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={(e) => handleSearch(e.target.value)}
                            placeholder="Find a film, log it, or press Esc to close..."
                            style={{
                                flex: 1, background: 'none', border: 'none', outline: 'none',
                                color: 'var(--parchment)', fontFamily: 'var(--font-body)', fontSize: '1.2rem',
                            }}
                        />
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--fog)', border: '1px solid var(--ash)', padding: '0.2rem 0.4rem', borderRadius: 4 }}>
                            ESC
                        </div>
                    </div>

                    {/* Results */}
                    {query && (
                        <div style={{ padding: '0.5rem', maxHeight: '50vh', overflowY: 'auto' }}>
                            {searching ? (
                                <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--sepia)', animation: 'pulse 1.5s infinite' }}>
                                    SEARCHING THE ARCHIVE...
                                </div>
                            ) : results.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    {searchType === 'person' && (
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--sepia)', letterSpacing: '0.1em', padding: '0.25rem 1rem' }}>✦ ACTOR/DIRECTOR MATCH: {searchContext.toUpperCase()}</div>
                                    )}
                                    {searchType === 'typo' && (
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--flicker)', letterSpacing: '0.1em', padding: '0.25rem 1rem' }}>✦ FUZZY RESCUE: {searchContext.toUpperCase()}</div>
                                    )}
                                    {searchType === 'semantic' && (
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--parchment)', letterSpacing: '0.1em', padding: '0.25rem 1rem' }}>✦ SEMANTIC MATCH: {searchContext.toUpperCase()}</div>
                                    )}
                                    {results.map((r, index) => {
                                        const isPerson = r.media_type === 'person'
                                        const selected = index === selectedIndex
                                        return (
                                            <div
                                                key={`${r.media_type || 'movie'}-${r.id}`}
                                                onMouseEnter={() => setSelectedIndex(index)}
                                                onClick={() => executeAction(r)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '1rem',
                                                    padding: '0.75rem 1rem', borderRadius: 'var(--radius-wobbly)',
                                                    background: selected ? 'rgba(139, 105, 20, 0.1)' : 'transparent',
                                                    borderLeft: `2px solid ${selected ? 'var(--sepia)' : 'transparent'}`,
                                                    cursor: 'pointer', transition: 'all 0.1s'
                                                }}
                                            >
                                                {isPerson ? (
                                                    r.profile_path ? (
                                                        <img src={tmdb.profile(r.profile_path, 'w185')} alt={r.name} style={{ width: 32, height: 48, objectFit: 'cover', borderRadius: '50%', filter: 'sepia(0.3)' }} />
                                                    ) : (
                                                        <div style={{ width: 32, height: 48, borderRadius: '50%', overflow: 'hidden' }}>
                                                            <PersonPlaceholder />
                                                        </div>
                                                    )
                                                ) : r.poster_path ? (
                                                    <img src={tmdb.poster(r.poster_path, 'w92')} alt={r.title} style={{ width: 32, height: 48, objectFit: 'cover', borderRadius: 2, filter: 'sepia(0.3)' }} />
                                                ) : (
                                                    <div style={{ width: 32, height: 48, background: 'var(--ash)', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <Film size={12} color="var(--fog)" />
                                                    </div>
                                                )}
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontFamily: 'var(--font-sub)', fontSize: '1rem', color: selected ? 'var(--flicker)' : 'var(--parchment)' }}>
                                                        {isPerson ? r.name : r.title}
                                                    </div>
                                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--fog)', marginTop: '0.2rem' }}>
                                                        {isPerson ? r.known_for_department?.toUpperCase() : `${r.release_date?.slice(0, 4)} · ${r.vote_average?.toFixed(1)} ★`}
                                                    </div>
                                                </div>
                                                {!isPerson && (
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <button
                                                            onClick={(e) => logAction(r, e)}
                                                            className="btn btn-ghost"
                                                            style={{ padding: '0.4rem 0.6rem', fontSize: '0.6rem', gap: '0.3em', opacity: selected ? 1 : 0.4 }}
                                                        >
                                                            <Popcorn size={12} /> LOG
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : (
                                <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--fog)', fontStyle: 'italic' }}>
                                    No records found in the archive.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Default state / Instructions */}
                    {!query && (
                        <div style={{ padding: '2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem', opacity: 0.6 }}>
                            <Film size={32} style={{ margin: '0 auto', color: 'var(--sepia)' }} />
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--parchment)', lineHeight: 1.6 }}>
                                <div>TYPE TO SEARCH THE STACKS.</div>
                                <div>USE ARROW KEYS TO NAVIGATE.</div>
                                <div>ENTER TO VIEW. CLICK LOG TO DOSSIER.</div>
                            </div>
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
