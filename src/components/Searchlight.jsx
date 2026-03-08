import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Film, User, Compass, Star, BookOpen, Hash, ArrowRight } from 'lucide-react'
import { tmdb } from '../tmdb'

const QUICK_LINKS = [
    { id: 'lobby', label: 'The Lobby', path: '/', icon: Film },
    { id: 'discover', label: 'Dark Room', path: '/discover', icon: Compass },
    { id: 'feed', label: 'The Reel', path: '/feed', icon: BookOpen },
    { id: 'lists', label: 'The Stacks', path: '/lists', icon: Star },
    { id: 'profile', label: 'My Dossier', path: '/user/sajjadsaleel', icon: User },
]

export default function Searchlight() {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [results, setResults] = useState([])
    const [selectedIndex, setSelectedIndex] = useState(0)
    const navigate = useNavigate()

    useEffect(() => {
        const down = (e) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                setOpen((open) => !open)
            }
            if (e.key === 'Escape') setOpen(false)
        }
        document.addEventListener('keydown', down)
        return () => document.removeEventListener('keydown', down)
    }, [])

    useEffect(() => {
        if (!query) {
            setResults(QUICK_LINKS)
            return
        }

        const filteredLinks = QUICK_LINKS.filter(l =>
            l.label.toLowerCase().includes(query.toLowerCase())
        )

        const searchFilms = async () => {
            try {
                const data = await tmdb.search(query)
                const filmResults = (data.results || []).slice(0, 5).map(f => ({
                    id: f.id,
                    label: f.title,
                    path: `/film/${f.id}`,
                    icon: Film,
                    type: 'film',
                    year: f.release_date?.slice(0, 4)
                }))
                setResults([...filteredLinks, ...filmResults])
            } catch (err) {
                setResults(filteredLinks)
            }
        }

        const timer = setTimeout(searchFilms, 150)
        return () => clearTimeout(timer)
    }, [query])

    const handleSelect = useCallback((item) => {
        navigate(item.path)
        setOpen(false)
        setQuery('')
    }, [navigate])

    useEffect(() => {
        setSelectedIndex(0)
    }, [results])

    const onKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSelectedIndex((i) => (i + 1) % results.length)
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSelectedIndex((i) => (i - 1 + results.length) % results.length)
        } else if (e.key === 'Enter') {
            if (results[selectedIndex]) handleSelect(results[selectedIndex])
        }
    }

    return (
        <AnimatePresence>
            {open && (
                <div key="searchlight-overlay" style={{ position: 'fixed', inset: 0, zIndex: 100002, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '15vh', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setOpen(false)}
                        style={{ position: 'absolute', inset: 0, background: 'rgba(5,3,1,0.92)' }}
                    />

                    <motion.div
                        initial={{ opacity: 0, y: -20, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.98 }}
                        style={{
                            width: '100%',
                            maxWidth: '600px',
                            background: 'var(--soot)',
                            border: '1px solid var(--sepia)',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 20px rgba(139,105,20,0.2)',
                            position: 'relative',
                            zIndex: 1
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', padding: '1rem', borderBottom: '1px solid var(--ash)' }}>
                            <Search size={20} style={{ color: 'var(--sepia)', marginRight: '1rem' }} />
                            <input
                                autoFocus
                                placeholder="Searchlight: Jump to film or room..."
                                style={{
                                    flex: 1,
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--parchment)',
                                    fontFamily: 'var(--font-body)',
                                    fontSize: '1.1rem',
                                    outline: 'none'
                                }}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={onKeyDown}
                            />
                            <div style={{ padding: '2px 6px', border: '1px solid var(--ash)', borderRadius: '3px', fontSize: '0.6rem', color: 'var(--fog)', fontFamily: 'var(--font-ui)' }}>
                                ESC
                            </div>
                        </div>

                        <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '0.5rem' }}>
                            {results.length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--fog)', fontFamily: 'var(--font-sub)', fontSize: '0.9rem' }}>
                                    No records found in the archive.
                                </div>
                            ) : (
                                results.map((item, i) => (
                                    <div
                                        key={`${item.id}-${i}`}
                                        onClick={() => handleSelect(item)}
                                        onMouseEnter={() => setSelectedIndex(i)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            padding: '0.75rem 1rem',
                                            borderRadius: '2px',
                                            cursor: 'pointer',
                                            background: selectedIndex === i ? 'rgba(139,105,20,0.15)' : 'transparent',
                                            border: selectedIndex === i ? '1px solid rgba(139,105,20,0.3)' : '1px solid transparent',
                                            transition: 'all 0.1s'
                                        }}
                                    >
                                        <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ash)', borderRadius: '2px', marginRight: '1rem', color: selectedIndex === i ? 'var(--flicker)' : 'var(--fog)' }}>
                                            <item.icon size={16} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: selectedIndex === i ? 'var(--parchment)' : 'var(--bone)' }}>
                                                {item.label}
                                            </div>
                                            {item.year && (
                                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>
                                                    {item.year}
                                                </div>
                                            )}
                                        </div>
                                        {selectedIndex === i && (
                                            <ArrowRight size={14} style={{ color: 'var(--sepia)' }} />
                                        )}
                                    </div>
                                ))
                            )}
                        </div>

                        <div style={{ padding: '0.6rem 1rem', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid var(--ash)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <div style={{ padding: '2px 6px', background: 'var(--ash)', borderRadius: '3px', fontSize: '0.5rem', color: 'var(--parchment)' }}>↑↓</div>
                                    <span style={{ fontSize: '0.55rem', color: 'var(--fog)', fontFamily: 'var(--font-ui)' }}>Navigate</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <div style={{ padding: '2px 6px', background: 'var(--ash)', borderRadius: '3px', fontSize: '0.5rem', color: 'var(--parchment)' }}>ENTER</div>
                                    <span style={{ fontSize: '0.55rem', color: 'var(--fog)', fontFamily: 'var(--font-ui)' }}>Select</span>
                                </div>
                            </div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.55rem', color: 'var(--sepia)', letterSpacing: '0.2em' }}>
                                SEARCHLIGHT
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}
