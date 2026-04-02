import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Check, ChevronRight } from 'lucide-react'
import { useAuthStore, useFilmStore, useUIStore } from '../store'
import { tmdb } from '../tmdb'
import { supabase } from '../supabaseClient'
import Buster from './Buster'
import reelToast from '../utils/reelToast'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useAndroidHardwareBack } from '../hooks/useAndroidHardwareBack'
import { Portal } from './UI'

interface OnboardFilm {
    id: number
    title?: string
    poster_path?: string
    media_type?: string
    [key: string]: any
}

const STEPS = [
    { label: 'PICK YOUR FIVE', sub: 'Choose 5 films that define your taste.' },
    { label: 'LOG YOUR FIRST', sub: 'Record your last watched film.' },
    { label: 'JOIN THE SOCIETY', sub: "You're in. Welcome to the society." },
]

export default function OnboardingModal() {
    const user = useAuthStore(s => s.user)
    const isAuthenticated = useAuthStore(s => s.isAuthenticated)
    const logs = useFilmStore(s => s.logs)
    const openLogModal = useUIStore(s => s.openLogModal)

    const [open, setOpen] = useState(false)
    const [step, setStep] = useState(0)
    const [selectedFilms, setSelectedFilms] = useState<OnboardFilm[]>([])
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<OnboardFilm[]>([])
    const [searching, setSearching] = useState(false)
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Show onboarding ONLY for brand new users (0 logs, hasn't dismissed before)
    useEffect(() => {
        if (!isAuthenticated || !user) return
        // Check DB preference first, fall back to legacy localStorage
        const dismissedKey = `reelhouse_onboarded_${user.id || user.username}`
        if (user.preferences?.onboarded || localStorage.getItem(dismissedKey)) return
        if (logs.length === 0) {
            const timer = setTimeout(() => setOpen(true), 1500)
            return () => clearTimeout(timer)
        }
    }, [isAuthenticated, user, logs.length])

    useEffect(() => {
        return () => {
            if (searchTimeout.current) clearTimeout(searchTimeout.current)
        }
    }, [])

    const handleSearch = (q: string) => {
        setQuery(q)
        if (searchTimeout.current) clearTimeout(searchTimeout.current)
        if (!q.trim()) { setResults([]); return }
        setSearching(true)
        searchTimeout.current = setTimeout(async () => {
            try {
                const data = await tmdb.search(q)
                const moviesOnly = data.results?.filter((i: any) => i.media_type !== 'person').slice(0, 8) || []
                setResults(moviesOnly)
            } catch { setResults([]) }
            finally { setSearching(false) }
        }, 350)
    }

    const toggleFilm = (film: OnboardFilm) => {
        const exists = selectedFilms.find(f => f.id === film.id)
        if (exists) {
            setSelectedFilms(s => s.filter(f => f.id !== film.id))
        } else if (selectedFilms.length < 5) {
            setSelectedFilms(s => [...s, film])
        }
    }

    const handleFinish = () => {
        if (user) {
            useAuthStore.getState().setPreference('onboarded', true)
            localStorage.setItem(`reelhouse_onboarded_${user.id || user.username}`, 'true')
        }
        setOpen(false)
        reelToast.success('Welcome to The Society ✦', { icon: '🎬' })
    }

    const handleLogFirst = () => {
        setOpen(false)
        if (user) {
            useAuthStore.getState().setPreference('onboarded', true)
            localStorage.setItem(`reelhouse_onboarded_${user.id || user.username}`, 'true')
        }
        openLogModal()
    }

    const handleDismiss = () => {
        if (user) {
            useAuthStore.getState().setPreference('onboarded', true)
            localStorage.setItem(`reelhouse_onboarded_${user.id || user.username}`, 'true')
        }
        setOpen(false)
    }

    const focusTrapRef = useFocusTrap(open, handleDismiss)
    useAndroidHardwareBack(open, handleDismiss)

    if (!open) return null

    return (
        <Portal>
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleDismiss}
                style={{
                    position: 'fixed', inset: 0, zIndex: 10001,
                    background: 'rgba(10,7,3,0.95)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '1rem',
                }}
                role="dialog"
                aria-modal="true"
                aria-label="Welcome onboarding"
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    onClick={e => e.stopPropagation()}
                    style={{
                        background: 'var(--soot)',
                        border: '1px solid var(--ash)',
                        borderTop: '2px solid var(--sepia)',
                        borderRadius: 'var(--radius-card)',
                        width: '100%', maxWidth: 480,
                        maxHeight: 'calc(100dvh - 2rem)',
                        overflow: 'auto',
                        position: 'relative',
                    }}
                >
                    {/* Close button */}
                    <button
                        onClick={handleDismiss}
                        style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer', zIndex: 2 }}
                    >
                        <X size={18} />
                    </button>

                    {/* Header */}
                    <div style={{ padding: '2rem 2rem 1rem', textAlign: 'center' }}>
                        <Buster size={48} mood="smiling" />
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.3em', color: 'var(--sepia)', marginTop: '1rem' }}>
                            {STEPS[step].label}
                        </div>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', color: 'var(--parchment)', marginTop: '0.5rem' }}>
                            {step === 0 ? 'What Films Define You?' :
                                step === 1 ? 'Log Your First Film' :
                                    'Welcome, Devotee.'}
                        </h2>
                        <p style={{ fontFamily: 'var(--font-sub)', fontSize: '0.85rem', color: 'var(--bone)', marginTop: '0.5rem', opacity: 0.8 }}>
                            {STEPS[step].sub}
                        </p>
                    </div>

                    {/* Step progress */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', padding: '0 2rem 1.5rem' }}>
                        {[0, 1, 2].map(i => (
                            <div key={i} style={{
                                width: i === step ? 32 : 8, height: 4,
                                borderRadius: 2,
                                background: i <= step ? 'var(--sepia)' : 'var(--ash)',
                                transition: 'all 0.3s',
                            }} />
                        ))}
                    </div>

                    {/* Content */}
                    <div style={{ padding: '0 2rem 2rem' }}>
                        {step === 0 && (
                            <>
                                {/* Search */}
                                <div style={{ position: 'relative', marginBottom: '1rem' }}>
                                    <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--sepia)', opacity: 0.6 }} />
                                    <input
                                        className="input"
                                        style={{
                                            width: '100%', padding: '0.7rem 1rem 0.7rem 2.5rem',
                                            fontSize: '0.9rem', fontFamily: 'var(--font-sub)',
                                            background: 'var(--ink)', borderColor: 'var(--ash)',
                                            color: 'var(--parchment)', borderRadius: 'var(--radius-card)',
                                            boxSizing: 'border-box',
                                        }}
                                        placeholder="Search films..."
                                        value={query}
                                        onChange={e => handleSearch(e.target.value)}
                                        autoFocus
                                    />
                                </div>

                                {/* Selected chips */}
                                {selectedFilms.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
                                        {selectedFilms.map(f => (
                                            <motion.div
                                                key={f.id}
                                                initial={{ scale: 0.8, opacity: 0 }}
                                                animate={{ scale: 1, opacity: 1 }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                                                    background: 'rgba(139,105,20,0.15)',
                                                    border: '1px solid rgba(139,105,20,0.3)',
                                                    borderRadius: '100px', padding: '0.2rem 0.6rem',
                                                    fontFamily: 'var(--font-sub)', fontSize: '0.7rem', color: 'var(--flicker)',
                                                }}
                                            >
                                                {f.title?.slice(0, 20)}
                                                <button onClick={() => toggleFilm(f)} style={{ background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer', padding: 0 }}>
                                                    <X size={10} />
                                                </button>
                                            </motion.div>
                                        ))}
                                    </div>
                                )}

                                {/* Results grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', maxHeight: 260, overflow: 'auto' }}>
                                    {results.map(f => {
                                        const isSelected = selectedFilms.some(s => s.id === f.id)
                                        return (
                                            <motion.div
                                                key={f.id}
                                                whileTap={{ scale: 0.95 }}
                                                onClick={() => toggleFilm(f)}
                                                style={{
                                                    position: 'relative', cursor: 'pointer',
                                                    borderRadius: 4, overflow: 'hidden',
                                                    border: isSelected ? '2px solid var(--sepia)' : '2px solid transparent',
                                                    opacity: isSelected ? 1 : 0.7,
                                                    transition: 'all 0.2s',
                                                }}
                                            >
                                                <img
                                                    src={tmdb.poster(f.poster_path, 'w185')}
                                                    alt={f.title}
                                                    loading="lazy"
                                                    style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }}
                                                />
                                                {isSelected && (
                                                    <div style={{
                                                        position: 'absolute', top: 4, right: 4,
                                                        width: 20, height: 20, borderRadius: '50%',
                                                        background: 'var(--sepia)', display: 'flex',
                                                        alignItems: 'center', justifyContent: 'center',
                                                    }}>
                                                        <Check size={12} color="var(--ink)" />
                                                    </div>
                                                )}
                                            </motion.div>
                                        )
                                    })}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem' }}>
                                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>
                                        {selectedFilms.length}/5 SELECTED
                                    </span>
                                    <button
                                        className="btn btn-primary"
                                        style={{ fontSize: '0.7rem', padding: '0.5em 1.5em', letterSpacing: '0.15em', opacity: selectedFilms.length > 0 ? 1 : 0.4 }}
                                        disabled={selectedFilms.length === 0}
                                        onClick={async () => {
                                            // Save taste seeds to Supabase profile
                                            if (user?.id && selectedFilms.length > 0) {
                                                const seeds = selectedFilms.map((f: OnboardFilm) => ({ id: f.id, title: f.title, poster: f.poster_path }))
                                                await (supabase.from('profiles')
                                                    .update({ taste_seeds: seeds })
                                                    .eq('id', user.id) as any).catch(() => { })  // Graceful if column doesn't exist yet
                                            }
                                            setStep(1)
                                        }}
                                    >
                                        NEXT <ChevronRight size={12} />
                                    </button>
                                </div>
                            </>
                        )}

                        {step === 1 && (
                            <div style={{ textAlign: 'center' }}>
                                {/* Show selected films as a mini strip */}
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '2rem' }}>
                                    {selectedFilms.slice(0, 5).map(f => (
                                        <div key={f.id} style={{ width: 50, height: 75, borderRadius: 2, overflow: 'hidden', border: '1px solid var(--ash)' }}>
                                            <img src={tmdb.poster(f.poster_path, 'w92')} alt={f.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        </div>
                                    ))}
                                </div>

                                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--bone)', marginBottom: '2rem', lineHeight: 1.6 }}>
                                    Your taste profile has been seeded. Now log a film to make your mark on The Society.
                                </p>

                                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                                    <button
                                        className="btn btn-primary"
                                        style={{ fontSize: '0.75rem', padding: '0.7em 2em', letterSpacing: '0.15em' }}
                                        onClick={handleLogFirst}
                                    >
                                        + LOG A FILM
                                    </button>
                                    <button
                                        className="btn btn-ghost"
                                        style={{ fontSize: '0.65rem', padding: '0.6em 1.5em', letterSpacing: '0.1em' }}
                                        onClick={() => setStep(2)}
                                    >
                                        SKIP FOR NOW
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✦</div>
                                <p style={{ fontFamily: 'var(--font-body)', fontSize: '1rem', color: 'var(--parchment)', lineHeight: 1.6, marginBottom: '2rem' }}>
                                    The projector is loaded. The house lights are dimming.
                                    <br />Your journey through the archive begins now.
                                </p>
                                <button
                                    className="btn btn-primary"
                                    style={{ fontSize: '0.75rem', padding: '0.7em 2.5em', letterSpacing: '0.2em' }}
                                    onClick={handleFinish}
                                >
                                    ENTER THE SOCIETY
                                </button>
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
        </Portal>
    )
}
