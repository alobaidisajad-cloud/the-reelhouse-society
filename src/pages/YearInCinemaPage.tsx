import { useState, useEffect, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useFilmStore, useAuthStore } from '../store'
import { tmdb } from '../tmdb'
import { Film, ArrowLeft, Share2 } from 'lucide-react'
import toast from 'react-hot-toast'
import '../styles/year-in-cinema.css'
import PageSEO from '../components/PageSEO'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function useInView(ref: any) {
    const [visible, setVisible] = useState(false)
    useEffect(() => {
        if (!ref.current) return
        const obs = new IntersectionObserver(([e]: any) => {
            if (e.isIntersecting) { setVisible(true); obs.disconnect() }
        }, { threshold: 0.15 })
        obs.observe(ref.current)
        return () => obs.disconnect()
    }, [ref])
    return visible
}

function Section({ children, className = '' }: any) {
    const ref = useRef(null)
    const visible = useInView(ref)
    return (
        <div ref={ref} className={`yic-section ${visible ? 'yic-visible' : ''} ${className}`}>
            {children}
        </div>
    )
}

export default function YearInCinemaPage() {
    const { logs } = useFilmStore()
    const { user } = useAuthStore()

    // Available years from logs
    const availableYears = useMemo(() => {
        const years = new Set<number>()
        logs.forEach((l: any) => {
            const d = l.loggedAt || l.created_at
            if (d) years.add(new Date(d).getFullYear())
        })
        return [...years].sort((a, b) => b - a)
    }, [logs])

    const [selectedYear, setSelectedYear] = useState(() => {
        const current = new Date().getFullYear()
        return availableYears.includes(current) ? current : availableYears[0] || current
    })

    // Filter logs for the selected year
    const yearLogs = useMemo(() => {
        return logs.filter((l: any) => {
            const d = l.loggedAt || l.created_at
            return d && new Date(d).getFullYear() === selectedYear
        }).sort((a: any, b: any) => new Date(a.loggedAt || a.created_at).getTime() - new Date(b.loggedAt || b.created_at).getTime())
    }, [logs, selectedYear])

    // ─── COMPUTED STATS ───

    const totalFilms = yearLogs.length
    const totalHours = useMemo(() => {
        return Math.round(yearLogs.reduce((sum: any, l: any) => sum + (l.runtime || 110), 0) / 60)
    }, [yearLogs])

    // Monthly breakdown
    const monthlyData = useMemo(() => {
        const counts = Array(12).fill(0)
        yearLogs.forEach((l: any) => {
            const d = l.loggedAt || l.created_at
            if (d) counts[new Date(d).getMonth()]++
        })
        return counts
    }, [yearLogs])
    const maxMonth = Math.max(...monthlyData, 1)
    const busiestMonthIdx = monthlyData.indexOf(Math.max(...monthlyData))

    // Top directors
    const topDirectors = useMemo(() => {
        const map: any = {}
        yearLogs.forEach((l: any) => {
            const dir = l.director || l.directors
            if (typeof dir === 'string' && dir) {
                map[dir] = (map[dir] || 0) + 1
            } else if (Array.isArray(dir)) {
                dir.forEach((d: any) => { if (d) map[d] = (map[d] || 0) + 1 })
            }
        })
        return Object.entries(map).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5)
    }, [yearLogs])

    // Decade distribution
    const decadeData = useMemo(() => {
        const map: any = {}
        yearLogs.forEach((l: any) => {
            const y = l.year || (l.release_date && new Date(l.release_date).getFullYear())
            if (y) {
                const decade = `${Math.floor(y / 10) * 10}s`
                map[decade] = (map[decade] || 0) + 1
            }
        })
        return Object.entries(map).sort((a: any, b: any) => a[0].localeCompare(b[0]))
    }, [yearLogs])

    // Rating stats
    const ratingStats = useMemo(() => {
        const rated = yearLogs.filter((l: any) => l.rating && l.rating > 0)
        if (rated.length === 0) return { avg: 0, highest: null, lowest: null }
        const avg = rated.reduce((s: any, l: any) => s + l.rating, 0) / rated.length
        const sorted = [...rated].sort((a: any, b: any) => b.rating - a.rating)
        return { avg: avg.toFixed(1), highest: sorted[0], lowest: sorted[sorted.length - 1] }
    }, [yearLogs])

    // Obscurity index
    const obscurityStats = useMemo(() => {
        const scored = yearLogs.filter((l: any) => l.popularity != null)
        if (scored.length === 0) return { avg: 50, mostObscure: null }
        const scores = scored.map((l: any) => {
            const pop = l.popularity || 0
            if (pop <= 0) return 99
            return Math.max(2, Math.min(99, Math.round(100 - (Math.log10(Math.max(pop, 1)) / Math.log10(5000)) * 98)))
        })
        const avg = Math.round(scores.reduce((s: any, v: any) => s + v, 0) / scores.length)
        const maxIdx = scores.indexOf(Math.max(...scores))
        return { avg, mostObscure: scored[maxIdx] }
    }, [yearLogs])

    // Genre map
    const genreData = useMemo(() => {
        const map: any = {}
        yearLogs.forEach((l: any) => {
            const genres = l.genres || l.genre_ids
            if (Array.isArray(genres)) {
                genres.forEach((g: any) => {
                    const name = typeof g === 'object' ? g.name : g
                    if (name) map[name] = (map[name] || 0) + 1
                })
            }
        })
        const sorted = Object.entries(map).sort((a: any, b: any) => (b[1] as number) - (a[1] as number)).slice(0, 6)
        const total = sorted.reduce((s: any, [, c]: any) => s + c, 0)
        return sorted.map(([name, count]: any) => ({ name, count, pct: Math.round((count / total) * 100) }))
    }, [yearLogs])

    // First & Last
    const firstLog = yearLogs[0]
    const lastLog = yearLogs[yearLogs.length - 1]

    // Favorite (highest rated)
    const favorite = ratingStats.highest

    const [sharing, setSharing] = useState(false)
    const shareYIC = async () => {
        setSharing(true)
        try {
            // Wait for display:flex to mount the hidden node
            await new Promise(r => setTimeout(r, 100))
            const el = document.getElementById('yic-export-node') as HTMLElement
            if (!el) return
            const html2canvas = (await import('html2canvas')).default
            const canvas = await html2canvas(el, { backgroundColor: '#0A0703', scale: 2, useCORS: true })
            canvas.toBlob(async (blob: Blob | null) => {
                if (!blob) return
                const file = new File([blob], `reelhouse-${selectedYear}.png`, { type: 'image/png' })
                if (navigator.share && navigator.canShare?.({ files: [file] })) {
                    await navigator.share({ files: [file], title: `My ${selectedYear} Year In Cinema` })
                } else {
                    const a = document.createElement('a')
                    a.href = URL.createObjectURL(blob)
                    a.download = `reelhouse-${selectedYear}.png`
                    a.click()
                    URL.revokeObjectURL(a.href)
                    toast.success('Year In Cinema card saved!')
                }
            }, 'image/png')
        } catch { toast.error('Could not generate share card.') }
        finally { setSharing(false) }
    }

    if (totalFilms < 10) {
        const progress = Math.round((totalFilms / 10) * 100)
        return (
            <div className="yic-page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', textAlign: 'center', padding: '2rem' }}>
                <Film size={48} style={{ color: 'var(--sepia)', marginBottom: '1.5rem', opacity: 0.5 }} />
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--parchment)', marginBottom: '1rem' }}>Your Retrospective Awaits</h2>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '1rem', color: 'var(--bone)', maxWidth: 400, lineHeight: 1.6, fontStyle: 'italic', marginBottom: '2rem' }}>
                    Log {10 - totalFilms} more film{10 - totalFilms !== 1 ? 's' : ''} to unlock your annual cinematic retrospective. Every great year deserves at least 10 entries.
                </p>
                <div style={{ width: '100%', maxWidth: 320, height: 6, background: 'var(--ash)', borderRadius: 3, overflow: 'hidden', marginBottom: '0.75rem' }}>
                    <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, var(--sepia), var(--flicker))', borderRadius: 3, transition: 'width 0.5s ease' }} />
                </div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--fog)', marginBottom: '2rem' }}>
                    {totalFilms}/10 FILMS LOGGED
                </div>
                <Link to={user ? `/user/${user.username}` : '/'} className="btn btn-ghost" style={{ fontSize: '0.65rem', letterSpacing: '0.15em' }}>
                    <ArrowLeft size={14} /> RETURN TO PROFILE
                </Link>
            </div>
        )
    }

    return (
        <div className="yic-page">
            {/* ────── I. THE OPENING TITLE ────── */}
            <Section className="yic-hero">
                <div className="yic-eyebrow">YOUR YEAR IN CINEMA</div>

                {availableYears.length > 1 && (
                    <select
                        className="yic-year-select"
                        value={selectedYear}
                        onChange={e => setSelectedYear(Number(e.target.value))}
                        style={{ marginBottom: '1rem' }}
                    >
                        {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                )}

                <div className="yic-year">{selectedYear}</div>
                <div className="yic-subtitle">
                    A year of devotion, distilled into data. Every frame you've witnessed, catalogued for eternity.
                </div>

                <div className="yic-hero-stats">
                    <div className="yic-hero-stat">
                        <span className="yic-hero-stat-value">{totalFilms}</span>
                        <span className="yic-hero-stat-label">FILMS LOGGED</span>
                    </div>
                    <div className="yic-hero-stat">
                        <span className="yic-hero-stat-value">{totalHours}</span>
                        <span className="yic-hero-stat-label">HOURS WATCHED</span>
                    </div>
                    <div className="yic-hero-stat">
                        <span className="yic-hero-stat-value">{ratingStats.avg || '—'}</span>
                        <span className="yic-hero-stat-label">AVG RATING</span>
                    </div>
                </div>
            </Section>

            {/* ────── II. THE REEL COUNT ────── */}
            <Section>
                <div className="yic-section-number">II</div>
                <div className="yic-section-title">The Reel Count</div>
                <div className="yic-section-desc">
                    Your viewing rhythm across the calendar. {monthlyData[busiestMonthIdx] > 0 && `${MONTH_FULL[busiestMonthIdx]} was your most prolific month with ${monthlyData[busiestMonthIdx]} films.`}
                </div>

                <div className="yic-months">
                    {monthlyData.map((count, i) => (
                        <div key={i} className="yic-month-bar">
                            <div className="yic-month-count">{count || ''}</div>
                            <div className="yic-month-fill" style={{ height: `${(count / maxMonth) * 100}%` }} />
                            <div className="yic-month-label">{MONTHS[i]}</div>
                        </div>
                    ))}
                </div>
            </Section>

            {/* ────── III. THE AUTEUR'S EYE ────── */}
            {topDirectors.length > 0 && (
                <Section>
                    <div className="yic-section-number">III</div>
                    <div className="yic-section-title">The Auteur's Eye</div>
                    <div className="yic-section-desc">The directors who shaped your year.</div>

                    <div className="yic-directors">
                        {topDirectors.map(([name, count], i) => (
                            <div key={name} className="yic-director">
                                <div className="yic-director-rank">{i + 1}</div>
                                <div className="yic-director-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(name)}</div>
                                <div className="yic-director-count">{String(count)} {Number(count) === 1 ? 'FILM' : 'FILMS'}</div>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* ────── IV. THE TIME MACHINE ────── */}
            {decadeData.length > 0 && (
                <Section>
                    <div className="yic-section-number">IV</div>
                    <div className="yic-section-title">The Time Machine</div>
                    <div className="yic-section-desc">The eras you drifted through.</div>

                    <div className="yic-decades">
                        {decadeData.map(([decade, count]) => (
                            <div key={decade} className="yic-decade">
                                <span className="yic-decade-label">{String(decade)}</span>
                                <span className="yic-decade-count">{String(count)}</span>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* ────── V. THE VERDICT ────── */}
            {ratingStats.highest && (
                <Section>
                    <div className="yic-section-number">V</div>
                    <div className="yic-section-title">The Verdict</div>
                    <div className="yic-section-desc">Your critical lens, quantified.</div>

                    <div className="yic-rating-row">
                        <div className="yic-rating-box">
                            <div className="yic-rating-box-value">{ratingStats.avg}</div>
                            <div className="yic-rating-box-label">AVERAGE RATING</div>
                        </div>
                        <div className="yic-rating-box">
                            <div className="yic-rating-box-value">{ratingStats.highest.rating}</div>
                            <div className="yic-rating-box-label">HIGHEST RATED</div>
                            <div className="yic-rating-box-film">{ratingStats.highest.title}</div>
                        </div>
                        {ratingStats.lowest && ratingStats.lowest.id !== ratingStats.highest.id && (
                            <div className="yic-rating-box">
                                <div className="yic-rating-box-value">{ratingStats.lowest.rating}</div>
                                <div className="yic-rating-box-label">LOWEST RATED</div>
                                <div className="yic-rating-box-film">{ratingStats.lowest.title}</div>
                            </div>
                        )}
                    </div>
                </Section>
            )}

            {/* ────── VI. THE OBSCURITY INDEX ────── */}
            <Section>
                <div className="yic-section-number">VI</div>
                <div className="yic-section-title">The Obscurity Index</div>
                <div className="yic-section-desc">How deep did you dig this year?</div>

                <div className="yic-rating-row">
                    <div className="yic-rating-box">
                        <div className="yic-rating-box-value">{obscurityStats.avg}</div>
                        <div className="yic-rating-box-label">AVG OBSCURITY SCORE</div>
                        <div className="yic-rating-box-film" style={{ color: 'var(--sepia)' }}>
                            {obscurityStats.avg >= 70 ? 'DEEP ARCHIVIST' : obscurityStats.avg >= 40 ? 'CURIOUS EXPLORER' : 'MAINSTREAM PATRON'}
                        </div>
                    </div>
                    {obscurityStats.mostObscure && (
                        <div className="yic-rating-box">
                            <div className="yic-rating-box-value">☾</div>
                            <div className="yic-rating-box-label">MOST OBSCURE WATCH</div>
                            <div className="yic-rating-box-film">{obscurityStats.mostObscure.title}</div>
                        </div>
                    )}
                </div>
            </Section>

            {/* ────── VII. THE GENRE MAP ────── */}
            {genreData.length > 0 && (
                <Section>
                    <div className="yic-section-number">VII</div>
                    <div className="yic-section-title">The Genre Map</div>
                    <div className="yic-section-desc">The terrain you covered.</div>

                    <div className="yic-genres">
                        {genreData.map(({ name, pct }) => (
                            <div key={name} className="yic-genre-row">
                                <div className="yic-genre-name">{name.toUpperCase()}</div>
                                <div className="yic-genre-bar-wrap">
                                    <div className="yic-genre-bar-fill" style={{ width: `${pct}%` }} />
                                </div>
                                <div className="yic-genre-pct">{pct}%</div>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* ────── VIII. FIRST & LAST ────── */}
            {firstLog && lastLog && (
                <Section>
                    <div className="yic-section-number">VIII</div>
                    <div className="yic-section-title">The First & The Last</div>
                    <div className="yic-section-desc">The bookends of your cinematic year.</div>

                    <div className="yic-bookend-row">
                        <div className="yic-bookend">
                            <div className="yic-bookend-label">FIRST REEL</div>
                            {firstLog.poster && <img src={tmdb.poster(firstLog.poster) || undefined} alt="" className="yic-bookend-poster" loading="lazy" />}
                            <div className="yic-bookend-title">{firstLog.title}</div>
                            <div className="yic-bookend-date">{new Date((firstLog.loggedAt || firstLog.created_at) as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}</div>
                        </div>
                        <div className="yic-bookend">
                            <div className="yic-bookend-label">LAST REEL</div>
                            {lastLog.poster && <img src={tmdb.poster(lastLog.poster) || undefined} alt="" className="yic-bookend-poster" loading="lazy" />}
                            <div className="yic-bookend-title">{lastLog.title}</div>
                            <div className="yic-bookend-date">{new Date((lastLog.loggedAt || lastLog.created_at) as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}</div>
                        </div>
                    </div>
                </Section>
            )}

            {/* ────── IX. THE FAVORITE ────── */}
            {favorite && (
                <Section className="yic-favorite">
                    <div className="yic-section-number">IX</div>
                    <div className="yic-section-title">The Favorite</div>
                    <div className="yic-section-desc" style={{ marginInline: 'auto' }}>The one that stayed with you.</div>

                    {favorite.poster && <img src={tmdb.poster(favorite.poster) || undefined} alt={favorite.title} className="yic-favorite-poster" loading="lazy" />}
                    <div className="yic-favorite-title">{favorite.title}</div>
                    <div className="yic-favorite-year">{favorite.year}</div>
                    <div className="yic-favorite-rating">{'✦'.repeat(Math.round(favorite.rating))}</div>
                </Section>
            )}

            {/* ────── X. THE CREDITS ────── */}
            <Section className="yic-credits">
                <div className="yic-credits-divider">
                    <div className="yic-credits-line" />
                    <Film size={16} style={{ color: 'var(--sepia)' }} />
                    <div className="yic-credits-line" />
                </div>

                <div className="yic-credits-logo">THE REELHOUSE SOCIETY</div>
                <div className="yic-credits-tagline">
                    {totalFilms} films. {totalHours} hours. One year of devotion.<br />
                    Your {selectedYear} archive is sealed.
                </div>

                <Link to={user ? `/u/${user.username}` : '/'} className="btn btn-ghost yic-share-btn" style={{ fontSize: '0.65rem', letterSpacing: '0.15em' }}>
                    <ArrowLeft size={14} /> RETURN TO PROFILE
                </Link>
                <button onClick={shareYIC} disabled={sharing} className="btn btn-primary yic-share-btn" style={{ fontSize: '0.65rem', letterSpacing: '0.15em', opacity: sharing ? 0.6 : 1 }}>
                    <Share2 size={14} /> {sharing ? 'GENERATING...' : 'SHARE YOUR RETROSPECTIVE'}
                </button>
            </Section>

            {/* ────── HIDDEN 1080x1920 STORY EXPORT NODE ────── */}
            <div style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none', userSelect: 'none' }}>
                <div id="yic-export-node" style={{
                    width: '1080px', height: '1920px', background: 'var(--ink)',
                    display: sharing ? 'flex' : 'none', flexDirection: 'column', padding: '120px 80px',
                    position: 'relative', overflow: 'hidden', boxSizing: 'border-box'
                }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(139,105,20,0.03) 3px)', zIndex: 0 }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.8) 100%)', zIndex: 0 }} />

                    <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '4px solid var(--sepia)', paddingBottom: '30px', marginBottom: '80px' }}>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '4rem', color: 'var(--parchment)' }}>YEAR IN CINEMA</div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '1.5rem', letterSpacing: '0.2em', color: 'var(--fog)', marginBottom: '10px' }}>CLASSIFIED RETROSPECTIVE</div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '2rem', letterSpacing: '0.1em', color: 'var(--sepia)' }}>{selectedYear}</div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flex: 1, gap: '60px' }}>
                            {/* Left Col - Favorite Film Poster */}
                            <div style={{ width: '450px', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                                {favorite?.poster && (
                                    <div style={{ padding: '20px', border: '2px dashed var(--ash)', background: 'var(--soot)', flex: 1, maxHeight: '650px', overflow: 'hidden' }}>
                                        <img src={tmdb.poster(favorite.poster, 'w500') || ''} alt="" loading="eager" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'contrast(1.1) sepia(0.2)' }} />
                                    </div>
                                )}
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '1.5rem', color: 'var(--fog)', letterSpacing: '0.2em', marginTop: '30px' }}>THE CROWN JEWEL</div>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', color: 'var(--parchment)', marginTop: '10px', lineHeight: 1.1 }}>{favorite?.title?.toUpperCase()}</div>
                            </div>

                            {/* Right Col - Hard Stats */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '60px' }}>
                                <div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '1.5rem', color: 'var(--fog)', letterSpacing: '0.2em' }}>TOTAL REELS</div>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '6rem', color: 'var(--sepia)', lineHeight: 1 }}>{totalFilms}</div>
                                </div>
                                <div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '1.5rem', color: 'var(--fog)', letterSpacing: '0.2em' }}>HOURS BURNED</div>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '6rem', color: 'var(--sepia)', lineHeight: 1 }}>{totalHours}</div>
                                </div>
                                {topDirectors.length > 0 && (
                                    <div>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '1.5rem', color: 'var(--fog)', letterSpacing: '0.2em', marginBottom: '20px' }}>CHIEF ARCHITECTS</div>
                                        {topDirectors.slice(0, 3).map(([name, count]: any) => (
                                            <div key={name as string} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', color: 'var(--bone)' }}>{String(name).toUpperCase()}</div>
                                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '2rem', color: 'var(--sepia)' }}>{String(count)}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer Signature */}
                        <div style={{ borderTop: '2px dashed var(--ash)', paddingTop: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
                            <div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '1.2rem', letterSpacing: '0.3em', color: 'var(--fog)', marginBottom: '10px' }}>CURATED BY</div>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', color: 'var(--blood-reel)', fontStyle: 'italic' }}>@{user?.username?.toUpperCase() || 'AGENT'}</div>
                            </div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '1.5rem', letterSpacing: '0.5em', color: 'var(--fog)', opacity: 0.5 }}>
                                THE REELHOUSE SOCIETY
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
