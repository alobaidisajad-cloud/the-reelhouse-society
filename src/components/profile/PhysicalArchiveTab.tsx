import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Plus, X, Disc, Disc2, Disc3, Film, Archive, Trash2, CircleDot, Clapperboard, Box, Award, Check } from 'lucide-react'
import { useFilmStore } from '../../stores/films'
import { tmdb } from '../../tmdb'
import Poster from '../film/Poster'
import { FilmCard } from '../UI'
import { Link } from 'react-router-dom'
import { useViewport } from '../../hooks/useViewport'
import reelToast from '../../utils/reelToast'
import type { PhysicalArchiveItem } from '../../types'

const FORMATS = [
    { id: '4k', label: '4K UHD', color: '#a855f7' },
    { id: 'bluray', label: 'Blu-ray', color: '#3b82f6' },
    { id: 'dvd', label: 'DVD', color: '#f59e0b' },
    { id: 'vhs', label: 'VHS', color: '#ef4444' },
    { id: 'laserdisc', label: 'LaserDisc', color: '#10b981' },
    { id: 'steelbook', label: 'Steelbook', color: '#6366f1' },
    { id: 'criterion', label: 'Criterion', color: 'var(--sepia)' },
]

/** Returns a meaningful Lucide icon for each physical media format */
function FormatIcon({ id, size = 13 }: { id: string; size?: number }) {
    const props = { size, strokeWidth: 2.2 }
    switch (id) {
        case '4k':        return <Disc3 {...props} />       // premium disc
        case 'bluray':    return <Disc {...props} />         // standard disc
        case 'dvd':       return <CircleDot {...props} />    // simple disc
        case 'vhs':       return <Clapperboard {...props} /> // retro / analog
        case 'laserdisc': return <Disc2 {...props} />        // vintage disc
        case 'steelbook': return <Box {...props} />          // metal case
        case 'criterion': return <Award {...props} />        // collector's edition
        default:          return <Disc {...props} />
    }
}

const CONDITIONS = [
    { id: 'mint', label: 'Mint', color: '#10b981' },
    { id: 'good', label: 'Good', color: '#3b82f6' },
    { id: 'fair', label: 'Fair', color: '#f59e0b' },
    { id: 'poor', label: 'Poor', color: '#ef4444' },
]

interface Props {
    isOwnProfile: boolean
    archive: PhysicalArchiveItem[]
    userId?: string
    userRole?: string
}

export default function PhysicalArchiveTab({ isOwnProfile, archive, userId, userRole }: Props) {
    const isArchivist = userRole === 'archivist'
    const isAuteur = userRole === 'auteur'
    const { isTouch: IS_TOUCH } = useViewport()
    const { addToPhysicalArchive, removeFromPhysicalArchive, updatePhysicalArchiveItem, fetchPhysicalArchive } = useFilmStore()
    
    const [searchOpen, setSearchOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<any[]>([])
    const [searching, setSearching] = useState(false)
    const [selectedFilm, setSelectedFilm] = useState<any | null>(null)
    const [selectedFormats, setSelectedFormats] = useState<string[]>([])
    const [notes, setNotes] = useState('')
    const [condition, setCondition] = useState('good')
    const [editingId, setEditingId] = useState<number | null>(null)
    const [filterFormat, setFilterFormat] = useState<string | null>(null)
    const [externalArchive, setExternalArchive] = useState<PhysicalArchiveItem[]>([])

    // For viewing other users' archives
    useEffect(() => {
        if (!isOwnProfile && userId) {
            fetchPhysicalArchive(userId).then(items => setExternalArchive(items))
        }
    }, [userId, isOwnProfile])

    const displayArchive = isOwnProfile ? archive : externalArchive

    // Search TMDB
    useEffect(() => {
        if (!query.trim()) { setResults([]); return }
        setSearching(true)
        const timer = setTimeout(async () => {
            try {
                const data = await tmdb.searchMulti(query)
                setResults((data || []).filter((r: any) => r.media_type !== 'person').slice(0, 8))
            } catch { setResults([]) }
            finally { setSearching(false) }
        }, 400)
        return () => clearTimeout(timer)
    }, [query])

    const toggleFormat = (id: string) => {
        setSelectedFormats(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id])
    }

    const handleAdd = async () => {
        if (!selectedFilm || selectedFormats.length === 0) {
            reelToast.error('Select at least one format.')
            return
        }
        try {
            await addToPhysicalArchive(selectedFilm, selectedFormats, notes, condition)
            reelToast.success(`"${selectedFilm.title || selectedFilm.name}" added to your archive ✦`)
            resetForm()
        } catch {
            reelToast.error('Failed to add to archive')
        }
    }

    const handleUpdate = async (filmId: number) => {
        try {
            await updatePhysicalArchiveItem(filmId, { formats: selectedFormats, notes, condition })
            reelToast.success('Archive entry updated ✦')
            setEditingId(null)
            resetForm()
        } catch {
            reelToast.error('Failed to update archive entry')
        }
    }

    const handleRemove = async (filmId: number, title: string) => {
        try {
            await removeFromPhysicalArchive(filmId)
            reelToast.success(`"${title}" removed from archive`)
        } catch {
            reelToast.error('Failed to remove from archive')
        }
    }

    const resetForm = () => {
        setSelectedFilm(null)
        setSelectedFormats([])
        setNotes('')
        setCondition('good')
        setQuery('')
        setResults([])
        setSearchOpen(false)
        setEditingId(null)
    }

    const startEdit = (item: PhysicalArchiveItem) => {
        setSelectedFilm({ id: item.filmId, title: item.title, poster_path: item.poster_path, release_date: item.year?.toString() })
        setEditingId(item.filmId)
        setSelectedFormats([...item.formats])
        setNotes(item.notes || '')
        setCondition(item.condition || 'good')
        setSearchOpen(true)
    }

    const filteredArchive = filterFormat
        ? displayArchive.filter(item => item.formats.includes(filterFormat))
        : displayArchive

    const formatCounts = FORMATS.map(f => ({
        ...f,
        count: displayArchive.filter(item => item.formats.includes(f.id)).length,
    })).filter(f => f.count > 0)

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.3rem' }}>
                        THE PHYSICAL ARCHIVE
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)' }}>
                        {displayArchive.length} {displayArchive.length === 1 ? 'Title' : 'Titles'} Catalogued
                    </div>
                </div>
                {isOwnProfile && (
                    <button
                        className="btn btn-primary"
                        onClick={() => setSearchOpen(true)}
                        style={{ fontSize: '0.6rem', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <Plus size={14} /> ADD TO ARCHIVE
                    </button>
                )}
            </div>

            {/* Format Filter Chips */}
            {formatCounts.length > 0 && (
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                    <button
                        onClick={() => setFilterFormat(null)}
                        style={{
                            fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.12em',
                            padding: '0.35rem 0.7rem', borderRadius: '2px', cursor: 'pointer',
                            border: `1px solid ${!filterFormat ? 'var(--sepia)' : 'var(--ash)'}`,
                            background: !filterFormat ? 'rgba(139,105,20,0.15)' : 'transparent',
                            color: !filterFormat ? 'var(--flicker)' : 'var(--fog)',
                            transition: 'all 0.2s',
                        }}
                    >
                        ALL ({displayArchive.length})
                    </button>
                    {formatCounts.map(f => (
                        <button
                            key={f.id}
                            onClick={() => setFilterFormat(filterFormat === f.id ? null : f.id)}
                            style={{
                                fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.12em',
                                padding: '0.35rem 0.7rem', borderRadius: '2px', cursor: 'pointer',
                                border: `1px solid ${filterFormat === f.id ? f.color : 'var(--ash)'}`,
                                background: filterFormat === f.id ? `${f.color}22` : 'transparent',
                                color: filterFormat === f.id ? f.color : 'var(--fog)',
                                transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '0.3rem',
                            }}
                        >
                            <FormatIcon id={f.id} /> {f.label} ({f.count})
                        </button>
                    ))}
                </div>
            )}

            {/* Add Film Modal */}
            <AnimatePresence>
                {searchOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(10,7,3,0.92)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                        onClick={(e) => e.target === e.currentTarget && resetForm()}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.95 }}
                            style={{
                                background: 'linear-gradient(180deg, rgba(28,22,14,1) 0%, rgba(18,14,8,1) 100%)',
                                border: '1px solid rgba(139,105,20,0.35)', borderRadius: '12px',
                                width: 'calc(100% - 2rem)', maxWidth: 520, maxHeight: 'calc(100dvh - 2rem)',
                                overflow: 'auto', padding: '2rem', position: 'relative',
                            }}
                        >
                            <button onClick={resetForm} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer' }}>
                                <X size={20} />
                            </button>

                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.3rem' }}>
                                {editingId !== null ? 'EDIT ARCHIVE ENTRY' : 'ADD TO YOUR COLLECTION'}
                            </div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--parchment)', marginBottom: '1.5rem' }}>
                                {selectedFilm ? (selectedFilm.title || selectedFilm.name) : 'Search for a Film'}
                            </div>

                            {!selectedFilm ? (
                                <>
                                    {/* Search */}
                                    <div style={{ position: 'relative', marginBottom: '1rem' }}>
                                        <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--sepia)' }} />
                                        <input
                                            className="input"
                                            placeholder="Search films..."
                                            value={query}
                                            onChange={e => setQuery(e.target.value)}
                                            autoFocus
                                            style={{ paddingLeft: '2.25rem' }}
                                        />
                                    </div>

                                    {/* Results */}
                                    {(searching || results.length > 0) && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: 300, overflow: 'auto' }}>
                                            {searching && <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)', padding: '1rem', textAlign: 'center' }}>SEARCHING...</div>}
                                            {results.map((film: any) => (
                                                <button
                                                    key={film.id}
                                                    onClick={() => { setSelectedFilm(film); setQuery(''); setResults([]) }}
                                                    style={{
                                                        display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.6rem 0.5rem',
                                                        background: 'none', border: 'none', borderBottom: '1px solid rgba(139,105,20,0.1)',
                                                        color: 'var(--parchment)', cursor: 'pointer', textAlign: 'left', width: '100%',
                                                        transition: 'background 0.15s',
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,105,20,0.06)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                                >
                                                    {film.poster_path ? (
                                                        <div style={{ width: 36, height: 54, flexShrink: 0, borderRadius: '2px', overflow: 'hidden', border: '1px solid var(--ash)' }}>
                                                            <Poster path={film.poster_path} title={film.title || film.name} sizeHint="sm" />
                                                        </div>
                                                    ) : (
                                                        <div style={{ width: 36, height: 54, background: 'var(--soot)', border: '1px solid var(--ash)', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <Film size={14} color="var(--fog)" />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem' }}>{film.title || film.name}</div>
                                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>
                                                            {film.release_date ? new Date(film.release_date).getFullYear() : '—'}
                                                        </div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    {/* Film Selected — Format Picker */}
                                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                                        {selectedFilm.poster_path && (
                                            <div style={{ width: 80, height: 120, flexShrink: 0, borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--ash)' }}>
                                                <Poster path={selectedFilm.poster_path} title={selectedFilm.title || selectedFilm.name} sizeHint="sm" />
                                            </div>
                                        )}
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)', letterSpacing: '0.1em', alignSelf: 'flex-end' }}>
                                            {selectedFilm.release_date ? new Date(selectedFilm.release_date).getFullYear() : '—'}
                                            <br />
                                            {editingId === null && (
                                                <button onClick={() => setSelectedFilm(null)} style={{ background: 'none', border: 'none', color: 'var(--sepia)', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', padding: 0, marginTop: '0.25rem' }}>
                                                    ← CHANGE FILM
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Format Selection */}
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>
                                        SELECT FORMATS
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.25rem' }}>
                                        {FORMATS.map(f => (
                                            <button
                                                key={f.id}
                                                onClick={() => toggleFormat(f.id)}
                                                style={{
                                                    fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em',
                                                    padding: '0.5rem 0.75rem', borderRadius: '3px', cursor: 'pointer',
                                                    border: `1px solid ${selectedFormats.includes(f.id) ? f.color : 'var(--ash)'}`,
                                                    background: selectedFormats.includes(f.id) ? `${f.color}22` : 'transparent',
                                                    color: selectedFormats.includes(f.id) ? f.color : 'var(--fog)',
                                                    transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '0.3rem',
                                                }}
                                            >
                                                <FormatIcon id={f.id} /> {f.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Condition */}
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>
                                        CONDITION
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem' }}>
                                        {CONDITIONS.map(c => (
                                            <button
                                                key={c.id}
                                                onClick={() => setCondition(c.id)}
                                                style={{
                                                    fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em',
                                                    padding: '0.4rem 0.7rem', borderRadius: '3px', cursor: 'pointer',
                                                    border: `1px solid ${condition === c.id ? c.color : 'var(--ash)'}`,
                                                    background: condition === c.id ? `${c.color}22` : 'transparent',
                                                    color: condition === c.id ? c.color : 'var(--fog)',
                                                    transition: 'all 0.15s',
                                                }}
                                            >
                                                {c.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Notes */}
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>
                                        NOTES (OPTIONAL)
                                    </div>
                                    <textarea
                                        className="input"
                                        placeholder="Edition, pressing, special features..."
                                        value={notes}
                                        onChange={e => setNotes(e.target.value)}
                                        rows={2}
                                        style={{ resize: 'vertical', marginBottom: '1.25rem', fontSize: '0.85rem' }}
                                    />

                                    <button
                                        className="btn btn-primary"
                                        onClick={() => editingId !== null ? handleUpdate(editingId) : handleAdd()}
                                        disabled={selectedFormats.length === 0}
                                        style={{ width: '100%', justifyContent: 'center', padding: '0.8rem', opacity: selectedFormats.length === 0 ? 0.5 : 1 }}
                                    >
                                        <Archive size={14} /> {editingId !== null ? 'SAVE CHANGES' : 'ADD TO COLLECTION'}
                                    </button>
                                </>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Archive Grid */}
            {filteredArchive.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem 1.5rem', borderRadius: '8px', border: '1px dashed var(--ash)' }}>
                    <Archive size={40} color="var(--sepia)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--parchment)', marginBottom: '0.5rem' }}>
                        {isOwnProfile ? 'No Physical Media Yet' : 'No Physical Media Catalogued'}
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--fog)', lineHeight: 1.6 }}>
                        {isOwnProfile ? 'Track your 4K, Blu-ray, DVD, VHS, and LaserDisc collection.' : 'This user hasn\'t catalogued any physical media yet.'}
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
                    {(() => {
                        const grouped = filteredArchive.reduce((acc: any, item: any) => {
                            const d = item.created_at || item.createdAt ? new Date(item.created_at || item.createdAt) : null
                            const title = d ? d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase() : 'UNDATED ARCHIVE'
                            if (!acc[title]) acc[title] = []
                            acc[title].push(item)
                            return acc
                        }, {})

                        return Object.keys(grouped).map(month => (
                            <div key={month}>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1rem', borderBottom: '1px solid rgba(139,105,20,0.1)', paddingBottom: '0.5rem' }}>
                                    {month}
                                </div>
                                <div className="profile-log-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: IS_TOUCH ? '0.2rem' : '0.75rem' }}>
                                    {grouped[month].map((item: any) => (
                                        <div key={item.filmId} className={isArchivist ? 'archivist-card-glow' : isAuteur ? 'auteur-card-glow' : ''} style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                                            <Link to={`/film/${item.filmId}`} style={{ display: 'block', position: 'relative' }}>
                                                <FilmCard film={{ id: item.filmId, title: item.title, poster_path: item.poster_path, release_date: item.year ? item.year.toString() : '' } as any} />
                                                
                                                <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: '0.2rem', pointerEvents: 'none', flexDirection: 'column' }}>
                                                    {item.formats.slice(0, 3).map((fId: string) => {
                                                        const fmt = FORMATS.find(f => f.id === fId)
                                                        return fmt ? (
                                                            <div key={fId} style={{ background: 'rgba(10,5,0,0.85)', backdropFilter: 'blur(4px)', border: `1px solid ${fmt.color}aa`, borderRadius: '3px', padding: '0.15rem 0.35rem', color: fmt.color, boxShadow: '0 2px 5px rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center' }}>
                                                                <FormatIcon id={fId} size={11} />
                                                            </div>
                                                        ) : null
                                                    })}
                                                </div>
                                            </Link>
                                            
                                            {isOwnProfile && (
                                                <div style={{ display: 'flex', marginTop: '0.4rem', gap: '0.35rem' }}>
                                                    <button onClick={() => startEdit(item)} style={{ flex: 1, padding: '0.35rem', fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em', color: 'var(--fog)', background: 'var(--soot)', border: '1px solid rgba(139,105,20,0.15)', borderRadius: '2px', cursor: 'pointer', transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,105,20,0.2)'; e.currentTarget.style.color = 'var(--sepia)' }} onMouseLeave={e => { e.currentTarget.style.background = 'var(--soot)'; e.currentTarget.style.color = 'var(--fog)' }}>
                                                        EDIT
                                                    </button>
                                                    <button onClick={() => handleRemove(item.filmId, item.title)} style={{ flex: 1, padding: '0.35rem', fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em', color: 'var(--fog)', background: 'var(--soot)', border: '1px solid rgba(139,105,20,0.15)', borderRadius: '2px', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', justifyContent: 'center', alignItems: 'center' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,30,30,0.2)'; e.currentTarget.style.color = 'var(--blood-reel)' }} onMouseLeave={e => { e.currentTarget.style.background = 'var(--soot)'; e.currentTarget.style.color = 'var(--fog)' }}>
                                                        <Trash2 size={10} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    })()}
                </div>
            )}
        </div>
    )
}
