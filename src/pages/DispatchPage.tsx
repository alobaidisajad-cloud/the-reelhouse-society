import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { tmdb } from '../tmdb'
import { useAuthStore, useDispatchStore } from '../store'
import { supabase } from '../supabaseClient'
import Buster from '../components/Buster'
import '../styles/dispatch.css'
import PageSEO from '../components/PageSEO'

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

/* ── NIGHTLY TRANSMISSION — Dynamic trending film pick ── */
function NightlyTransmission() {
    const { data: trending } = useQuery({
        queryKey: ['trending-dispatch'],
        queryFn: () => tmdb.trending('week'),
        staleTime: 1000 * 60 * 30,
    })

    // Deterministic daily pick — same film all day, rotates daily
    const daysSinceEpoch = Math.floor(Date.now() / (24 * 60 * 60 * 1000))
    const films = trending?.results || []
    const tonightFilm: any = films.length > 0 ? films[daysSinceEpoch % films.length] : null
    const transmissionNum = String(Math.floor((Date.now() - new Date('2026-03-12T00:00:00Z').getTime()) / (24 * 60 * 60 * 1000)) + 1).padStart(3, '0')

    return (
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
                    TONIGHT'S SCREENING — TRANSMISSION №{transmissionNum}
                </div>

                {tonightFilm ? (
                    <>
                        {tonightFilm.backdrop_path && (
                            <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${tmdb.backdrop(tonightFilm.backdrop_path, 'w780')})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.12, filter: 'sepia(0.4)', pointerEvents: 'none' }} />
                        )}
                        <Link to={`/film/${tonightFilm.id}`} style={{ textDecoration: 'none' }}>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 5vw, 3rem)', color: 'var(--parchment)', lineHeight: 1, marginBottom: '0.5rem', letterSpacing: '0.02em', position: 'relative' }}>
                                {tonightFilm.title?.toUpperCase()}
                            </h2>
                        </Link>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '1.5rem', position: 'relative' }}>
                            {tonightFilm.release_date?.slice(0, 4)} · {tonightFilm.vote_average?.toFixed(1)} ★
                        </div>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', lineHeight: 1.7, color: 'var(--bone)', opacity: 0.75, maxWidth: 480, margin: '0 auto 2rem', fontStyle: 'italic', position: 'relative' }}>
                            "{tonightFilm.overview?.slice(0, 150)}..."
                        </p>
                    </>
                ) : (
                    <>
                        <div className="shimmer" style={{ height: '2.5rem', width: '45%', margin: '0 auto 0.75rem', borderRadius: '2px' }} />
                        <div className="shimmer" style={{ height: '0.65rem', width: '20%', margin: '0 auto 1.5rem', borderRadius: '2px' }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
                            <div className="shimmer" style={{ height: '0.8rem', width: '55%', borderRadius: '2px' }} />
                            <div className="shimmer" style={{ height: '0.8rem', width: '40%', borderRadius: '2px' }} />
                        </div>
                    </>
                )}

                <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap', position: 'relative' }}>
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
    )
}

/* ── DAILY FRAME — A cinematic still that changes every day ── */
function DailyFrame() {
    const { data: trending } = useQuery({
        queryKey: ['trending-dispatch'],
        queryFn: () => tmdb.trending('week'),
        staleTime: 1000 * 60 * 30,
    })

    const daysSinceEpoch = Math.floor(Date.now() / (24 * 60 * 60 * 1000))
    const films = (trending?.results || []).filter((f: any) => f.backdrop_path)
    // Offset by 3 so it's a different film than NightlyTransmission
    const film: any = films.length > 0 ? films[(daysSinceEpoch + 3) % films.length] : null

    if (!film) return null

    return (
        <section className="dispatch-section" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="section-header-block" style={{ paddingBottom: '1rem' }}>
                <h2 className="sh-title">The Daily Frame</h2>
                <p className="sh-sub">Today's chosen still from the reels.</p>
            </div>
            <Link to={`/film/${film.id}`} style={{ textDecoration: 'none', display: 'block', position: 'relative', aspectRatio: '21/9', overflow: 'hidden', border: '1px solid rgba(139,105,20,0.2)' }}>
                <img
                    src={tmdb.backdrop(film.backdrop_path)}
                    alt={film.title || film.name}
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.35) contrast(1.1) brightness(0.9)' }}
                />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(10,7,3,0.95) 0%, rgba(10,7,3,0.3) 40%, transparent 100%)' }} />
                {/* Film grain */}
                <div className="scanlines" style={{ position: 'absolute', inset: 0, opacity: 0.15, pointerEvents: 'none' }} />
                {/* Caption */}
                <div style={{ position: 'absolute', bottom: '1.25rem', left: '1.5rem', right: '1.5rem', zIndex: 2 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.2rem, 3vw, 2rem)', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '0.35rem' }}>
                        {film.title || film.name}
                    </div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--sepia)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span>{(film.release_date || film.first_air_date)?.slice(0, 4)}</span>
                        <span>VIEW THIS FILM →</span>
                    </div>
                </div>
            </Link>
            <div className="ornamental-divider" style={{ marginTop: '2rem' }}>
                <span></span><div className="diamond"></div><span></span>
            </div>
        </section>
    )
}

export default function DispatchPage() {
    const navigate = useNavigate()
    const { user } = useAuthStore()
    const { dossiers, fetchDossiers } = useDispatchStore()
    const [news, setNews] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedArticle, setSelectedArticle] = useState<any>(null)

    const [currentPage, setCurrentPage] = useState(1)
    const DOSSIERS_PER_PAGE = 6

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

    const openArticle = async (item: any) => {
        scrollPos.current = window.scrollY
        setSelectedArticle(item)
        document.body.style.overflow = 'hidden'
        // Increment view count (fire-and-forget, seed articles skip)
        if (item.id && !item.id.startsWith('seed-')) {
            try { await supabase.rpc('increment_dossier_views', { dossier_uuid: item.id }) } catch {}
        }
    }
    const closeArticle = () => {
        setSelectedArticle(null)
        setCertified(false)
        document.body.style.overflow = 'unset'
        window.scrollTo(0, scrollPos.current)
    }

    // ── Certify state ──
    const [certified, setCertified] = useState(false)
    const [certifyLoading, setCertifyLoading] = useState(false)

    const handleCertify = async () => {
        if (!user || !selectedArticle?.id || selectedArticle.id.startsWith('seed-') || certifyLoading) return
        setCertifyLoading(true)
        try {
            const { data } = await supabase.rpc('toggle_dossier_certify', { dossier_uuid: selectedArticle.id })
            setCertified(!!data)
            toast(data ? 'Dossier Certified ✦' : 'Certification removed', { duration: 1500 })
        } catch { toast.error('Failed to certify') }
        setCertifyLoading(false)
    }

    const handleShare = () => {
        const url = `${window.location.origin}/dispatch`
        const text = `"${selectedArticle?.title}" — a dossier by @${selectedArticle?.authorUsername || selectedArticle?.author} on The Dispatch`
        if (navigator.share) {
            navigator.share({ title: selectedArticle?.title, text, url }).catch(() => {})
        } else {
            navigator.clipboard.writeText(`${text}\n${url}`)
            toast.success('Link copied to clipboard')
        }
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
                            onClick={() => navigate('/dispatch/compose')}
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

                {/* HEAD & MASTHEAD — Architectural Newspaper Header */}
                <header className="dispatch-masthead">
                    <div className="masthead-publisher">✦ THE REELHOUSE SOCIETY ✦</div>
                    <div className="masthead-rule-top" />
                    <h1 className="masthead-title">THE DISPATCH</h1>
                    <div className="masthead-rule-bottom" />
                    <div className="masthead-meta">
                        <span>VOL. {String(Math.floor((Date.now() - new Date('2026-03-12T00:00:00Z').getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1).padStart(3, '0')}</span>
                        <span className="pulse-dot"></span>
                        <span>EST. 1924</span>
                        <span className="pulse-dot"></span>
                        <span>{new Date().toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' }).toUpperCase()}</span>
                    </div>
                    <div className="masthead-subtitle">A journal of cinema — for those who see in the dark.</div>
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
                        {dossiers.slice((currentPage - 1) * DOSSIERS_PER_PAGE, currentPage * DOSSIERS_PER_PAGE).map((report: any) => (
                            <article key={report.id} onClick={() => openArticle(report)} className="dossier-card">
                                <div className="dossier-meta">
                                    <span className="dm-author">✦ BY {report.author.toUpperCase()}</span>
                                    <span className="dm-date">FILED {report.date}</span>
                                </div>
                                <h3 className="dossier-title">{report.title}</h3>
                                <p className="dossier-excerpt">
                                    {report.excerpt && <span className="dossier-drop-cap">{report.excerpt.charAt(0)}</span>}
                                    {report.excerpt?.slice(1)}
                                </p>
                                <div className="dossier-readmore">READ DOSSIER <IconArrowRight /></div>
                            </article>
                        ))}
                    </div>

                    {/* NEWSPAPER PAGINATION FOOTER */}
                    {dossiers.length > DOSSIERS_PER_PAGE && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2.5rem', borderTop: '1px solid rgba(139,105,20,0.3)', borderBottom: '1px solid rgba(139,105,20,0.3)', padding: '1rem 0' }}>
                            <button 
                               className="btn btn-ghost" 
                               disabled={currentPage === 1} 
                               onClick={() => { setCurrentPage(p => p - 1); window.scrollTo({ top: 300, behavior: 'smooth' }) }}
                               style={{ opacity: currentPage === 1 ? 0.3 : 1, fontSize: '0.65rem', color: 'var(--sepia)' }}
                            >
                                ← NEWER EDITIONS
                            </button>
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.15em', color: 'var(--bone)' }}>
                                PAGE {currentPage} OF {Math.ceil(dossiers.length / DOSSIERS_PER_PAGE)}
                            </span>
                            <button 
                               className="btn btn-ghost" 
                               disabled={currentPage === Math.ceil(dossiers.length / DOSSIERS_PER_PAGE)} 
                               onClick={() => { setCurrentPage(p => p + 1); window.scrollTo({ top: 300, behavior: 'smooth' }) }}
                               style={{ opacity: currentPage === Math.ceil(dossiers.length / DOSSIERS_PER_PAGE) ? 0.3 : 1, fontSize: '0.65rem', color: 'var(--sepia)' }}
                            >
                                ARCHIVES →
                            </button>
                        </div>
                    )}
                </section>

                <div className="ornamental-divider">
                    <span></span><div className="diamond"></div><span></span>
                </div>

                {/* ── NIGHTLY TRANSMISSION — Dynamic Trending Film ── */}
                <section className="dispatch-section">
                    <NightlyTransmission />
                </section>

                <div className="ornamental-divider">
                    <span></span><div className="diamond"></div><span></span>
                </div>

                {/* ── DAILY FRAME — A cinematic still that changes every day ── */}
                <DailyFrame />

                {/* GLOBAL INDUSTRY WIRE — Lead Story + Decoded Telegrams */}

                <section className="dispatch-section">
                    <div className="section-header-block">
                        <h2 className="sh-title">The Global Wire</h2>
                        <p className="sh-sub">Decoded signals from the worldwide cinema industry.</p>
                    </div>

                    {loading ? (
                        <div className="wire-loader">Decrypting incoming signals...</div>
                    ) : (
                        <>
                            {/* LEAD STORY — First wire item promoted to hero */}
                            {news[0] && (
                                <article className="wire-lead" onClick={() => openArticle(news[0])}>
                                    {news[0].image && (
                                        <div className="wire-lead-img-wrap">
                                            <img src={news[0].image} alt="" className="wire-lead-img" loading="lazy" />
                                        </div>
                                    )}
                                    <div className="wire-lead-body">
                                        <div className="wire-lead-category">[{news[0].category || 'WIRE'}]</div>
                                        <h3 className="wire-lead-title">{news[0].title}</h3>
                                        <p className="wire-lead-excerpt">{news[0].excerpt}</p>
                                        <div className="wire-lead-meta">
                                            {news[0].date} · {news[0].time} · BY {(news[0].author || 'THE ORACLE').toUpperCase()}
                                        </div>
                                    </div>
                                </article>
                            )}

                            {/* REMAINING WIRE — Telegram format */}
                            <div className="global-wire-list">
                                {news.slice(1).map((item: any) => (
                                    <article key={item.id} onClick={() => openArticle(item)} className="wire-item">
                                        <div className="wire-content">
                                            <div className="wire-category">[{item.category || 'WIRE'}]</div>
                                            <h4 className="wire-title">{item.title}</h4>
                                            <p className="wire-excerpt">{item.excerpt}</p>
                                            <div className="wire-meta">
                                                {item.date} · {item.time} · BY {(item.author || 'THE ORACLE').toUpperCase()}
                                            </div>
                                        </div>
                                        {item.image && <img src={item.image} alt="" className="wire-thumb" loading="lazy" />}
                                    </article>
                                ))}
                            </div>
                        </>
                    )}
                </section>

                {/* THE GOOFY EDITOR'S NOTE WITH BUSTER (Moved to Footer for cooler flow) */}
                <div className="dispatch-buster-note">
                    <div className="buster-avatar">
                        <Buster size={80} mood="peeking" />
                    </div>
                    <div className="note-text">
                        <div className="note-label">FROM THE EDITOR'S DESK</div>
                        <p>"I know you're looking for the romantic comedies, but I hid them. We are only projecting German Expressionism tonight until morale improves."</p>
                    </div>
                </div>

                {/* FOOTER — Heritage Stamp */}
                <footer className="dispatch-footer">
                    <div className="ornamental-divider" style={{ maxWidth: 200, margin: '0 auto 2rem' }}>
                        <span></span><div className="diamond"></div><span></span>
                    </div>
                    <div className="footer-mark">END OF TRANSMISSION</div>
                    <div className="footer-heritage">EST. 1924 — PRINTED FROM THE PROJECTION BOOTH</div>
                    <p>© 1924–2026 The ReelHouse Society. All dispatches are classified.</p>
                </footer>
            </div>

            {/* FULL ARTICLE OVERLAY — Portal to body to escape stacking context */}
            {createPortal(
                <AnimatePresence>
                    {selectedArticle && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="article-reader-overlay"
                            onClick={closeArticle}
                        >
                            <motion.div
                                initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
                                className="article-reader-paper"
                                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            >
                                <button onClick={closeArticle} className="btn-close-reader">
                                    <IconClose />
                                </button>
                                <div className="reader-watermark">REELHOUSE DIGITAL DOSSIER</div>

                                <header className="reader-head">
                                    <h1 className="reader-title">{selectedArticle.title}</h1>
                                    {selectedArticle.author && (
                                        <div className="reader-byline">
                                            FILED BY{' '}
                                            {selectedArticle.authorUsername ? (
                                                <Link
                                                    to={`/user/${selectedArticle.authorUsername}`}
                                                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); closeArticle() }}
                                                    style={{ color: 'var(--sepia)', textDecoration: 'none', borderBottom: '1px solid rgba(139,105,20,0.4)', transition: 'color 0.2s' }}
                                                    onMouseEnter={(e: any) => e.currentTarget.style.color = 'var(--parchment)'}
                                                    onMouseLeave={(e: any) => e.currentTarget.style.color = 'var(--sepia)'}
                                                >
                                                    @{selectedArticle.author}
                                                </Link>
                                            ) : (
                                                <span className="highlight-author">{selectedArticle.author}</span>
                                            )}
                                            {selectedArticle.date && (
                                                <span style={{ marginLeft: '1rem', color: 'var(--fog)', fontSize: '0.65rem' }}>{selectedArticle.date}</span>
                                            )}
                                        </div>
                                    )}

                                    {/* Engagement stats bar */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px dashed rgba(139,105,20,0.15)', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                            {(selectedArticle.views || 0) + 1} VIEWS
                                        </span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: certified ? 'var(--sepia)' : 'var(--fog)' }}>
                                            ✦ {selectedArticle.certifyCount || 0} CERTIFIED
                                        </span>
                                    </div>
                                </header>

                                <div className="reader-body">
                                    {selectedArticle.fullContent || selectedArticle.excerpt}
                                </div>

                                {/* ── Engagement Footer ── */}
                                <div style={{ borderTop: '1px solid rgba(139,105,20,0.15)', paddingTop: '1.5rem', marginTop: '2rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
                                    {/* Certify Button */}
                                    {user && (
                                        <button
                                            onClick={handleCertify}
                                            disabled={certifyLoading}
                                            style={{
                                                background: certified ? 'linear-gradient(135deg, rgba(139,105,20,0.25), rgba(180,140,20,0.15))' : 'transparent',
                                                border: `1px solid ${certified ? 'rgba(196,150,26,0.5)' : 'rgba(139,105,20,0.25)'}`,
                                                color: certified ? 'var(--sepia)' : 'var(--fog)',
                                                fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em',
                                                padding: '0.6rem 1.5rem', cursor: 'pointer',
                                                transition: 'all 0.3s', display: 'flex', alignItems: 'center', gap: '0.5rem',
                                            }}
                                            onMouseEnter={(e: any) => { if (!certified) e.currentTarget.style.borderColor = 'rgba(196,150,26,0.5)' }}
                                            onMouseLeave={(e: any) => { if (!certified) e.currentTarget.style.borderColor = 'rgba(139,105,20,0.25)' }}
                                        >
                                            ✦ {certified ? 'CERTIFIED' : 'CERTIFY'}
                                        </button>
                                    )}

                                    {/* Share Button */}
                                    <button
                                        onClick={handleShare}
                                        style={{
                                            background: 'transparent',
                                            border: '1px solid rgba(139,105,20,0.25)',
                                            color: 'var(--fog)',
                                            fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em',
                                            padding: '0.6rem 1.5rem', cursor: 'pointer',
                                            transition: 'all 0.3s', display: 'flex', alignItems: 'center', gap: '0.5rem',
                                        }}
                                        onMouseEnter={(e: any) => e.currentTarget.style.borderColor = 'rgba(196,150,26,0.5)'}
                                        onMouseLeave={(e: any) => e.currentTarget.style.borderColor = 'rgba(139,105,20,0.25)'}
                                    >
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                                        SHARE
                                    </button>
                                </div>

                                <div className="reader-endmark">— ✦ —</div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* WRITER FLOATING ACTION BUTTON */}
            <AnimatePresence>
                {canWrite && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8, y: 20 }}
                        className="auteur-fab-container"
                    >
                        <button onClick={() => navigate('/dispatch/compose')} className="auteur-fab-button">
                            <IconFeather /> FILE DOSSIER
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

        </motion.div>
    )
}
