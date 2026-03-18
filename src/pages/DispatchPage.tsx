import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState, useRef } from 'react'
import { tmdb } from '../tmdb'
import { useAuthStore, useDispatchStore } from '../store'
import Buster from '../components/Buster'
import '../styles/dispatch.css'

/* ── REFINED NOIR ICONS ── */
const IconFeather = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
        <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
        <line x1="16" y1="8" x2="2" y2="22" />
        <line x1="17.5" y1="15" x2="9" y2="6.5" />
    </svg>
)
const IconClose = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
)
const IconArrowRight = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
    </svg>
)

export default function DispatchPage() {
    const { user } = useAuthStore()
    const { dossiers, addDossier, fetchDossiers } = useDispatchStore()
    const [news, setNews] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedArticle, setSelectedArticle] = useState(null)
    const [isWriting, setIsWriting] = useState(false)
    const [formValues, setFormValues] = useState({ title: '', content: '' })

    const scrollPos = useRef(0)
    const canWrite = user?.role === 'auteur'

    useEffect(() => {
        const fetchNews = async () => {
            setLoading(true)
            try {
                const items = await tmdb.getNews()
                setNews(items.slice(0, 10))
            } catch {
                // TMDB news failed silently — UI shows empty state
            }
            setLoading(false)
        }
        fetchNews()
        fetchDossiers()
    }, [])

    // Cleanup scroll lock if user navigates away mid-article
    useEffect(() => {
        return () => { document.body.style.overflow = 'unset' }
    }, [])

    const openArticle = (item: any) => {
        scrollPos.current = window.scrollY
        setSelectedArticle(item)
        document.body.style.overflow = 'hidden'
    }
    const closeArticle = () => {
        setSelectedArticle(null)
        document.body.style.overflow = 'unset'
        window.scrollTo(0, scrollPos.current)
    }

    const submitEssay = () => {
        if (!formValues.title.trim() || !formValues.content.trim()) return

        const newEssay = {
            title: formValues.title,
            excerpt: formValues.content.substring(0, 150) + '...',
            fullContent: formValues.content,
            author: user?.username || "AUTEUR",
            date: "JUST FILED",
        }
        addDossier(newEssay)
        setIsWriting(false)
        setFormValues({ title: '', content: '' })
    }

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="dispatch-newsletter-root"
        >
            {/* NOIR BACKGROUND NOISE - Performant gradient instead of high-res image */}
            <div className="dispatch-bg-noise"></div>

            {/* WRITER BAR (Sticky at Top) */}
            <div className="dispatch-writer-bar">
                <div className="wb-content">
                    <span className="wb-logo">THE DISPATCH</span>
                    {canWrite ? (
                        <button
                            className="btn btn-ghost"
                            style={{ padding: '0.4em 1em', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--parchment)', borderColor: 'var(--sepia)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            onClick={() => setIsWriting(true)}
                        >
                            <IconFeather /> FILE DOSSIER
                        </button>
                    ) : (
                        <div className="wb-locked">UPGRADE TO AUTEUR TIER TO PUBLISH</div>
                    )}
                </div>
            </div>

            {/* THE NEWSLETTER DOCUMENT */}
            <div className="dispatch-document">

                {/* HEAD & MASTHEAD */}
                <header className="dispatch-masthead">
                    <div className="masthead-meta">
                        <span>VOL. {String(Math.floor((Date.now() - new Date('2026-03-12T00:00:00Z').getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1).padStart(3, '0')}</span>
                        <span className="pulse-dot"></span>
                        <span>{new Date().toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' }).toUpperCase()}</span>
                    </div>
                    <h1 className="masthead-title">THE DISPATCH</h1>
                    <div className="masthead-subtitle">The official newsletter of The ReelHouse Society Underground.</div>
                    <div className="masthead-texture"></div>
                </header>

                {/* ELEGANT DIVIDER */}
                <div className="ornamental-divider">
                    <span></span><div className="diamond"></div><span></span>
                </div>

                {/* AUTEUR DOSSIERS (USER ESSAYS) */}
                <section className="dispatch-section">
                    <div className="section-header-block">
                        <h2 className="sh-title">Auteur Dossiers</h2>
                        <p className="sh-sub">Original cinematic essays filed by our premium members.</p>
                    </div>

                    <div className="auteur-dossier-list">
                        {dossiers.map((report: any) => (
                            <article key={report.id} onClick={() => openArticle(report)} className="dossier-card">
                                <div className="dossier-meta">
                                    <span className="dm-author">BY {report.author.toUpperCase()}</span>
                                    <span className="dm-date">{report.date}</span>
                                </div>
                                <h3 className="dossier-title">{report.title}</h3>
                                <p className="dossier-excerpt">{report.excerpt}</p>
                                <div className="dossier-readmore">READ DOSSIER <IconArrowRight /></div>
                            </article>
                        ))}
                    </div>
                </section>

                <div className="ornamental-divider">
                    <span></span><div className="diamond"></div><span></span>
                </div>

                {/* ── NIGHTLY TRANSMISSION ── */}
                <section className="dispatch-section">
                    <div style={{
                        border: '1px solid rgba(162,36,36,0.3)',
                        background: 'linear-gradient(135deg, rgba(162,36,36,0.06) 0%, transparent 100%)',
                        padding: '3rem',
                        position: 'relative',
                        overflow: 'hidden',
                        marginBottom: '2rem',
                    }}>
                        {/* Decorative corner marks */}
                        <div className="dispatch-film-corner" style={{ position: 'absolute', top: '1rem', left: '1rem', width: 20, height: 20, borderTop: '2px solid rgba(162,36,36,0.5)', borderLeft: '2px solid rgba(162,36,36,0.5)' }} />
                        <div className="dispatch-film-corner" style={{ position: 'absolute', top: '1rem', right: '1rem', width: 20, height: 20, borderTop: '2px solid rgba(162,36,36,0.5)', borderRight: '2px solid rgba(162,36,36,0.5)' }} />
                        <div className="dispatch-film-corner" style={{ position: 'absolute', bottom: '1rem', left: '1rem', width: 20, height: 20, borderBottom: '2px solid rgba(162,36,36,0.5)', borderLeft: '2px solid rgba(162,36,36,0.5)' }} />
                        <div className="dispatch-film-corner" style={{ position: 'absolute', bottom: '1rem', right: '1rem', width: 20, height: 20, borderBottom: '2px solid rgba(162,36,36,0.5)', borderRight: '2px solid rgba(162,36,36,0.5)' }} />

                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.4em', color: 'var(--blood-reel)', marginBottom: '0.5rem', opacity: 0.8 }}>
                                ◉ TRANSMISSION INCOMING
                            </div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.3em', color: 'var(--sepia)', marginBottom: '1.5rem' }}>
                                THE SOCIETY PRESENTS — NIGHTLY TRANSMISSION №{String(Math.floor((Date.now() - new Date('2026-03-12T00:00:00Z').getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1).padStart(3, '0')}
                            </div>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 5vw, 3rem)', color: 'var(--parchment)', lineHeight: 1, marginBottom: '1rem', letterSpacing: '0.02em' }}>
                                To Be Announced
                            </h2>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '1.5rem' }}>
                                SELECTION DISCLOSED AT TRANSMISSION TIME
                            </div>
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '1.05rem', lineHeight: 1.7, color: 'var(--bone)', opacity: 0.75, maxWidth: 480, margin: '0 auto 2rem', fontStyle: 'italic' }}>
                                "Watch independently at the appointed hour. Return to The Reel to file your transmission alongside your fellow devotees."
                            </p>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--fog)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <span style={{ width: 6, height: 6, background: 'var(--blood-reel)', borderRadius: '50%' }} />
                                    WATCH INDEPENDENTLY — NO STREAMING REQUIRED
                                </div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--fog)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <span style={{ width: 6, height: 6, background: 'var(--sepia)', borderRadius: '50%' }} />
                                    JOIN THE REEL THREAD AT TRANSMISSION TIME
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="ornamental-divider">
                    <span></span><div className="diamond"></div><span></span>
                </div>

                {/* GLOBAL INDUSTRY WIRE (TMDB NEWS) */}

                <section className="dispatch-section">
                    <div className="section-header-block">
                        <h2 className="sh-title">The Global Wire</h2>
                        <p className="sh-sub">Decrypted signals from the worldwide movie industry.</p>
                    </div>

                    <div className="global-wire-list">
                        {loading ? (
                            <div className="wire-loader">Decrypting incoming signals...</div>
                        ) : (
                            news.map((item: any) => (
                                <article key={item.id} onClick={() => openArticle(item)} className="wire-item">
                                    <div className="wire-bullet"></div>
                                    <div className="wire-content">
                                        <h4 className="wire-title">{item.title}</h4>
                                        <p className="wire-excerpt">{item.excerpt}</p>
                                    </div>
                                </article>
                            ))
                        )}
                    </div>
                </section>

                {/* THE GOOFY EDITOR'S NOTE WITH BUSTER (Moved to Footer for cooler flow) */}
                <div className="dispatch-buster-note">
                    <div className="buster-avatar">
                        <Buster size={80} mood="peeking" />
                    </div>
                    <div className="note-text">
                        <div className="note-label">Archival Footnote:</div>
                        <p>"I know you're looking for the romantic comedies, but I hid them. We are only projecting German Expressionism tonight until morale improves."</p>
                    </div>
                </div>

                {/* FOOTER */}
                <footer className="dispatch-footer">
                    <div className="footer-mark">END OF TRANSMISSION</div>
                    <p>© 2026 The ReelHouse Society. Issued directly from the projection booth.</p>
                </footer>
            </div>

            {/* FULL ARTICLE OVERLAY (Cooler, more premium) */}
            <AnimatePresence>
                {selectedArticle && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="article-reader-overlay"
                    >
                        <motion.div
                            initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
                            className="article-reader-paper"
                        >
                            <button onClick={closeArticle} className="btn-close-reader">
                                <IconClose />
                            </button>
                            <div className="reader-watermark">REELHOUSE DIGITAL DOSSIER</div>

                            <header className="reader-head">
                                <h1 className="reader-title">{selectedArticle.title}</h1>
                                {selectedArticle.author && (
                                    <div className="reader-byline">
                                        FILED BY <span className="highlight-author">{selectedArticle.author.toUpperCase()}</span>
                                    </div>
                                )}
                            </header>

                            <div className="reader-body">
                                {selectedArticle.fullContent || selectedArticle.excerpt}
                            </div>

                            <div className="reader-endmark">■ ■ ■</div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* WRITE ESSAY PANEL (Slide-in from right, very premium) */}
            <AnimatePresence>
                {isWriting && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="writer-panel-overlay"
                    >
                        <motion.div
                            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="writer-panel"
                        >
                            <div className="wp-header">
                                <div className="wp-title">COMPOSE DOSSIER</div>
                                <button onClick={() => setIsWriting(false)} className="btn-close-wp"><IconClose /></button>
                            </div>

                            <div className="wp-canvas">
                                <input
                                    className="wp-input-title"
                                    placeholder="Enter your headline..."
                                    value={formValues.title}
                                    onChange={(e: any) => setFormValues({ ...formValues, title: e.target.value })}
                                />

                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                                    DOSSIER CONTENTS
                                </div>
                                <textarea
                                    className="input"
                                    placeholder="Type your dossier in Markdown. Italics, bold, and blockquotes supported."
                                    value={formValues.content}
                                    onChange={(e: any) => setFormValues({ ...formValues, content: e.target.value })}
                                />
                            </div>

                            <div className="wp-footer">
                                <button onClick={submitEssay} className="btn-publish-dossier">
                                    TRANSMIT TO NEWSLETTER <IconArrowRight />
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* WRITER FLOATING ACTION BUTTON */}
            <AnimatePresence>
                {canWrite && !isWriting && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8, y: 20 }}
                        className="auteur-fab-container"
                    >
                        <button onClick={() => setIsWriting(true)} className="auteur-fab-button">
                            <IconFeather /> FILE DOSSIER
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

        </motion.div>
    )
}
