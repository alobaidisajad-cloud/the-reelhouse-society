import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState, useRef } from 'react'
import { tmdb } from '../tmdb'
import { useAuthStore, useDispatchStore } from '../store'
import Buster from '../components/Buster'

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
    const { dossiers, addDossier } = useDispatchStore()
    const [news, setNews] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedArticle, setSelectedArticle] = useState(null)
    const [isWriting, setIsWriting] = useState(false)
    const [formValues, setFormValues] = useState({ title: '', content: '' })

    const scrollPos = useRef(0)
    const canWrite = user?.role === 'auteur' || user?.username === 'OMEN'

    useEffect(() => {
        const fetchNews = async () => {
            setLoading(true)
            try {
                const items = await tmdb.getNews()
                setNews(items.slice(0, 10))
            } catch (e) {
                console.error(e)
            }
            setLoading(false)
        }
        fetchNews()
    }, [])

    const openArticle = (item) => {
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
                        <span>VOL. 084</span>
                        <span className="pulse-dot"></span>
                        <span>MARCH 07, 2026</span>
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
                        {dossiers.map((report) => (
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
                                ◉ THIS SATURDAY · 9PM GMT
                            </div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.3em', color: 'var(--sepia)', marginBottom: '1.5rem' }}>
                                THE SOCIETY PRESENTS — NIGHTLY TRANSMISSION №012
                            </div>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 5vw, 3.5rem)', color: 'var(--parchment)', lineHeight: 1, marginBottom: '1rem' }}>
                                Andrei Rublev
                            </h2>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '1.5rem' }}>
                                TARKOVSKY · 1966 · 205 MIN
                            </div>
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '1.05rem', lineHeight: 1.7, color: 'var(--bone)', opacity: 0.75, maxWidth: 480, margin: '0 auto 2rem', fontStyle: 'italic' }}>
                                "Watch independently at the appointed hour. Return to The Reel at 9PM to file your transmission alongside your fellow devotees."
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
                            news.map((item) => (
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
                                    onChange={e => setFormValues({ ...formValues, title: e.target.value })}
                                />
                                <div className="wp-divider"></div>
                                <textarea
                                    className="wp-input-body"
                                    placeholder="Transmit your cinematic thoughts to The ReelHouse Society..."
                                    value={formValues.content}
                                    onChange={e => setFormValues({ ...formValues, content: e.target.value })}
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

            <style>{`
                /* ── COOL, REFINED NEWSLETTER AESTHETIC (Zero Lag) ── */
                .dispatch-newsletter-root {
                    background: var(--ink); /* Very dark background */
                    min-height: 100vh;
                    padding-top: 80px;
                    padding-bottom: 120px;
                    font-family: var(--font-body);
                    color: var(--bone);
                    position: relative;
                }

                /* Performant background glow instead of heavy image texture */
                .dispatch-bg-noise {
                    position: fixed; inset: 0; pointer-events: none; z-index: 0;
                    background: radial-gradient(circle at 50% 0%, rgba(139, 105, 20, 0.05) 0%, transparent 70%);
                }

                /* WRITER BAR AT TOP */
                .dispatch-writer-bar {
                    position: fixed; top: 70px; left: 0; right: 0;
                    background: var(--ink);
                    border-bottom: 1px solid rgba(139,105,20,0.15);
                    z-index: 50;
                }
                .wb-content {
                    max-width: 720px; margin: 0 auto; padding: 1rem 2rem;
                    display: flex; justify-content: space-between; align-items: center;
                    flex-wrap: wrap; gap: 0.5rem;
                }
                @media (max-width: 600px) {
                    .wb-content { flex-direction: column; align-items: flex-start; padding: 0.75rem 1.25rem; gap: 0.6rem; }
                }
                .wb-logo { font-family: var(--font-display); font-size: 1.2rem; color: var(--parchment); letter-spacing: 0.1em; }
                .btn-write-transmission {
                    background: var(--parchment); color: var(--ink); border: none;
                    display: flex; align-items: center; gap: 0.6rem;
                    padding: 0.6rem 1.2rem; border-radius: 2px;
                    font-family: var(--font-ui); font-size: 0.75rem; font-weight: bold; letter-spacing: 0.1em;
                    cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;
                }
                .btn-write-transmission:hover { transform: translateY(-2px); box-shadow: 0 4px 15px rgba(232,223,200,0.2); }
                .wb-locked { font-family: var(--font-ui); font-size: 0.7rem; color: var(--sepia); letter-spacing: 0.1em; opacity: 0.6; }

                /* THE REFINED EMAIL DOCUMENT */
                .dispatch-document {
                    background: #110e0c; /* Deep, rich dark paper */
                    max-width: 720px; /* Perfect reading width */
                    margin: 4rem auto 0;
                    padding: 5rem 4rem;
                    border: 1px solid rgba(139,105,20,0.15);
                    border-radius: 4px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.5); /* Lighter shadow for performance */
                    position: relative; z-index: 10;
                }
                @media (max-width: 768px) {
                    .dispatch-document { margin: 2rem 1rem 0; padding: 3rem 1.5rem; }
                }

                /* MASTHEAD */
                .dispatch-masthead { text-align: center; margin-bottom: 4rem; position: relative; }
                .masthead-meta { 
                    display: flex; justify-content: center; align-items: center; gap: 1rem; 
                    font-family: var(--font-ui); font-size: 0.7rem; color: var(--sepia); letter-spacing: 0.3em; margin-bottom: 2rem; 
                }
                .pulse-dot { width: 4px; height: 4px; background: var(--blood-reel); border-radius: 50%; opacity: 0.8; }
                .masthead-title { 
                    font-family: var(--font-display); font-size: clamp(3.5rem, 8vw, 6rem); 
                    color: var(--parchment); line-height: 0.85; margin-bottom: 1.5rem; 
                }
                .masthead-subtitle { font-family: var(--font-ui); font-size: 0.85rem; color: var(--sepia); opacity: 0.7; letter-spacing: 0.2em; text-transform: uppercase; }

                /* ORNAMENTAL DIVIDER */
                .ornamental-divider { display: flex; align-items: center; gap: 1rem; margin: 4rem 0; opacity: 0.3; }
                .ornamental-divider span { flex: 1; height: 1px; background: var(--sepia); }
                .ornamental-divider .diamond { width: 6px; height: 6px; background: var(--sepia); transform: rotate(45deg); }

                /* SECTION HEADERS */
                .section-header-block { text-align: center; margin-bottom: 3.5rem; }
                .sh-title { font-family: var(--font-display); font-size: 2.8rem; color: var(--parchment); margin-bottom: 0.5rem; }
                .sh-sub { font-family: var(--font-ui); font-size: 0.8rem; letter-spacing: 0.1em; color: var(--sepia); opacity: 0.7; }

                /* AUTEUR DOSSIERS */
                .auteur-dossier-list { display: flex; flex-direction: column; gap: 3rem; }
                .dossier-card {
                    padding: 2.5rem; background: rgba(255,255,255,0.015); border: 1px solid rgba(255,255,255,0.05);
                    border-radius: 2px; cursor: pointer; transition: background 0.2s, transform 0.2s; position: relative;
                }
                .dossier-card::before { content: ''; position: absolute; left: -1px; top: -1px; bottom: -1px; width: 3px; background: var(--sepia); transform: scaleY(0); transition: transform 0.2s transform-origin: top; }
                .dossier-card:hover { background: rgba(255,255,255,0.03); transform: translateX(5px); }
                .dossier-card:hover::before { transform: scaleY(1); }
                
                .dossier-meta { display: flex; justify-content: space-between; font-family: var(--font-ui); font-size: 0.65rem; color: var(--sepia); letter-spacing: 0.2rem; margin-bottom: 1.5rem; }
                .dossier-title { font-family: var(--font-display); font-size: 2.2rem; color: var(--parchment); line-height: 1.1; margin-bottom: 1rem; }
                .dossier-excerpt { font-size: 1.15rem; line-height: 1.6; color: var(--bone); opacity: 0.7; margin-bottom: 2rem; }
                .dossier-readmore { display: flex; align-items: center; gap: 0.5rem; font-family: var(--font-ui); font-size: 0.75rem; font-weight: bold; color: var(--parchment); letter-spacing: 0.1em; transition: color 0.2s; }
                .dossier-card:hover .dossier-readmore { color: var(--sepia); }

                /* GLOBAL WIRE */
                .global-wire-list { display: flex; flex-direction: column; gap: 2rem; }
                .wire-item { display: flex; align-items: flex-start; gap: 1.5rem; padding-bottom: 2rem; border-bottom: 1px dotted rgba(255,255,255,0.1); cursor: pointer; transition: opacity 0.2s; }
                .wire-item:last-child { border-bottom: none; }
                .wire-item:hover { opacity: 0.6; }
                .wire-bullet { width: 5px; height: 5px; background: var(--sepia); border-radius: 50%; margin-top: 0.6rem; opacity: 0.5; flex-shrink: 0; }
                .wire-title { font-family: var(--font-display); font-size: 1.6rem; color: var(--parchment); margin-bottom: 0.5rem; }
                .wire-excerpt { font-size: 1.05rem; line-height: 1.5; color: var(--bone); opacity: 0.6; }
                .wire-loader { text-align: center; color: var(--sepia); font-family: var(--font-ui); font-size: 0.8rem; letter-spacing: 0.2em; opacity: 0.5; padding: 3rem 0; }

                /* BUSTER FOOTNOTE (Cleaner integration) */
                .dispatch-buster-note {
                    display: flex; align-items: center; gap: 2rem;
                    border-top: 1px solid rgba(139,105,20,0.15);
                    border-bottom: 1px solid rgba(139,105,20,0.15);
                    padding: 3rem 0; margin-top: 6rem;
                }
                .buster-avatar { flex-shrink: 0; opacity: 0.8; }
                .note-label { font-family: var(--font-ui); font-size: 0.75rem; letter-spacing: 0.2em; color: var(--sepia); margin-bottom: 0.5rem; text-transform: uppercase; }
                .note-text p { font-size: 1.05rem; line-height: 1.6; color: var(--bone); font-style: italic; opacity: 0.7; }
                @media (max-width: 600px) {
                    .dispatch-buster-note { flex-direction: column; text-align: center; padding: 2rem 1.5rem; }
                }

                /* FOOTER */
                .dispatch-footer { text-align: center; margin-top: 4rem; }
                .footer-mark { font-family: var(--font-ui); font-size: 0.7rem; letter-spacing: 0.4em; color: var(--sepia); margin-bottom: 1rem; opacity: 0.5; }
                .dispatch-footer p { font-size: 0.85rem; color: var(--bone); opacity: 0.3; }

                /* ── COOL OVERLAY READER ── */
                .article-reader-overlay {
                    position: fixed; inset: 0; z-index: 8000;
                    background: rgba(5,3,1,0.95); backdrop-filter: blur(8px);
                    display: flex; justify-content: center; padding: 2rem 1rem;
                    overflow-y: auto;
                }
                .article-reader-paper {
                    background: #110e0c; max-width: 720px; width: 100%;
                    margin: auto; padding: 5rem 4rem; position: relative;
                    border: 1px solid rgba(139,105,20,0.15); border-radius: 4px;
                }
                @media (max-width: 768px) { .article-reader-paper { padding: 4rem 2rem; } }
                .btn-close-reader { position: absolute; top: 1.5rem; right: 1.5rem; background: none; border: none; color: var(--sepia); opacity: 0.6; cursor: pointer; transition: opacity 0.2s, transform 0.2s; }
                .btn-close-reader:hover { opacity: 1; transform: scale(1.1); }
                
                .reader-watermark { font-family: var(--font-ui); font-size: 0.6rem; color: var(--sepia); letter-spacing: 0.4em; opacity: 0.4; margin-bottom: 4rem; text-align: center; }
                .reader-head { text-align: center; margin-bottom: 4rem; }
                .reader-title { font-family: var(--font-display); font-size: clamp(2.5rem, 6vw, 4.5rem); color: var(--parchment); line-height: 0.9; margin-bottom: 2rem; }
                .reader-byline { font-family: var(--font-ui); font-size: 0.75rem; color: var(--bone); letter-spacing: 0.2em; opacity: 0.6; }
                .highlight-author { color: var(--sepia); font-weight: bold; }
                
                .reader-body { font-size: 1.3rem; line-height: 1.8; color: var(--bone); white-space: pre-wrap; margin-bottom: 5rem; }
                .reader-endmark { text-align: center; color: var(--sepia); opacity: 0.3; font-size: 0.8rem; letter-spacing: 0.5em; }

                /* ── PREMIUM WRITE PANEL ── */
                .writer-panel-overlay {
                    position: fixed; inset: 0; z-index: 9000;
                    background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
                    display: flex; justify-content: flex-end;
                }
                .writer-panel {
                    background: #15120f; width: 100%; max-width: 600px; height: 100%;
                    border-left: 1px solid rgba(139,105,20,0.2);
                    display: flex; flex-direction: column;
                }
                .wp-header {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 2rem; border-bottom: 1px solid rgba(255,255,255,0.05);
                }
                .wp-title { font-family: var(--font-ui); font-size: 0.8rem; letter-spacing: 0.3em; color: var(--sepia); font-weight: bold; }
                .btn-close-wp { background: none; border: none; color: var(--bone); opacity: 0.5; cursor: pointer; }
                .btn-close-wp:hover { opacity: 1; }
                
                .wp-canvas { padding: 3rem 2rem; flex: 1; display: flex; flex-direction: column; overflow-y: auto; }
                .wp-input-title { background: none; border: none; font-family: var(--font-display); font-size: 2.5rem; color: var(--parchment); outline: none; line-height: 1.2; }
                .wp-input-title::placeholder { color: rgba(255,255,255,0.15); }
                .wp-divider { height: 1px; background: rgba(139,105,20,0.3); margin: 2rem 0; width: 60px; }
                .wp-input-body { flex: 1; background: none; border: none; font-family: var(--font-body); font-size: 1.2rem; line-height: 1.7; color: var(--bone); outline: none; resize: none; min-height: 300px; }
                .wp-input-body::placeholder { color: rgba(255,255,255,0.15); font-style: italic; }
                
                .wp-footer { padding: 2rem; border-top: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.2); }
                .btn-publish-dossier {
                    width: 100%; display: flex; justify-content: center; align-items: center; gap: 1rem;
                    background: var(--sepia); color: var(--ink); border: none;
                    padding: 1.2rem; font-family: var(--font-ui); font-size: 0.85rem; font-weight: bold; letter-spacing: 0.2em;
                    cursor: pointer; border-radius: 2px; transition: filter 0.2s;
                }
                .btn-publish-dossier:hover { filter: brightness(1.15); }

                /* ── AUTEUR FLOATING ACTION BUTTON ── */
                .auteur-fab-container {
                    position: fixed; bottom: 2rem; right: 2rem; z-index: 100;
                }
                .auteur-fab-button {
                    background: var(--sepia); color: var(--ink); border: none;
                    display: flex; align-items: center; gap: 0.8rem;
                    padding: 1rem 1.5rem; border-radius: 40px;
                    font-family: var(--font-ui); font-size: 0.85rem; font-weight: bold; letter-spacing: 0.15em;
                    cursor: pointer; box-shadow: 0 10px 30px rgba(139,105,20,0.3);
                    transition: transform 0.2s, filter 0.2s, box-shadow 0.2s;
                }
                .auteur-fab-button:hover {
                    transform: translateY(-4px); filter: brightness(1.1);
                    box-shadow: 0 15px 40px rgba(139,105,20,0.5);
                }
                @media (max-width: 768px) {
                    .auteur-fab-container { bottom: 1.5rem; right: 1.5rem; }
                    .auteur-fab-button { padding: 0.8rem 1.2rem; font-size: 0.75rem; }
                }
            `}</style>
        </motion.div>
    )
}
