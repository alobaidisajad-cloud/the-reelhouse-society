/**
 * DirectorPanel — Slide-out panel showing director's filmography
 * with completion tracking ("The Auteur Hunt").
 */
import { AnimatePresence, motion } from 'framer-motion'
import { X, Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { tmdb } from '../../tmdb'
import { useFilmStore } from '../../store'
import { Portal } from '../UI'

export default function DirectorPanel({ director, onClose }: any) {
    const { logs } = useFilmStore()
    const { data: filmography, isLoading } = useQuery({
        queryKey: ['person-films', director.id],
        queryFn: async () => {
            if (!director.id) return []
            const data: any = await tmdb.personCredits(director.id)
            return (data?.crew || []).filter((f: any) => f.job === 'Director' && f.poster_path).sort((a: any, b: any) => (b.release_date || '').localeCompare(a.release_date || ''))
        },
        staleTime: 1000 * 60 * 30,
    })

    return (
        <Portal>
            <AnimatePresence>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 20000 }} />
                <motion.div
                    initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 28, stiffness: 260 }}
                    style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 20001, width: 'min(420px, 95vw)', background: 'var(--soot)', borderLeft: '1px solid var(--ash)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
                >
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--ash)', position: 'sticky', top: 0, background: 'var(--soot)', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, paddingRight: '1rem' }}>
                            <div className="section-title" style={{ marginBottom: '0.3rem' }}>DIRECTOR DOSSIER</div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--parchment)', lineHeight: 1.2 }}>{director.name}</div>
                            {filmography && (() => {
                                const seenCount = logs.filter((l: any) => filmography.some((f: any) => f.id === l.filmId)).length
                                const pct = Math.round((seenCount / Math.max(filmography.length, 1)) * 100)
                                return (
                                    <div style={{ marginTop: '0.75rem' }}>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--fog)', display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                            <span>THE AUTEUR HUNT</span><span>{seenCount} OF {filmography.length} SEEN</span>
                                        </div>
                                        <div style={{ height: 2, background: 'var(--ash)', borderRadius: 2, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--sepia)', transition: 'width 1s ease-out' }} />
                                        </div>
                                    </div>
                                )
                            })()}
                        </div>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--fog)', padding: '0.25rem', cursor: 'pointer' }}><X size={18} /></button>
                    </div>
                    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {isLoading ? Array.from({ length: 6 }).map((_, i) => <div key={i} style={{ height: 72, background: 'var(--ash)', borderRadius: 'var(--radius-card)', opacity: 1 - i * 0.12 }} />) :
                            filmography?.map((film: any) => (
                                <Link key={film.id} to={`/film/${film.id}`} onClick={onClose}
                                    style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.6rem', textDecoration: 'none', borderRadius: 'var(--radius-card)', border: '1px solid transparent', transition: 'border-color 0.2s, background 0.2s' }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ash)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
                                >
                                    <img src={tmdb.poster(film.poster_path, 'w92') || undefined} alt={film.title} decoding="async" loading="lazy" style={{ width: 36, height: 54, objectFit: 'cover', borderRadius: '2px', filter: 'sepia(0.3)', flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: logs.some((l: any) => l.filmId === film.id) ? 'var(--parchment)' : 'var(--bone)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            {film.title}{logs.some((l: any) => l.filmId === film.id) && <span style={{ color: 'var(--sepia)', fontSize: '0.6rem' }}><Check size={12} style={{ display: "inline-block", verticalAlign: "middle" }} /></span>}
                                        </div>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--fog)', marginTop: '0.15rem' }}>{film.release_date?.slice(0, 4) || '—'}</div>
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--sepia)', flexShrink: 0 }}>{film.vote_average > 0 ? film.vote_average.toFixed(1) + ' ★' : ''}</div>
                                </Link>
                            ))
                        }
                    </div>
                </motion.div>
            </AnimatePresence>
        </Portal>
    )
}
