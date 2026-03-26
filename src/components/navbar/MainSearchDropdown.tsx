import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Loader, User, Film } from 'lucide-react'
import { tmdb } from '../../tmdb'
import Poster from '../film/Poster'

export default function MainSearchDropdown({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const navigate = useNavigate()
    const [query, setQuery] = useState('')
    const [suggestions, setSuggestions] = useState<any[]>([])
    const [searching, setSearching] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 100)
        }
    }, [isOpen])

    useEffect(() => {
        if (!isOpen) { setQuery(''); setSuggestions([]) }
    }, [isOpen])

    useEffect(() => {
        if (!query.trim()) {
            setSuggestions([])
            setSearching(false)
            return
        }
        setSearching(true)
        const timer = setTimeout(async () => {
            try {
                const results = await tmdb.searchMulti(query)
                setSuggestions(results || [])
            } catch {
                setSuggestions([]) // Network failure — show empty results, fail silently
            } finally {
                setSearching(false)
            }
        }, 250)
        return () => clearTimeout(timer)
    }, [query])

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        if (query.trim() && suggestions.length > 0) {
            const match = suggestions[0]
            if (match.media_type === 'person') {
                navigate(`/discover?person=${match.id}`)
            } else {
                navigate(`/film/${match.id}`)
            }
            onClose()
        }
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="search-bar"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    style={{ flexDirection: 'column', gap: 0 }}
                >
                    <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
                        <Search size={16} style={{ color: 'var(--sepia)', alignSelf: 'center', flexShrink: 0 }} />
                        <input
                            ref={inputRef}
                            className="input"
                            placeholder="Search films, actors, directors..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            autoFocus
                        />
                        <button className="btn btn-primary" type="submit">Search</button>
                        <button type="button" className="nav-icon-btn" onClick={onClose}>
                            <X size={16} />
                        </button>
                    </form>

                    <AnimatePresence>
                        {(searching || suggestions.length > 0 || (query.trim() && !searching)) && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="glass-panel"
                                style={{ marginTop: '0.5rem', borderTop: '1px solid var(--sepia)', maxHeight: '400px', overflowY: 'auto', borderRadius: 'var(--radius-card)', width: '100%' }}
                            >
                                {searching && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem 1.25rem', color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em' }}>
                                        <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
                                        SCANNING ARCHIVES...
                                    </div>
                                )}
                                {!searching && suggestions.length === 0 && query.trim() && (
                                    <div style={{ padding: '1rem 1.25rem', color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em' }}>
                                        NO RESULTS FOUND IN THE ARCHIVE
                                    </div>
                                )}
                                {!searching && suggestions.map((item: any) => {
                                    const isPerson = item.media_type === 'person'
                                    const title = item.title || item.name || ''
                                    const year = item.release_date?.slice(0, 4)
                                    const imgPath = isPerson ? item.profile_path : item.poster_path
                                    const imgUrl = imgPath ? `https://image.tmdb.org/t/p/w92${imgPath}` : null
                                    const dept = isPerson ? (item.known_for_department || 'Acting').toUpperCase() : null

                                    return (
                                        <Link
                                            key={`${item.media_type}-${item.id}`}
                                            to={isPerson ? `/discover?person=${item.id}` : `/film/${item.id}`}
                                            onClick={onClose}
                                            style={{ display: 'flex', alignItems: 'center', padding: '0.65rem 1.5rem', gap: '1rem', textDecoration: 'none', borderBottom: '1px solid rgba(139,105,20,0.08)', transition: 'background 0.2s' }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(242,232,160,0.03)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <div style={{ width: isPerson ? 44 : 48, height: isPerson ? 44 : 68, borderRadius: isPerson ? '50%' : '3px', overflow: 'hidden', background: 'var(--ash)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: isPerson ? '2px solid rgba(139,105,20,0.4)' : '1px solid rgba(139,105,20,0.15)' }}>
                                                {imgPath ? (
                                                    <Poster path={imgPath} title={title} aspectRatio={isPerson ? 'square' : 'poster'} sizeHint="sm" />
                                                ) : (
                                                    isPerson ? <User size={20} color="var(--fog)" /> : <Film size={20} color="var(--fog)" />
                                                )}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.95rem', color: 'var(--parchment)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {title}
                                                </div>
                                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.12em', color: 'var(--sepia)', marginTop: '0.25rem' }}>
                                                    {isPerson ? `🎭 ${dept}` : `🎬 ${year || 'FILM'}`}
                                                </div>
                                            </div>
                                        </Link>
                                    )
                                })}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
