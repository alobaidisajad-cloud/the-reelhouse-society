import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Lock } from 'lucide-react'
import { useFilmStore, useUIStore, useAuthStore } from '../../store'
import reelToast from '../../utils/reelToast'
import { isArchivistPlusTier } from '../../utils/tier'
import { fetchAllMyNotes, type VaultNoteRow } from '../../services/vault'

export function ProjectorRoom({ stats, user }: { stats: any; user: any }) {
    const isMaster = stats.total_logs > 50

    // `user` is the profile being LOOKED AT, not the person looking. Gating the
    // export on `user.role` therefore asked "is the owner of this page an
    // Archivist?" — so opening any Archivist's profile and pressing Export
    // downloaded THEIR entire film history, to anyone, at any tier.
    //
    // Two things are required now, and they are separate questions:
    //   1. is the viewer looking at their OWN archive?  — exporting someone
    //      else's history is not a paid feature, it is not a feature at all
    //   2. is the VIEWER an Archivist?                  — the actual paywall
    const viewer = useAuthStore(s => s.user)
    const isOwnArchive = !!viewer?.id && !!user?.id && viewer.id === user.id
    const isPremium = isArchivistPlusTier(viewer)

    const downloadCsv = async () => {
        if (!isOwnArchive) {
            return reelToast("You can only export your own archive.", { icon: <><Lock size={10} style={{ display: "inline-block", verticalAlign: "middle" }} /></>, style: { background: 'var(--soot)', color: 'var(--sepia)', border: '1px solid var(--sepia)' } })
        }
        if (!isPremium) {
            window.location.href = '/join'
            return reelToast("CSV Export is restricted to Archivists.", { icon: <><Lock size={10} style={{ display: "inline-block", verticalAlign: "middle" }} /></>, style: { background: 'var(--soot)', color: 'var(--sepia)', border: '1px solid var(--sepia)' } })
        }

        // Fetch logs JUST-IN-TIME rather than keeping 100,000 in memory
        const loadingToast = reelToast.loading('Compiling Archive...')
        
        const { supabase } = await import('../../supabaseClient')
        
        let allLogs: any[] = []
        let page = 0
        const PAGE_SIZE = 1000
        while (true) {
            const { data, error } = await supabase
                .from('logs')
                // Named columns, not `*`: `*` includes `private_notes`, the column
                // the database keeps blank, and nothing on the web reads it.
                .select('film_title, year, rating, status, watched_date, review, watched_with, viewing_id, viewing_history, created_at')
                // viewer.id, not user.id — the guard above already proves they are
                // the same person, and reading it from the session means a future
                // change to that guard cannot turn this back into someone else's
                // archive.
                .eq('user_id', viewer!.id)
                .order('created_at', { ascending: false })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
            
            if (error || !data || data.length === 0) break
            allLogs = allLogs.concat(data)
            if (data.length < PAGE_SIZE) break
            page++
        }
        
        const fetchLogs = allLogs
            
        reelToast.dismiss(loadingToast)
        
        if (!fetchLogs || fetchLogs.length === 0) return reelToast('No logs to export.')

        // The member's own private notes leave with them — read from the Vault,
        // where they live, by viewing. This column used to read the log row's
        // `private_notes`, which the database keeps blank on purpose, so every
        // export shipped with an empty "Private Notes" column. A log's row carries
        // the note on the viewing it is ON; each earlier viewing follows as its
        // own row with its own note, so no note is left behind.
        let notes: VaultNoteRow[] = []
        try { notes = await fetchAllMyNotes() } catch {
            return reelToast.error('The Vault could not be reached, so the export was not made. Try again.')
        }
        const noteByViewing = new Map(notes.map(n => [n.viewing_id, n.notes]))
        const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`

        const headers = ['Title', 'Year', 'Rating', 'Status', 'Watched Date', 'Review', 'Private Notes', 'Watched With', 'Viewing']
        const csvRows = [headers.join(',')]
        for (const log of fetchLogs) {
            csvRows.push([
                cell(log.film_title), log.year || '', log.rating || '', log.status || '',
                log.watched_date || '', cell(log.review),
                cell(noteByViewing.get(log.viewing_id)), cell(log.watched_with), cell('current'),
            ].join(','))
            const history: Array<{ viewingId?: string; date?: string; rating?: number; review?: string; watchedWith?: string | null; status?: string }> =
                Array.isArray(log.viewing_history) ? log.viewing_history : []
            history.forEach((v, i) => {
                const note = v.viewingId ? noteByViewing.get(v.viewingId) : undefined
                csvRows.push([
                    cell(log.film_title), log.year || '', v.rating || '', v.status || '',
                    (v.date || '').slice(0, 10), cell(v.review),
                    cell(note), cell(v.watchedWith), cell(i === history.length - 1 ? 'first watch' : `viewing ${history.length - i}`),
                ].join(','))
            })
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
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '3rem', width: '100%', maxWidth: 400 }}>
                    <div className="projector-stat-dial" style={{ transform: 'scale(1.2)', margin: '1rem 0 2.5rem' }}>
                        <div className="dial-value">{stats.count}</div>
                        <div className="dial-label" style={{ marginTop: '0.4rem' }}>LIFETIME LOGS</div>
                    </div>
                    <div style={{ width: '100%' }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.25em', color: 'var(--fog)', marginBottom: '0.6rem' }}>RANKING</div>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: stats.color, filter: `drop-shadow(0 0 20px ${stats.color}40)`, marginBottom: '1.5rem' }}>{stats.level}</h2>
                        <div style={{ height: 4, background: 'var(--ash)', borderRadius: 2, overflow: 'hidden' }}>
                            <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: stats.progress / 100 }} style={{ height: '100%', width: '100%', transformOrigin: 'left', background: stats.color }} />
                        </div>
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
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--sepia)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }} onClick={() => window.location.href = '/join'}>
                        <Lock size={10} /> ARCHIVIST EXCLUSIVE
                    </div>
                </div>
            )}
        </div>
    )
}
