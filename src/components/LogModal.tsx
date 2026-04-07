import { useState, useEffect, useRef } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useAndroidHardwareBack } from '../hooks/useAndroidHardwareBack'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { useUIStore, useFilmStore } from '../store'
import { tmdb } from '../tmdb'
import LogModalSearch from './log-modal/LogModalSearch'
import LogForm from './log-modal/LogForm'
import ShareCardModal from './film/ShareCardModal'
import { Portal } from './UI'

export default function LogModal() {
    const logModalOpen = useUIStore(state => state.logModalOpen)
    const logModalFilm = useUIStore(state => state.logModalFilm)
    const logModalEditLogId = useUIStore(state => state.logModalEditLogId)
    const closeLogModal = useUIStore(state => state.closeLogModal)
    const logs = useFilmStore(state => state.logs)

    const [step, setStep] = useState(0) // 0=search, 1=log
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<any[]>([])
    const [searchType, setSearchType] = useState('exact')
    const [searchContext, setSearchContext] = useState('')
    const [searching, setSearching] = useState(false)
    const [film, setFilm] = useState<any>(logModalFilm)
    const [shareCardData, setShareCardData] = useState<any>(null)
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
    const abortRef = useRef<AbortController | null>(null)

    useEffect(() => {
        if (logModalFilm && logModalEditLogId) {
            const existingLog = logs.find(l => l.id === logModalEditLogId)
            if (existingLog) {
                setFilm(logModalFilm)
                setStep(1)
            }
        } else if (logModalFilm) {
            // New Log Mode (pre-selected film)
            setFilm(logModalFilm)
            setStep(1)
        } else {
            // Search Mode
            setStep(0)
            setFilm(null)
        }
    }, [logModalFilm, logModalOpen, logModalEditLogId, logs])

    useEffect(() => {
        if (!logModalOpen) {
            setQuery(''); setResults([])
            if (searchTimeout.current) clearTimeout(searchTimeout.current)
        }
    }, [logModalOpen])

    useEffect(() => {
        return () => {
            if (searchTimeout.current) clearTimeout(searchTimeout.current)
            abortRef.current?.abort()
        }
    }, [])

    const handleSearch = (q: string) => {
        setQuery(q)
        if (searchTimeout.current) clearTimeout(searchTimeout.current)
        abortRef.current?.abort()
        if (!q.trim()) { setResults([]); return }
        setSearching(true)
        searchTimeout.current = setTimeout(async () => {
            const controller = new AbortController()
            abortRef.current = controller
            try {
                const data = await tmdb.search(q)
                if (controller.signal.aborted) return
                const filmsOnly = data.results?.filter((i: any) => i.media_type !== 'person') || []
                setResults(filmsOnly.slice(0, 6))
                setSearchType(data.searchType || 'exact')
                setSearchContext(data.matchedContext || '')
            } catch (e) {
                if (e instanceof DOMException && e.name === 'AbortError') return
                setResults([]); setSearchType('exact')
            }
            finally { setSearching(false) }
        }, 400)
    }

    const selectFilm = (f: any) => {
        setFilm(f)
        setStep(1)
        setResults([])
        setQuery('')
    }

    const focusTrapRef = useFocusTrap(logModalOpen, closeLogModal)
    useAndroidHardwareBack(logModalOpen, closeLogModal)

    return (
        <Portal>
        <>
        {logModalOpen && (
        <AnimatePresence>
            <motion.div
                key="modal-backdrop"
                ref={focusTrapRef}
                role="dialog"
                aria-modal="true"
                aria-label="Log a film"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onPointerDown={(e) => { if (e.target === e.currentTarget) e.currentTarget.dataset.backdropDown = 'true' }}
                onPointerUp={(e) => { if (e.target === e.currentTarget && e.currentTarget.dataset.backdropDown === 'true') closeLogModal(); e.currentTarget.dataset.backdropDown = 'false' }}
                className="modal-overlay"
            >
                <motion.div
                    key="modal-box"
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        background: 'var(--soot)',
                        border: '1px solid var(--ash)',
                        borderRadius: 'var(--radius-card)',
                        width: 'calc(100% - 2rem)',
                        maxWidth: 520,
                        maxHeight: 'calc(100dvh - 2rem)',
                        overflow: 'auto',
                        position: 'relative',
                        margin: 'auto auto'
                    }}
                >
                    {/* ── Minimal Header — just close button ── */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                        padding: '0.75rem 1rem',
                    }}>
                        {logModalEditLogId && (
                            <span style={{ marginRight: 'auto', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'var(--sepia)', background: 'rgba(139,105,20,0.1)', padding: '0.25rem 0.65rem', borderRadius: '2px', border: '1px solid rgba(139,105,20,0.2)' }}>
                                EDITING
                            </span>
                        )}
                        <button
                            onClick={closeLogModal}
                            aria-label="Close log modal"
                            style={{ background: 'none', border: 'none', color: 'var(--fog)', padding: '0.35rem', cursor: 'pointer', borderRadius: '4px', transition: 'color 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--parchment)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--fog)'}
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div style={{ padding: '0 1.5rem 1.5rem' }}>
                        {/* Step 0: Search */}
                        {step === 0 && (
                            <>
                            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--parchment)', marginBottom: '1rem', textAlign: 'center' }}>
                                Log a Film
                            </h3>
                            <LogModalSearch
                                query={query}
                                searching={searching}
                                results={results}
                                searchType={searchType}
                                searchContext={searchContext}
                                onSearch={handleSearch}
                                onSelect={selectFilm}
                            />
                            </>
                        )}

                        {/* Step 1: Log form */}
                        {step === 1 && film && (
                            <LogForm film={film} />
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
        )}

            {shareCardData && (
                <ShareCardModal
                    data={shareCardData}
                    onClose={() => setShareCardData(null)}
                />
            )}
        </>
        </Portal>
    )
}
