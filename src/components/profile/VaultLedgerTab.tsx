import { useState, useRef, useEffect } from 'react'
import { SectionHeader, FilmCard, ReelRating } from '../UI'
import Buster from '../Buster'
import { useMemo } from 'react'

import { useViewport } from '../../hooks/useViewport'

import { FilmLog } from '../../types'

export function VaultLedgerTab({ profileLogs, isOwnProfile, setViewLog }: { profileLogs: FilmLog[], isOwnProfile: boolean, setViewLog: (log: FilmLog) => void }) {
    const { isTouch: IS_TOUCH } = useViewport()
    const [sieve, setSieve] = useState('all')
    const [visibleLogCount, setVisibleLogCount] = useState(40)
    const loadMoreRef = useRef(null)

    const halfLifeMap = useMemo(() => {
        const byFilm: Record<number, { rating: number; date: string }[]> = {}
        for (const log of profileLogs) {
            if (!log.filmId || !log.rating) continue
            if (!byFilm[log.filmId]) byFilm[log.filmId] = []
            byFilm[log.filmId].push({ rating: log.rating, date: log.createdAt || log.watchedDate || new Date().toISOString() })
        }
        const result: Record<number, any> = {}
        for (const [filmId, entries] of Object.entries(byFilm)) {
            if (entries.length < 2) continue
            const sorted = [...entries].sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime())
            const first = sorted[0].rating, last = sorted[sorted.length - 1].rating
            result[Number(filmId)] = { count: sorted.length, trajectory: last > first ? 'ASCENDING' : last < first ? 'DECAYING' : 'ETERNAL', delta: last - first }
        }
        return result
    }, [profileLogs])

    useEffect(() => { setVisibleLogCount(40) }, [sieve])

    useEffect(() => {
        const el = loadMoreRef.current
        if (!el) return
        const obs = new IntersectionObserver(([e]) => {
            if (e.isIntersecting) setVisibleLogCount(c => c + 40)
        }, { rootMargin: '400px' })
        obs.observe(el)
        return () => obs.disconnect()
    }, [visibleLogCount])

    const filteredLogs = profileLogs.filter(log => {
        // Must have a poster to avoid the eye-logo placeholder card
        const hasPoster = (typeof log.poster === 'string' && log.poster.length > 5) || (typeof log.altPoster === 'string' && log.altPoster?.length > 5)
        if (!hasPoster) return false
        if (!log.rating && !log.review) return false // Ledger only shows rated/reviewed logs
        if (sieve === 'all') return true
        return log.rating === parseInt(sieve)
    })

    return (
        <div>
            <SectionHeader label="CHRONOLOGICAL" title="The Ledger" />
            {profileLogs.length > 0 && (
                <div className="profile-sieve-strip" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.5rem', borderBottom: '1px solid var(--ash)' }}>
                    <button onClick={() => setSieve('all')} className={`btn ${sieve === 'all' ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: '0.65rem', padding: '0.4rem 0.75rem', whiteSpace: 'nowrap', flexShrink: 0 }}>ALL</button>
                    {[5, 4, 3, 2, 1].map(star => (
                        <button key={star} onClick={() => setSieve(String(star))} className={`btn ${sieve === String(star) ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '0.4rem 0.5rem', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                            <ReelRating value={star} size="sm" />
                        </button>
                    ))}
                </div>
            )}
            {filteredLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem 2rem', border: '1px solid var(--ash)', borderRadius: 'var(--radius-card)', background: 'linear-gradient(180deg, var(--soot) 0%, var(--ink) 100%)' }}>
                    <Buster size={80} mood="peeking" />
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)', marginTop: '1.5rem', marginBottom: '0.5rem' }}>The Archive is Empty</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--fog)', maxWidth: 400, margin: '0 auto', lineHeight: 1.4 }}>
                        {profileLogs.length === 0 ? (isOwnProfile ? "No films logged yet. Press Ctrl+K or tap + to log your first film." : "This member hasn't logged any films yet.") : "No logs match this filter."}
                    </div>
                </div>
            ) : (() => {
                const shown = filteredLogs.slice(0, visibleLogCount)
                // Group shown logs by month
                const grouped = shown.reduce((acc: Record<string, FilmLog[]>, log) => {
                    const d = new Date(log.watchedDate || log.createdAt || new Date().toISOString())
                    const title = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()
                    if (!acc[title]) acc[title] = []
                    acc[title].push(log)
                    return acc
                }, {})

                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
                        {Object.keys(grouped).map(month => (
                            <div key={month}>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1rem', borderBottom: '1px solid rgba(139,105,20,0.1)', paddingBottom: '0.5rem' }}>
                                    {month}
                                </div>
                                <div className="profile-log-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: IS_TOUCH ? '0.2rem' : '0.75rem' }}>
                                    {grouped[month].map((log) => {
                                        const hl = halfLifeMap[log.filmId]
                                        return (
                                            <div
                                                key={log.id}
                                                onClick={() => setViewLog(log)}
                                                style={{ position: 'relative', cursor: 'pointer' }}
                                            >
                                                <FilmCard film={{ id: log.filmId, title: log.title, poster_path: log.altPoster || log.poster, release_date: log.year + '-01-01', userRating: log.rating, status: log.status } as any} />
                                                {hl && (
                                                    <div style={{ position: 'absolute', bottom: 6, left: 4, right: 4, background: 'rgba(10,7,3,0.88)', backdropFilter: 'blur(4px)', border: '1px solid rgba(139,105,20,0.3)', borderRadius: '2px', padding: '0.25rem 0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.3rem', pointerEvents: 'none' }}>
                                                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', whiteSpace: 'nowrap', color: hl.trajectory === 'ASCENDING' ? '#7cb87a' : hl.trajectory === 'DECAYING' ? 'var(--blood-reel)' : 'var(--sepia)' }}>{hl.trajectory === 'ASCENDING' ? '↑' : hl.trajectory === 'DECAYING' ? '↓' : '—'} {hl.trajectory}</span>
                                                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.4rem', color: 'var(--fog)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>×{hl.count}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                        {visibleLogCount < filteredLogs.length && (
                            <div ref={loadMoreRef} style={{ textAlign: 'center', padding: '2rem', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>
                                LOADING MORE REELS...
                            </div>
                        )}
                    </div>
                )
            })()}
        </div>
    )
}
