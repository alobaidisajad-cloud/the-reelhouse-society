import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, X, Check, Film, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '../store'
import { supabase } from '../supabaseClient'
import toast from 'react-hot-toast'

// Parse Letterboxd CSV export into our log format
// Letterboxd exports: Name, Year, URI, Rating, WatchedDate (from diary.csv or ratings.csv)
function parseLetterboxdCSV(text) {
    const lines = text.trim().split('\n')
    if (lines.length < 2) return []
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim())

    // Detect format: diary.csv has "Watched Date", ratings.csv has "Rating"
    const nameIdx = headers.findIndex(h => h.toLowerCase() === 'name')
    const yearIdx = headers.findIndex(h => h.toLowerCase() === 'year')
    const ratingIdx = headers.findIndex(h => h.toLowerCase() === 'rating')
    const dateIdx = headers.findIndex(h => h.toLowerCase().includes('date'))

    if (nameIdx === -1) return []

    return lines.slice(1).map(line => {
        // Handle commas inside quoted fields
        const cols = []
        let current = ''
        let inQuotes = false
        for (const ch of line) {
            if (ch === '"') { inQuotes = !inQuotes; continue }
            if (ch === ',' && !inQuotes) { cols.push(current.trim()); current = ''; continue }
            current += ch
        }
        cols.push(current.trim())

        const title = cols[nameIdx] || ''
        if (!title) return null

        const year = cols[yearIdx] || null
        const ratingRaw = cols[ratingIdx] || '0'
        // Letterboxd uses 0.5–5.0 stars; we use 1–5 integer
        const rating = Math.round(parseFloat(ratingRaw) || 0)
        const watchedDate = cols[dateIdx] ? new Date(cols[dateIdx]).toISOString() : new Date().toISOString()

        return { title, year, rating, watchedDate }
    }).filter(Boolean)
}

export default function LetterboxdImport({ onClose }) {
    const user = useAuthStore(s => s.user)
    const [dragOver, setDragOver] = useState(false)
    const [parsed, setParsed] = useState(null) // { entries: [], fileName }
    const [importing, setImporting] = useState(false)
    const [done, setDone] = useState(false)
    const [importCount, setImportCount] = useState(0)
    const fileRef = useRef(null)

    const handleFile = useCallback((file) => {
        if (!file || !file.name.endsWith('.csv')) {
            toast.error('Please upload a Letterboxd CSV file.')
            return
        }
        const reader = new FileReader()
        reader.onload = (e) => {
            const entries = parseLetterboxdCSV(e.target.result)
            if (entries.length === 0) {
                toast.error('No films found. Make sure this is a Letterboxd diary or ratings export.')
                return
            }
            setParsed({ entries, fileName: file.name })
        }
        reader.readAsText(file)
    }, [])

    const handleDrop = (e) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files[0]
        handleFile(file)
    }

    const handleImport = async () => {
        if (!parsed || !user) return
        setImporting(true)

        const BATCH = 20
        let count = 0
        const entries = parsed.entries

        for (let i = 0; i < entries.length; i += BATCH) {
            const batch = entries.slice(i, i + BATCH)
            const dbRows = batch.map(e => ({
                user_id: user.id,
                film_id: 0, // No TMDB id from CSV — set to 0, enrichable later
                film_title: e.title,
                year: e.year ? parseInt(e.year) : null,
                rating: e.rating || 0,
                status: 'watched',
                watched_date: e.watchedDate,
                review: '',
                is_spoiler: false,
                drop_cap: false,
                pull_quote: '',
            }))

            const { error } = await supabase
                .from('logs')
                .upsert(dbRows, { onConflict: 'user_id,film_title', ignoreDuplicates: true })

            if (!error) count += batch.length
            setImportCount(count)
        }

        // Refresh local store
        const { fetchLogs } = await import('../store').then(m => m.useFilmStore.getState())
        await fetchLogs()

        setImporting(false)
        setDone(true)
    }

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0, zIndex: 10005,
                    background: 'rgba(10,7,3,0.97)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '1rem',
                }}
            >
                <motion.div
                    initial={{ scale: 0.92, opacity: 0, y: 24 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.92, opacity: 0 }}
                    transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                    onClick={e => e.stopPropagation()}
                    style={{
                        background: 'var(--soot)',
                        border: '1px solid var(--ash)',
                        borderTop: '2px solid var(--sepia)',
                        borderRadius: 'var(--radius-card)',
                        width: '100%', maxWidth: 480,
                        padding: '2.5rem',
                        position: 'relative',
                        boxShadow: '0 30px 80px rgba(0,0,0,0.9)',
                    }}
                >
                    <button
                        onClick={onClose}
                        style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer' }}
                    >
                        <X size={18} />
                    </button>

                    {/* Header */}
                    <div style={{ marginBottom: '2rem' }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.58rem', letterSpacing: '0.35em', color: 'var(--sepia)', marginBottom: '0.75rem' }}>
                            MIGRATE YOUR ARCHIVE
                        </div>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--parchment)', lineHeight: 1.1, margin: 0 }}>
                            Import from Letterboxd
                        </h2>
                        <p style={{ fontFamily: 'var(--font-sub)', fontSize: '0.82rem', color: 'var(--bone)', marginTop: '0.75rem', opacity: 0.7, lineHeight: 1.5 }}>
                            Export your diary from Letterboxd → Settings → Import & Export → Export Your Data. Then drop the <code style={{ fontFamily: 'monospace', color: 'var(--sepia)' }}>diary.csv</code> or <code style={{ fontFamily: 'monospace', color: 'var(--sepia)' }}>ratings.csv</code> file here.
                        </p>
                    </div>

                    {done ? (
                        /* Success state */
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            style={{ textAlign: 'center', padding: '2rem 0' }}
                        >
                            <div style={{
                                width: 60, height: 60, borderRadius: '50%',
                                background: 'rgba(139,105,20,0.15)', border: '2px solid var(--sepia)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 1.5rem'
                            }}>
                                <Check size={28} color="var(--sepia)" />
                            </div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--parchment)', marginBottom: '0.5rem' }}>
                                Archive Transferred
                            </div>
                            <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--bone)', opacity: 0.8, marginBottom: '2rem' }}>
                                {importCount} films successfully imported into The Society.
                            </div>
                            <button className="btn btn-primary" onClick={onClose}>
                                ENTER THE SOCIETY
                            </button>
                        </motion.div>
                    ) : parsed ? (
                        /* Preview & confirm */
                        <div>
                            <div style={{
                                background: 'var(--ink)', border: '1px solid var(--ash)',
                                borderRadius: 'var(--radius-card)', padding: '1.25rem',
                                marginBottom: '1.5rem',
                                display: 'flex', alignItems: 'center', gap: '1rem'
                            }}>
                                <Film size={20} color="var(--sepia)" style={{ flexShrink: 0 }} />
                                <div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.25rem' }}>
                                        READY TO IMPORT
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--parchment)' }}>
                                        {parsed.entries.length} Films
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.72rem', color: 'var(--fog)', marginTop: '0.2rem' }}>
                                        {parsed.fileName}
                                    </div>
                                </div>
                            </div>

                            <div style={{
                                padding: '0.75rem 1rem', background: 'rgba(139,105,20,0.07)',
                                border: '1px solid rgba(139,105,20,0.2)', borderRadius: 'var(--radius-card)',
                                display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
                                marginBottom: '1.5rem'
                            }}>
                                <AlertTriangle size={14} color="var(--sepia)" style={{ flexShrink: 0, marginTop: 2 }} />
                                <span style={{ fontFamily: 'var(--font-sub)', fontSize: '0.75rem', color: 'var(--bone)', lineHeight: 1.5 }}>
                                    Duplicates will be skipped automatically. TMDB data will be linked to imported titles over time.
                                </span>
                            </div>

                            {importing && (
                                <div style={{ marginBottom: '1rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--fog)', marginBottom: '0.5rem' }}>
                                        <span>IMPORTING…</span>
                                        <span>{importCount} / {parsed.entries.length}</span>
                                    </div>
                                    <div style={{ height: 3, background: 'var(--ash)', borderRadius: 2, overflow: 'hidden' }}>
                                        <motion.div
                                            style={{ height: '100%', background: 'var(--sepia)', borderRadius: 2 }}
                                            animate={{ width: `${(importCount / parsed.entries.length) * 100}%` }}
                                            transition={{ duration: 0.3 }}
                                        />
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    className="btn btn-primary"
                                    style={{ flex: 1, justifyContent: 'center', padding: '0.9rem', opacity: importing ? 0.7 : 1 }}
                                    disabled={importing}
                                    onClick={handleImport}
                                >
                                    {importing ? 'IMPORTING…' : `IMPORT ${parsed.entries.length} FILMS`}
                                </button>
                                <button
                                    className="btn btn-ghost"
                                    style={{ padding: '0.9rem 1.25rem' }}
                                    onClick={() => setParsed(null)}
                                    disabled={importing}
                                >
                                    ↩
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Drop zone */
                        <>
                            <div
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={handleDrop}
                                onClick={() => fileRef.current?.click()}
                                style={{
                                    border: `2px dashed ${dragOver ? 'var(--sepia)' : 'var(--ash)'}`,
                                    borderRadius: 'var(--radius-card)',
                                    padding: '3rem 2rem',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    background: dragOver ? 'rgba(139,105,20,0.06)' : 'transparent',
                                    transition: 'all 0.25s',
                                    marginBottom: '1.5rem',
                                }}
                            >
                                <Upload size={28} color={dragOver ? 'var(--sepia)' : 'var(--ash)'} style={{ margin: '0 auto 1rem', display: 'block', transition: 'color 0.25s' }} />
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: dragOver ? 'var(--parchment)' : 'var(--bone)', marginBottom: '0.5rem', transition: 'color 0.25s' }}>
                                    Drop your CSV here
                                </div>
                                <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.75rem', color: 'var(--fog)' }}>
                                    or click to browse files
                                </div>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept=".csv"
                                    style={{ display: 'none' }}
                                    onChange={e => handleFile(e.target.files[0])}
                                />
                            </div>

                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--fog)', textAlign: 'center', lineHeight: 1.8 }}>
                                YOUR DATA NEVER LEAVES YOUR DEVICE UNTIL IMPORTED ✦ WE DO NOT STORE YOUR CSV
                            </div>
                        </>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
