import { useState, useRef } from 'react'
import { Plus, Lock, Globe, Search as SearchIcon, X, Film } from 'lucide-react'
import { tmdb } from '../tmdb'
import toast from 'react-hot-toast'

import { useViewport } from '../hooks/useViewport'

export default function CreateListModal({ onClose, onCreate, initialList = null }: any) {
    const { isTouch: IS_TOUCH } = useViewport()
    const [title, setTitle] = useState(initialList?.title || '')
    const [desc, setDesc] = useState(initialList?.description || '')
    const [isPrivate, setIsPrivate] = useState(initialList?.isPrivate ?? false)
    const [submitting, setSubmitting] = useState(false)
    const [films, setFilms] = useState<any[]>(initialList?.films || [])
    
    // TMDB Search State
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<any[]>([])
    const [searching, setSearching] = useState(false)
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

    const searchTMDB = (q: string) => {
        setQuery(q)
        if (!q.trim()) { setResults([]); setSearching(false); return }
        setSearching(true)
        if (searchTimeout.current) clearTimeout(searchTimeout.current)
        searchTimeout.current = setTimeout(async () => {
            try {
                const res = await tmdb.search(q, 1)
                setResults((res.results || []).filter((r: any) => r.media_type === 'movie' || !r.media_type).slice(0, 5))
            } catch { setResults([]) }
            finally { setSearching(false) }
        }, 500)
    }

    const handleAddFilm = (film: any) => {
        if (films.find(f => f.id === film.id)) return // prevent duplicates
        setFilms([...films, { id: film.id, title: film.title || film.name, poster_path: film.poster_path }])
        setQuery('')
        setResults([])
    }

    const handleRemoveFilm = (filmId: number) => {
        setFilms(films.filter(f => f.id !== filmId))
    }

    const handleSave = async () => {
        if (!title.trim()) { toast.error('Give your list a name'); return }
        if (submitting) return
        setSubmitting(true)
        try {
            await onCreate({ 
                title: title.trim(), 
                description: desc.trim(), 
                isPrivate,
                films // pass films up so the parent can sequence adding them
            })
            toast.success(initialList ? 'List updated!' : `List "${title}" created!`)
            onClose()
        } catch (error) {
            toast.error(initialList ? 'Failed to update list.' : 'Failed to create list.')
            setSubmitting(false)
        }
    }

    return (
        <div
            className="fade-in"
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 10000,
                background: 'rgba(10,7,3,0.95)', display: 'flex', alignItems: IS_TOUCH ? 'flex-end' : 'center', justifyContent: 'center', padding: IS_TOUCH ? 0 : '1rem',
                backdropFilter: 'blur(8px)'
            }}
        >
            <div
                className="fade-in-up"
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: 'var(--ink)', border: IS_TOUCH ? 'none' : '1px solid rgba(139,105,20,0.3)',
                    borderTop: IS_TOUCH ? '1px solid rgba(139,105,20,0.3)' : '1px solid rgba(139,105,20,0.3)',
                    borderRadius: IS_TOUCH ? '12px 12px 0 0' : '6px', width: '100%', maxWidth: 460, 
                    padding: IS_TOUCH ? '1.5rem 1.25rem 2rem' : '2.5rem',
                    boxShadow: '0 -10px 40px rgba(0,0,0,0.8)',
                    position: 'relative', overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                    maxHeight: IS_TOUCH ? '90vh' : 'auto'
                }}
            >
                {IS_TOUCH && (
                    <div style={{ width: 40, height: 4, background: 'rgba(139,105,20,0.3)', borderRadius: 2, margin: '0 auto 1.5rem', opacity: 0.5 }} />
                )}
                {!IS_TOUCH && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, var(--sepia), transparent)' }} />
                )}
                
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.3em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>
                    NEW COLLECTION
                </div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', marginBottom: '1.25rem', color: 'var(--parchment)' }}>
                    {initialList ? 'Edit List' : 'Create a List'}
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', overflowY: 'auto', paddingRight: '0.2rem', paddingBottom: '1rem' }}>
                    <input className="input" placeholder="List title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus={!IS_TOUCH} />
                    
                    {/* ── FILM SEARCH HIGHER UP ── */}
                    <div style={{ background: 'rgba(28,23,16,0.5)', padding: '1rem', borderRadius: '4px', border: '1px solid rgba(139,105,20,0.15)' }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                            <span>ADD FILMS</span>
                            <span style={{ color: 'var(--fog)', opacity: 0.7 }}>{films.length} SELECTED</span>
                        </div>
                        <div style={{ position: 'relative', marginBottom: films.length > 0 ? '0.75rem' : 0 }}>
                            <SearchIcon size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--fog)', opacity: 0.7 }} />
                            <input 
                                className="input" 
                                placeholder="Search to add a film..." 
                                value={query} 
                                onChange={(e) => searchTMDB(e.target.value)}
                                style={{ paddingLeft: '2.25rem', paddingRight: '2rem', background: 'rgba(10,7,3,0.8)' }}
                            />
                            {query && (
                                <button type="button" onClick={() => { setQuery(''); setResults([]) }} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer' }}>
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        {/* Search Results Dropdown */}
                        {results.length > 0 && (
                            <div style={{ 
                                background: 'rgba(10,7,3,0.95)', border: '1px solid rgba(139,105,20,0.2)', 
                                borderRadius: '4px', marginTop: '0.5rem', marginBottom: '0.5rem', maxHeight: 180, overflowY: 'auto' 
                            }}>
                                {results.map(r => (
                                    <button
                                        key={r.id}
                                        onClick={(e) => { e.preventDefault(); handleAddFilm(r) }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
                                            padding: '0.5rem', background: 'transparent', border: 'none',
                                            borderBottom: '1px solid rgba(139,105,20,0.08)', cursor: 'pointer', textAlign: 'left'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,105,20,0.1)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        {r.poster_path ? (
                                            <img src={tmdb.poster(r.poster_path, 'w92')} alt={r.title} style={{ width: 24, height: 36, objectFit: 'cover', borderRadius: '2px' }} />
                                        ) : (
                                            <div style={{ width: 24, height: 36, background: 'var(--soot)', borderRadius: '2px' }} />
                                        )}
                                        <div style={{ flex: 1, fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: 'var(--bone)' }}>
                                            {r.title || r.name} <span style={{ opacity: 0.5 }}>{r.release_date?.slice(0, 4)}</span>
                                        </div>
                                        <Plus size={14} color="var(--sepia)" />
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Selected Films List */}
                        {films.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {films.map(f => (
                                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'rgba(10,7,3,0.6)', border: '1px solid rgba(139,105,20,0.2)', borderRadius: '4px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Film size={12} color="var(--fog)" />
                                            <span style={{ fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: 'var(--parchment)' }}>{f.title}</span>
                                        </div>
                                        <button onClick={(e) => { e.preventDefault(); handleRemoveFilm(f.id) }} style={{ background: 'none', border: 'none', color: 'var(--danger)', opacity: 0.7, cursor: 'pointer', padding: 0 }} onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}>
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <textarea className="input" placeholder="What's this list about? (Optional)" value={desc} onChange={(e) => setDesc(e.target.value)} style={{ minHeight: 60 }} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--bone)' }}>
                        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} style={{ accentColor: 'var(--sepia)' }} />
                        {isPrivate ? <><Lock size={12} /> PRIVATE LIST (HIDDEN FROM COMMUNITY)</> : <><Globe size={12} /> PUBLIC LIST (VISIBLE TO COMMUNITY)</>}
                    </label>

                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexShrink: 0, paddingBottom: IS_TOUCH ? '2rem' : '0' }}>
                        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', height: IS_TOUCH ? 48 : 'auto' }} onClick={handleSave} disabled={submitting}>
                            {submitting ? 'SAVING...' : (initialList ? 'SAVE CHANGES' : 'CREATE LIST')}
                        </button>
                        <button className="btn btn-ghost" style={{ height: IS_TOUCH ? 48 : 'auto' }} onClick={onClose}>Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    )
}
