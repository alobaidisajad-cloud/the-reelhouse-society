import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Search, Loader } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store'
import { tmdb } from '../../tmdb'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'

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
                const results = await tmdb.search(searchQuery)
                setSearchResults(results.slice(0, 10))
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
        <div style={{ marginTop: '1.5rem', marginBottom: '2rem' }}>
            {/* The Triptych */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', maxWidth: 450, margin: '0 auto' }}>
                {slots.map((film, i) => (
                    <div 
                        key={i}
                        onClick={() => handleSelectSlot(i)}
                        style={{ 
                            position: 'relative', 
                            aspectRatio: '2/3', 
                            background: film ? 'var(--soot)' : 'rgba(139,105,20,0.05)',
                            border: film ? '1px solid var(--sepia)' : '1px dashed rgba(139,105,20,0.3)',
                            borderRadius: '4px',
                            cursor: isOwnProfile ? 'pointer' : 'default',
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s',
                            boxShadow: film ? '0 0 20px rgba(139,105,20,0.1)' : 'none'
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
                                        <button onClick={(e) => handleClearSlot(i, e)} className="btn btn-ghost" style={{ padding: '0.4rem', border: 'none', background: 'rgba(255,0,0,0.2)', color: 'var(--blood-reel)', borderRadius: '50%' }}>
                                            <X size={16} />
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
            <AnimatePresence>
                {isEditing && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            style={{ position: 'absolute', inset: 0, background: 'rgba(10, 7, 3, 0.9)', backdropFilter: 'blur(10px)' }}
                            onClick={() => setIsEditing(false)}
                        />
                        <motion.div 
                            initial={{ opacity: 0, y: 30, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.95 }}
                            style={{ position: 'relative', width: '100%', maxWidth: 500, background: 'var(--ink)', border: '1px solid var(--sepia)', borderRadius: '4px', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '80vh', boxShadow: '0 0 60px rgba(139,105,20,0.2)' }}
                        >
                            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--soot)', position: 'relative' }}>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.75rem' }}>TRIPTYCH SLOT {editingSlotIndex !== null ? editingSlotIndex + 1 : ''}</div>
                                <div style={{ position: 'relative' }}>
                                    <Search size={16} color="var(--fog)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                                    <input 
                                        autoFocus
                                        placeholder="Search the archives..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        style={{ width: '100%', padding: '1rem 1rem 1rem 3rem', background: 'var(--soot)', border: '1px solid var(--ash)', borderRadius: '4px', color: 'var(--bone)', fontFamily: 'var(--font-display)', fontSize: '1.2rem' }}
                                    />
                                </div>
                                <button onClick={() => setIsEditing(false)} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer' }}><X size={20} /></button>
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                                {isSearching ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><Loader size={24} color="var(--sepia)" className="spin" /></div>
                                ) : searchResults.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {searchResults.map(film => (
                                            <div 
                                                key={film.id}
                                                onClick={() => handleSetFilm(film)}
                                                style={{ display: 'flex', gap: '1rem', padding: '0.75rem', border: '1px solid var(--ash)', background: 'var(--soot)', borderRadius: '4px', cursor: 'pointer', alignItems: 'center', transition: 'all 0.2s' }}
                                                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--sepia)'}
                                                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--ash)'}
                                            >
                                                {film.poster_path ? (
                                                    <img src={`https://image.tmdb.org/t/p/w92${film.poster_path}`} style={{ width: 45, height: 68, objectFit: 'cover', borderRadius: '2px' }} alt={film.title} />
                                                ) : (
                                                    <div style={{ width: 45, height: 68, background: 'var(--ink)', border: '1px solid var(--ash)' }} />
                                                )}
                                                <div>
                                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--parchment)' }}>{film.title}</div>
                                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>{film.release_date?.slice(0, 4)}</div>
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
        </div>
    )
}
