import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Lock } from 'lucide-react'
import { useFilmStore, useUIStore } from '../../store'
import toast from 'react-hot-toast'

export function ProjectorRoom({ stats, user }: { stats: any; user: any }) {
    const isMaster = stats.count > 50
    const { logs } = useFilmStore()
    const isPremium = user?.role === 'archivist' || user?.role === 'auteur'

    const downloadCsv = () => {
        if (!isPremium) {
            useUIStore.getState().openSignupModal('archivist')
            return toast("CSV Export is restricted to Archivists.", { icon: <><Lock size={10} style={{ display: "inline-block", verticalAlign: "middle" }} /></>, style: { background: 'var(--soot)', color: 'var(--sepia)', border: '1px solid var(--sepia)' } })
        }
        if (logs.length === 0) return toast('No logs to export.')

        const headers = ['Title', 'Year', 'Rating', 'Status', 'Watched Date', 'Review', 'Private Notes', 'Watched With']
        const csvRows = [headers.join(',')]
        for (const log of logs) {
            csvRows.push([
                `"${log.title || ''}"`, log.year || '', log.rating || '', log.status || '',
                log.watchedDate || '', `"${(log.review || '').replace(/"/g, '""')}"`,
                `"${(log.privateNotes || '').replace(/"/g, '""')}"`, `"${log.watchedWith || ''}"`
            ].join(','))
        }
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.setAttribute('href', url)
        a.setAttribute('download', `reelhouse-archive-${new Date().toISOString().split('T')[0]}.csv`)
        a.click()
        window.URL.revokeObjectURL(url)
    }



    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '2rem' }}>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '2rem' }}>
                    <div className="projector-stat-dial">
                        <div className="dial-value">{stats.count}</div>
                        <div className="dial-label">LOGS</div>
                    </div>
                    <div style={{ marginTop: '1.5rem' }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.25em', color: 'var(--sepia)', marginBottom: '0.4rem' }}>CURRENT STATUS</div>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: stats.color }}>{stats.level}</h2>
                    </div>
                    <div style={{ width: '100%', marginTop: '1.25rem' }}>
                        <div style={{ height: 4, background: 'var(--ash)', borderRadius: 2, overflow: 'hidden' }}>
                            <motion.div initial={{ width: 0 }} animate={{ width: `${stats.progress}%` }} style={{ height: '100%', background: stats.color }} />
                        </div>
                    </div>
                </div>
                <div className="card" style={{ padding: '2rem' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1rem' }}>DOSSIER SUMMARY</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {[
                            { label: 'TIME IN THE DARK', value: (stats.count * 122) + 'm' },
                            { label: 'HOURS IN DARK', value: Math.floor(stats.count * 1.8) + 'h' },
                            { label: 'SILENT ERA PRESERVATIONS', value: isMaster ? '🏆 MASTER' : '4' },
                            { label: 'THEATRICAL VISITS', value: stats.count },
                        ].map(s => (
                            <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--ash)', paddingBottom: '0.4rem' }}>
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)' }}>{s.label}</span>
                                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--parchment)' }}>{s.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Achievement Certificate */}
            {stats.count > 0 && (
                <div className="card" style={{ padding: '3rem', textAlign: 'center', background: 'var(--soot)', border: '1px double var(--sepia)', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 10, left: 10, opacity: 0.2, fontFamily: 'var(--font-display)', fontSize: '4rem' }}>✦</div>
                    <div style={{ position: 'absolute', bottom: 10, right: 10, opacity: 0.2, fontFamily: 'var(--font-display)', fontSize: '4rem' }}>✦</div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', color: 'var(--sepia)', letterSpacing: '0.3em', marginBottom: '1rem' }}>REELHOUSE PRESERVATION SOCIETY</div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--parchment)', marginBottom: '1rem' }}>Certificate of Obsession</h2>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--bone)', maxWidth: '400px', margin: '0 auto 1.5rem' }}>
                        This document certifies that the bearer has witnessed {stats.count} films and contributed to the archival history of The ReelHouse Society.
                    </p>
                    <div style={{ fontFamily: 'var(--font-sub)', fontSize: '1.2rem', color: stats.color, padding: '0.5rem 2rem', border: `1px solid ${stats.color}`, display: 'inline-block', transform: 'rotate(-5deg)' }}>
                        {stats.level}
                    </div>
                </div>
            )}

            {/* CSV Download */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '3rem' }}>
                <button
                    onClick={downloadCsv}
                    className="btn btn-ghost"
                    style={{ padding: '1rem 2rem', fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.25em', color: 'var(--fog)', border: '1px solid var(--ash)', background: 'rgba(10, 7, 3, 0.5)', transition: 'all 0.3s ease' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--sepia)'; e.currentTarget.style.borderColor = 'var(--sepia)'; e.currentTarget.style.background = 'rgba(139, 105, 20, 0.05)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--fog)'; e.currentTarget.style.borderColor = 'var(--ash)'; e.currentTarget.style.background = 'rgba(10, 7, 3, 0.5)' }}
                >
                    DOWNLOAD ARCHIVAL RECORD (.CSV)
                </button>
            </div>
            {!isPremium && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.5rem' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--sepia)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }} onClick={() => useUIStore.getState().openSignupModal('archivist')}>
                        <Lock size={10} /> ARCHIVIST EXCLUSIVE
                    </div>
                </div>
            )}
        </div>
    )
}
