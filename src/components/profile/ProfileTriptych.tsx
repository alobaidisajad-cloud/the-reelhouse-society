import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Search, Loader } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store'
import { tmdb } from '../../tmdb'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Portal } from '../UI'

interface TriptychFilm {
    id: number
    title: string
    poster_path: string
}

export function ProfileTriptych({ user, isOwnProfile }: { user: any, isOwnProfile: boolean }) {
    const { updateUser } = useAuthStore()
    const favorites = (user?.preferences?.favorites as TriptychFilm[]) || []
    
    // Always render 3 slots. Identify empty slots.
    const slots: Array<TriptychFilm | null> = [favorites[0] || null, favorites[1] || null, favorites[2] || null]

    const [isEditing, setIsEditing] = useState(false)
    const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const searchRef = useRef<NodeJS.Timeout>(null)

    // Debounced Search
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([])
            return
        }
        setIsSearching(true)
        if (searchRef.current) clearTimeout(searchRef.current)
        searchRef.current = setTimeout(async () => {
            try {
                const data = await tmdb.search(searchQuery)
                const movies = (data?.results || []).filter((r: any) => r.media_type === 'movie' && r.poster_path)
                setSearchResults(movies.slice(0, 10))
            } catch (err) {
                console.error(err)
            } finally {
                setIsSearching(false)
            }
        }, 400)
    }, [searchQuery])

    const handleSelectSlot = (index: number) => {
        if (!isOwnProfile) return
        setEditingSlotIndex(index)
        setIsEditing(true)
        setSearchQuery('')
        setSearchResults([])
    }

    const handleSetFilm = async (film: any) => {
        if (editingSlotIndex === null) return
        const newFavs = [...slots]
        newFavs[editingSlotIndex] = { id: film.id, title: film.title, poster_path: film.poster_path }
        
        // Compact the array to remove nulls in the middle, or just maintain exact index? 
        // Maintain exact index is better so users can have slot 1 and 3 filled but not 2.
        
        // Update local state and backend
        const currentPrefs = user?.preferences || {}
        const updatedPrefs = { ...currentPrefs, favorites: newFavs }
        
        updateUser({ preferences: updatedPrefs }) // optimistic
        setIsEditing(false)

        try {
            const { error } = await supabase.from('profiles').update({ preferences: updatedPrefs }).eq('id', user.id)
            if (error) throw error
            toast.success('Dossier updated.')
        } catch (error: any) {
            toast.error('Failed to update favorites.')
        }
    }

    const handleClearSlot = async (index: number, e: React.MouseEvent) => {
        e.stopPropagation()
        const newFavs = [...slots]
        newFavs[index] = null
        
        const currentPrefs = user?.preferences || {}
        const updatedPrefs = { ...currentPrefs, favorites: newFavs }
        
        updateUser({ preferences: updatedPrefs })

        try {
            await supabase.from('profiles').update({ preferences: updatedPrefs }).eq('id', user.id)
        } catch (error: any) {
            toast.error('Failed to clear slot.')
        }
    }

    const hasFavorites = slots.some(s => s !== null)

    if (!hasFavorites && !isOwnProfile) {
        return null // Hide entirely for other users if empty
    }

    return (
        <div className="profile-triptych-container" style={{ marginTop: '0', marginBottom: '0', flex: 1 }}>
            {/* The Triptych */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', maxWidth: 450, margin: '0 auto' }}>
                {slots.map((film, i) => (
                    <div 
                        key={i}
                        onClick={() => handleSelectSlot(i)}
                        style={{ 
                            position: 'relative', 
                            aspectRatio: '2/3', 
                            background: film ? 'var(--ink)' : 'transparent',
                            border: film ? '1px solid rgba(139,105,20,0.5)' : '1px dashed rgba(139,105,20,0.3)',
                            borderRadius: '6px',
                            cursor: isOwnProfile ? 'pointer' : 'default',
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                            boxShadow: film ? '0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(242,232,160,0.1)' : 'none',
                            transform: 'translateZ(0)',
                        }}
                        onMouseEnter={(e) => {
                            if (isOwnProfile || film) {
                                e.currentTarget.style.transform = 'translateY(-4px)'
                                e.currentTarget.style.boxShadow = film ? '0 15px 40px rgba(0,0,0,0.7), 0 0 20px rgba(139,105,20,0.2)' : '0 8px 20px rgba(0,0,0,0.3)'
                                e.currentTarget.style.borderColor = film ? 'var(--sepia)' : 'rgba(139,105,20,0.6)'
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)'
                            e.currentTarget.style.boxShadow = film ? '0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(242,232,160,0.1)' : 'none'
                            e.currentTarget.style.borderColor = film ? 'rgba(139,105,20,0.5)' : '1px dashed rgba(139,105,20,0.3)'
                        }}
                    >
                        {film ? (
                            <>
                                <img 
                                    src={`https://image.tmdb.org/t/p/w342${film.poster_path}`} 
                                    alt={film.title}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9 }}
                                    draggable={false}
                                />
                                {isOwnProfile && (
                                    <div className="triptych-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s' }}>
                                        <button onClick={(e) => handleClearSlot(i, e)} className="btn btn-ghost" style={{ width: 40, height: 40, padding: 0, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', color: 'var(--parchment)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', boxShadow: '0 4px 15px rgba(0,0,0,0.5)' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,50,50,0.8)'; e.currentTarget.style.borderColor = 'rgba(255,100,100,0.8)'; e.currentTarget.style.transform = 'scale(1.1)' }} onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.5)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.transform = 'scale(1)' }}>
                                            <X size={18} />
                                        </button>
                                    </div>
                                )}
                            </>
                        ) : (
                            isOwnProfile && <Plus size={24} color="var(--sepia)" style={{ opacity: 0.5 }} />
                        )}
                    </div>
                ))}
            </div>
            
            <style>{`
                .triptych-overlay { opacity: 0; }
                div:hover > .triptych-overlay { opacity: 1; }
            `}</style>

            {/* Selection Modal */}
            <Portal>
                <AnimatePresence>
                    {isEditing && (
                        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                            <motion.div 
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                style={{ position: 'absolute', inset: 0, background: 'rgba(8, 6, 4, 0.95)', backdropFilter: 'blur(20px)' }}
                                onClick={() => setIsEditing(false)}
                            />
                            <motion.div 
                                initial={{ opacity: 0, y: 40, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 30, scale: 0.95 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            style={{ position: 'relative', width: '100%', maxWidth: 500, background: 'linear-gradient(180deg, rgba(30,22,15,0.95) 0%, rgba(15,10,5,0.98) 100%)', border: '1px solid rgba(139,105,20,0.2)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '85vh', boxShadow: '0 25px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(242,232,160,0.1)' }}
                        >
                            <div style={{ padding: '2rem 2rem 1.5rem', borderBottom: '1px solid rgba(139,105,20,0.1)', position: 'relative' }}>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.3em', color: 'var(--sepia)', marginBottom: '1rem', textAlign: 'center' }}>
                                    CURATE DOSSIER SLOT {editingSlotIndex !== null ? editingSlotIndex + 1 : ''}
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <Search size={18} color="var(--sepia)" style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)' }} />
                                    <input 
                                        autoFocus
                                        placeholder="Search cinematic archives..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        style={{ width: '100%', padding: '1.2rem 1.2rem 1.2rem 3.5rem', background: 'rgba(10,5,0,0.5)', border: '1px solid rgba(139,105,20,0.15)', borderRadius: '8px', color: 'var(--parchment)', fontFamily: 'var(--font-display)', fontSize: '1.4rem', transition: 'border-color 0.2s', outline: 'none', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)' }}
                                        onFocus={e => e.currentTarget.style.borderColor = 'var(--sepia)'}
                                        onBlur={e => e.currentTarget.style.borderColor = 'rgba(139,105,20,0.15)'}
                                    />
                                </div>
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {isSearching ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><Loader size={24} color="var(--sepia)" className="spin" /></div>
                                ) : searchResults.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {searchResults.map(film => (
                                            <div 
                                                key={film.id}
                                                onClick={() => handleSetFilm(film)}
                                                style={{ display: 'flex', gap: '1.25rem', padding: '1rem', border: '1px solid rgba(139,105,20,0.1)', background: 'rgba(20,15,10,0.5)', borderRadius: '8px', cursor: 'pointer', alignItems: 'center', transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
                                                onMouseEnter={e => {
                                                    e.currentTarget.style.borderColor = 'var(--sepia)';
                                                    e.currentTarget.style.background = 'rgba(139,105,20,0.05)';
                                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                                    e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.4)';
                                                }}
                                                onMouseLeave={e => {
                                                    e.currentTarget.style.borderColor = 'rgba(139,105,20,0.1)';
                                                    e.currentTarget.style.background = 'rgba(20,15,10,0.5)';
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                    e.currentTarget.style.boxShadow = 'none';
                                                }}
                                            >
                                                {film.poster_path ? (
                                                    <img src={tmdb.poster(film.poster_path, 'w92')} alt={film.title} style={{ width: 48, height: 72, objectFit: 'cover', borderRadius: '4px', filter: 'sepia(0.2) contrast(1.1)', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }} />
                                                ) : (
                                                    <div style={{ width: 48, height: 72, background: 'var(--ink)', border: '1px solid var(--ash)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ash)' }}>
                                                        <Search size={16} />
                                                    </div>
                                                )}
                                                <div>
                                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--parchment)', marginBottom: '0.2rem', lineHeight: 1.2 }}>{film.title}</div>
                                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)' }}>{film.release_date?.slice(0,4)}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : searchQuery ? (
                                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.7rem' }}>NO MATCHES FOUND</div>
                                ) : null}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            </Portal>
        </div>
    )
}
