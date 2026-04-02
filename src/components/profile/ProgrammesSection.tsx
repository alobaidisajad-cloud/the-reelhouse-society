import React, { useState } from 'react'
import { Lock, X } from 'lucide-react'
import reelToast from '../../utils/reelToast'
import { useFilmStore, useProgrammeStore } from '../../store'
import { tmdb } from '../../tmdb'

export function ProgrammesSection({ programmes, user, isOwnProfile }: { programmes: any[]; user: any; isOwnProfile: boolean }) {
    const { logs, vault, watchlist } = useFilmStore()
    const { addProgramme, removeProgramme } = useProgrammeStore()
    const [isCreating, setIsCreating] = useState(false)
    const [isPublishing, setIsPublishing] = useState(false)
    const [title, setTitle] = useState('')
    const [playbill, setPlaybill] = useState('')
    const [film1Id, setFilm1Id] = useState('')
    const [film2Id, setFilm2Id] = useState('')

    const uniqueFilms = React.useMemo(() => {
        if (!isCreating) return [] // Zero-cost execution when modal is closed
        const map = new Map()
        
        // Manual iteration avoids O(N) array-spread allocation
        for (const f of logs) {
            const id = (f as any).filmId || f.id
            if (!map.has(id)) map.set(id, f)
        }
        for (const f of vault) {
            const id = (f as any).filmId || f.id
            if (!map.has(id)) map.set(id, f)
        }
        for (const f of watchlist) {
            const id = (f as any).filmId || f.id
            if (!map.has(id)) map.set(id, f)
        }
        
        return Array.from(map.values())
    }, [logs, vault, watchlist, isCreating])

    const handleCreate = async () => {
        if (!title || !playbill || !film1Id || !film2Id) return
        const f1 = uniqueFilms.find(f => (f.filmId || f.id)?.toString() === film1Id.toString())
        const f2 = uniqueFilms.find(f => (f.filmId || f.id)?.toString() === film2Id.toString())
        
        try {
            setIsPublishing(true)
            await addProgramme({
                title, description: playbill,
                films: [
                    { id: f1.filmId || f1.id, title: f1.title || f1.name, poster_path: f1.poster || f1.poster_path },
                    { id: f2.filmId || f2.id, title: f2.title || f2.name, poster_path: f2.poster || f2.poster_path }
                ],
            })
            reelToast.success("Double feature published perfectly.")
            setIsCreating(false)
            setTitle(''); setPlaybill(''); setFilm1Id(''); setFilm2Id('')
        } catch (error: any) {
            reelToast.error(error.message || "Failed to curate feature. The archives are stuttering.")
        } finally {
            setIsPublishing(false)
        }
    }

    const isAuteur = logs.length >= 20 || user?.role === 'auteur' || user?.role === 'archivist'

    return (
        <div>
            {isOwnProfile && isAuteur && !isCreating && (
                <button className="btn btn-ghost" onClick={() => setIsCreating(true)} style={{ marginBottom: '2rem', padding: '1.5rem', width: '100%', border: '1px dashed var(--sepia)', color: 'var(--sepia)' }}>
                    + CURATE NIGHTLY PROGRAMME (DOUBLE FEATURE)
                </button>
            )}

            {!isOwnProfile && programmes.length === 0 && (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--fog)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
                    This Auteur has not curated any programmes yet.
                </div>
            )}

            {isOwnProfile && !isAuteur && programmes.length === 0 && (
                <div className="card" style={{ padding: '3rem', textAlign: 'center', border: '1px solid var(--sepia)' }}>
                    <Lock size={32} style={{ color: 'var(--sepia)', marginBottom: '1rem', opacity: 0.5 }} />
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--sepia)', marginBottom: '0.5rem' }}>Auteur Status Required</h3>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--fog)', maxWidth: 400, margin: '0 auto' }}>
                        The Nightly Programme curation is unlocked at 20 film logs or for Archivist tier members. Keep watching to unlock the power to publish double features.
                    </p>
                </div>
            )}

            {isCreating && (
                <div className="card" style={{ marginBottom: '2rem', background: 'var(--ink)', border: '1px solid var(--sepia)' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--sepia)', letterSpacing: '0.2em', marginBottom: '1.5rem', textAlign: 'center' }}>NEW DOUBLE FEATURE</div>
                    <input className="input" placeholder="Programme Name (e.g., 'Neon Blood & Rain')" value={title} onChange={e => setTitle(e.target.value)} style={{ marginBottom: '1rem', width: '100%', padding: '0.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--ash)', color: 'var(--bone)' }} />
                    <textarea className="input" placeholder="The Playbill (Why these two films? What is the thematic tissue?)" value={playbill} onChange={e => setPlaybill(e.target.value)} style={{ minHeight: '120px', marginBottom: '1rem', width: '100%', padding: '0.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--ash)', color: 'var(--bone)', resize: 'vertical' }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                        {[{ label: 'FEATURE 1 (THE PRIMER)', val: film1Id, set: setFilm1Id }, { label: 'FEATURE 2 (THE DESCENT)', val: film2Id, set: setFilm2Id }].map(({ label, val, set }) => (
                            <div key={label}>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>{label}</div>
                                <select className="input" value={val} onChange={e => set(e.target.value)} style={{ width: '100%', padding: '0.6rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--ash)', color: 'var(--bone)' }}>
                                    <option value="" disabled>Select from Archive...</option>
                                    {uniqueFilms.map(f => (
                                        <option key={f.filmId || f.id} value={f.filmId || f.id}>{f.title || f.name}</option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost" onClick={() => setIsCreating(false)} disabled={isPublishing}>CANCEL</button>
                        <button className="btn btn-primary" onClick={handleCreate} disabled={!title || !playbill || !film1Id || !film2Id || isPublishing}>
                            {isPublishing ? 'CURATING...' : 'PUBLISH PROGRAMME'}
                        </button>
                    </div>
                </div>
            )}

            {programmes.length > 0 && !isCreating && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {programmes.map((prog: any) => (
                        <div key={prog.id} className="card" style={{ display: 'flex', gap: '2.5rem', padding: '2.5rem', background: 'linear-gradient(135deg, var(--soot) 0%, var(--ink) 100%)', position: 'relative' }}>
                            {isOwnProfile && (
                                <button className="btn btn-ghost" onClick={async () => {
                                    try {
                                        await removeProgramme(prog.id)
                                        reelToast.success("Programme removed.")
                                    } catch (e: any) {
                                        reelToast.error(e.message || "Failed to remove programme.")
                                    }
                                }} style={{ position: 'absolute', top: '1rem', right: '1rem', padding: '0.3rem 0.6rem', fontSize: '0.5rem' }}>{<X size={12} style={{ display: "inline-block", verticalAlign: "middle" }} />} REMOVE</button>
                            )}
                            <div style={{ display: 'flex', width: '220px', flexShrink: 0 }}>
                                <img src={tmdb.poster(prog.films?.[0]?.poster_path, 'w185')} alt={prog.films?.[0]?.title || 'Film 1'} loading="lazy" decoding="async" style={{ width: '120px', height: '180px', objectFit: 'cover', borderRadius: '4px', boxShadow: '0 8px 16px rgba(0,0,0,0.6)', zIndex: 2, border: '1px solid rgba(255,255,255,0.1)' }} />
                                <img src={tmdb.poster(prog.films?.[1]?.poster_path, 'w185')} alt={prog.films?.[1]?.title || 'Film 2'} loading="lazy" decoding="async" style={{ width: '120px', height: '180px', objectFit: 'cover', borderRadius: '4px', boxShadow: '0 8px 16px rgba(0,0,0,0.6)', marginLeft: '-20px', marginTop: '30px', zIndex: 1, filter: 'brightness(0.6)', border: '1px solid rgba(255,255,255,0.1)' }} />
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>THE NIGHTLY PROGRAMME</div>
                                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '1rem' }}>{prog.title}</h3>
                                <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--fog)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ color: 'var(--bone)' }}>{prog.films?.[0]?.title || 'Unknown Film'}</span>
                                    <span>+</span>
                                    <span style={{ color: 'var(--bone)' }}>{prog.films?.[1]?.title || 'Unknown Film'}</span>
                                </div>
                                <p style={{ fontFamily: 'var(--font-body)', fontSize: '1rem', color: 'var(--fog)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{prog.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
