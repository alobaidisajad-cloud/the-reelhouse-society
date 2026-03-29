import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowLeft, Film, Star } from 'lucide-react'
import { tmdb, obscurityScore } from '../tmdb'
import { FilmCard, LoadingReel, SectionHeader, ObscurityBadge, PersonPlaceholder } from '../components/UI'
import PageSEO from '../components/PageSEO'
import Poster from '../components/film/Poster'

import { useViewport } from '../hooks/useViewport'

export default function PersonPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { isTouch: IS_TOUCH } = useViewport()

    const { data: person, isLoading: loadingPerson } = useQuery({
        queryKey: ['person', id],
        queryFn: () => tmdb.person(Number(id!)),
        staleTime: 1000 * 60 * 30,
        enabled: !!id && !isNaN(Number(id)) && id !== 'discover'
    })

    const { data: credits, isLoading: loadingCredits } = useQuery({
        queryKey: ['personCredits', id],
        queryFn: () => tmdb.personCredits(Number(id!)),
        staleTime: 1000 * 60 * 30
    })

    const isLoading = loadingPerson || loadingCredits

    if (isLoading) return (
        <div style={{ minHeight: '100dvh', background: 'var(--ink)' }}>
            {/* Cinematic skeleton — matches the final hero layout */}
            <div style={{ height: IS_TOUCH ? '45vw' : '55vh', position: 'relative', overflow: 'hidden' }}>
                <div className="shimmer" style={{ position: 'absolute', inset: 0, opacity: 0.3 }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, var(--ink) 30%, transparent 70%)' }} />
            </div>
            <div className="container" style={{ position: 'relative', zIndex: 2, marginTop: IS_TOUCH ? -60 : -100 }}>
                <div style={{ display: 'flex', flexDirection: IS_TOUCH ? 'column' : 'row', alignItems: IS_TOUCH ? 'center' : 'flex-end', gap: '2rem' }}>
                    <div className="shimmer" style={{ width: IS_TOUCH ? 120 : 220, aspectRatio: '2/3', borderRadius: '2px', flexShrink: 0 }} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingBottom: '1rem' }}>
                        <div className="shimmer" style={{ height: '0.6rem', width: '20%', borderRadius: '2px' }} />
                        <div className="shimmer" style={{ height: '2.5rem', width: '50%', borderRadius: '2px' }} />
                        <div className="shimmer" style={{ height: '0.8rem', width: '30%', borderRadius: '2px' }} />
                    </div>
                </div>
            </div>
        </div>
    )

    if (!person) {
        return (
            <div style={{ paddingTop: 140, textAlign: 'center', minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.4em', color: 'var(--sepia)' }}>ARCHIVE DEPT — FILE NOT FOUND</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--parchment)' }}>No Record On File</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--fog)', maxWidth: 360 }}>This person does not exist in the TMDB archive, or the reel was lost.</div>
            </div>
        )
    }

    // Process credits — same logic as before, untouched
    const allCredits = [...(credits?.cast || []), ...(credits?.crew || [])]
    const uniqueCredits: any[] = []
    const seenIds = new Set()
    for (const film of allCredits) {
        if (!seenIds.has(film.id)) {
            seenIds.add(film.id)
            uniqueCredits.push(film)
        }
    }
    const sortedCredits = uniqueCredits
        .filter((f: any) => f.poster_path && f.vote_count > 5)
        .sort((a: any, b: any) => b.popularity - a.popularity)

    // ── Defining film: the most iconic work — used for the hero backdrop
    const definingFilm = sortedCredits.find((f: any) => f.backdrop_path) || null
    const heroBackdrop = definingFilm?.backdrop_path ? tmdb.backdrop(definingFilm.backdrop_path) : null

    // ── Top 5 defining works for the highlight section
    const definingWorks = sortedCredits.slice(0, IS_TOUCH ? 4 : 5)

    // ── Remaining filmography (everything after the defining works)
    const remainingCredits = sortedCredits.slice(IS_TOUCH ? 4 : 5)

    // ── Career stats
    const totalFilms = sortedCredits.length
    const decades = new Set(sortedCredits.map((f: any) => f.release_date?.substring(0, 3)).filter(Boolean))
    const careerSpan = decades.size > 0 ? `${decades.size}0s` : null

    return (
        <div className="page-top" style={{ minHeight: '100dvh', position: 'relative', background: 'var(--ink)' }}>

            {/* ═══════════════════════════════════════════════════
                THE CINEMATIC HERO — Full-bleed backdrop from their defining film.
                This is the single highest-impact change. It transforms the page
                from "database entry" to "cinematic tribute."
            ═══════════════════════════════════════════════════ */}
            <div style={{
                position: 'relative',
                minHeight: IS_TOUCH ? '45vw' : '55vh',
                maxHeight: IS_TOUCH ? 280 : undefined,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'flex-end',
            }}>
                {/* Backdrop image — from their most iconic film */}
                {heroBackdrop ? (
                    <div style={{
                        position: 'absolute', inset: 0,
                        backgroundImage: `url(${heroBackdrop})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center 20%',
                        filter: 'sepia(0.35) brightness(0.30) contrast(1.15)',
                        zIndex: 0,
                    }} />
                ) : (
                    /* Fallback: atmospheric gradient when no backdrop available */
                    <div style={{
                        position: 'absolute', inset: 0,
                        background: 'radial-gradient(ellipse at top, rgba(139,105,20,0.12) 0%, rgba(10,7,3,0.95) 60%)',
                        zIndex: 0,
                    }} />
                )}

                {/* Gradient overlay — fades to ink at the bottom */}
                <div style={{
                    position: 'absolute', inset: 0,
                    background: IS_TOUCH
                        ? 'linear-gradient(to bottom, rgba(10,7,3,0.1) 0%, rgba(10,7,3,0.5) 60%, var(--ink) 100%)'
                        : 'linear-gradient(to top, var(--ink) 10%, rgba(10,7,3,0.8) 40%, rgba(10,7,3,0.2) 75%, transparent)',
                    zIndex: 1,
                }} />

                {/* Film-strip perforation bar — ReelHouse signature */}
                {!IS_TOUCH && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 2, pointerEvents: 'none' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', opacity: 0.15, paddingBottom: '1rem' }}>
                            {Array.from({ length: 22 }).map((_, i) => (
                                <div key={i} style={{ width: 16, height: 10, border: '1px solid var(--sepia)', borderRadius: '1px', flexShrink: 0 }} />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ═══════════════════════════════════════════════════
                THE PROFILE DOSSIER — Portrait, name, and metadata.
                Overlaps the hero backdrop to create cinematic depth.
            ═══════════════════════════════════════════════════ */}
            <div className="container" style={{
                position: 'relative', zIndex: 2,
                marginTop: IS_TOUCH ? -70 : -140,
                padding: IS_TOUCH ? '0 1.25rem' : '0 1.5rem',
            }}>
                {/* Back button — floats above the hero */}
                <button onClick={() => navigate(-1)} className="back-btn" style={{
                    position: IS_TOUCH ? 'relative' : 'absolute',
                    top: IS_TOUCH ? undefined : -80,
                    left: IS_TOUCH ? undefined : '1.5rem',
                    zIndex: 3,
                    marginBottom: IS_TOUCH ? '0.75rem' : 0,
                    background: 'rgba(10,7,3,0.6)',
                    border: '1px solid rgba(139,105,20,0.3)',
                    borderRadius: '2px',
                    padding: '0.4rem 0.8rem',
                    color: 'var(--sepia)',
                    backdropFilter: 'blur(4px)',
                    WebkitBackdropFilter: 'blur(4px)',
                }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--sepia)'; e.currentTarget.style.background = 'rgba(139,105,20,0.15)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(139,105,20,0.3)'; e.currentTarget.style.background = 'rgba(10,7,3,0.6)' }}
                >
                    <ArrowLeft size={13} /> BACK
                </button>

                <div style={{
                    display: 'flex',
                    gap: IS_TOUCH ? '0' : '2.5rem',
                    alignItems: IS_TOUCH ? 'center' : 'flex-end',
                    flexDirection: IS_TOUCH ? 'column' : 'row',
                    marginBottom: IS_TOUCH ? '1.5rem' : '3rem',
                }}>
                    {/* ── THE PORTRAIT — displayed like art in a gallery ── */}
                    <div style={{ flexShrink: 0, position: 'relative', marginBottom: IS_TOUCH ? '1.25rem' : 0 }}>
                        {/* Blurred glow behind photo — same technique as Film Detail poster */}
                        {person.profile_path && !IS_TOUCH && (
                            <div style={{
                                position: 'absolute', inset: -20, zIndex: 0,
                                backgroundImage: `url(${tmdb.profile(person.profile_path, 'w185')})`,
                                backgroundSize: 'cover', backgroundPosition: 'center',
                                filter: 'blur(50px) sepia(0.5) saturate(2)',
                                opacity: 0.25,
                                transform: 'scale(1.05)',
                            }} />
                        )}
                        <div className="card-film scanlines" style={{
                            position: 'relative', zIndex: 1,
                            width: IS_TOUCH ? 130 : 220,
                            boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 30px rgba(139,105,20,0.2)',
                            borderRadius: 'var(--radius-card)',
                            overflow: 'hidden',
                        }}>
                            {person.profile_path ? (
                                <img
                                    src={tmdb.profile(person.profile_path, 'w500') || undefined}
                                    alt={person.name}
                                    style={{
                                        width: '100%', height: '100%', objectFit: 'cover',
                                        filter: 'sepia(0.15) contrast(1.08)',
                                    }}
                                />
                            ) : (
                                <PersonPlaceholder />
                            )}
                        </div>
                    </div>

                    {/* ── THE DOSSIER HEADER — Name, department, dates ── */}
                    <div style={{
                        flex: 1, minWidth: IS_TOUCH ? 0 : 280,
                        textAlign: IS_TOUCH ? 'center' : undefined,
                        paddingBottom: IS_TOUCH ? 0 : '0.5rem',
                    }}>
                        {/* Department badge */}
                        <div style={{
                            fontFamily: 'var(--font-ui)', fontSize: '0.55rem',
                            letterSpacing: '0.35em', color: 'var(--sepia)',
                            marginBottom: '0.6rem', opacity: 0.85,
                        }}>
                            {person.known_for_department?.toUpperCase()}
                        </div>

                        {/* ── THE NAME — editorial marquee treatment ── */}
                        <div style={{
                            display: 'flex',
                            alignItems: IS_TOUCH ? 'center' : 'flex-start',
                            justifyContent: IS_TOUCH ? 'center' : 'flex-start',
                            gap: '1rem',
                            marginBottom: '0.5rem',
                        }}>
                            {/* Golden accent bar — same as Film Detail title */}
                            {!IS_TOUCH && (
                                <div style={{
                                    width: '3px', flexShrink: 0, alignSelf: 'stretch',
                                    background: 'linear-gradient(to bottom, var(--sepia), var(--flicker), transparent)',
                                    borderRadius: '2px', minHeight: '2.5rem', marginTop: '0.2rem',
                                    boxShadow: '0 0 12px rgba(196,150,26,0.5)',
                                }} />
                            )}
                            <h1 style={{
                                fontFamily: 'var(--font-display)',
                                fontSize: IS_TOUCH ? 'clamp(1.8rem, 8vw, 2.8rem)' : 'clamp(2.5rem, 4.5vw, 4rem)',
                                color: 'var(--parchment)', lineHeight: 1.05,
                                letterSpacing: '-0.01em',
                                textShadow: '3px 3px 0 rgba(139,105,20,0.2), 0 0 40px rgba(242,232,160,0.06)',
                            }}>
                                {person.name}
                            </h1>
                        </div>

                        {/* Birth/Death dates */}
                        <div style={{
                            display: 'flex', gap: '1rem', flexWrap: 'wrap',
                            justifyContent: IS_TOUCH ? 'center' : 'flex-start',
                            fontFamily: 'var(--font-ui)', fontSize: '0.6rem',
                            color: 'var(--fog)', letterSpacing: '0.1em',
                            marginBottom: IS_TOUCH ? '1rem' : '1.5rem',
                        }}>
                            {person.birthday && (
                                <span>BORN: {new Date(person.birthday + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}</span>
                            )}
                            {person.deathday && (
                                <span style={{ color: 'rgba(200,80,80,0.7)' }}>DIED: {new Date(person.deathday + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}</span>
                            )}
                            {person.place_of_birth && (
                                <span style={{ opacity: 0.7 }}>{person.place_of_birth.toUpperCase()}</span>
                            )}
                        </div>

                        {/* Career stats strip */}
                        {totalFilms > 0 && (
                            <div style={{
                                display: 'flex', gap: IS_TOUCH ? '1rem' : '1.5rem',
                                justifyContent: IS_TOUCH ? 'center' : 'flex-start',
                                flexWrap: 'wrap',
                                marginBottom: IS_TOUCH ? '0.5rem' : '0',
                            }}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    fontFamily: 'var(--font-ui)', fontSize: '0.55rem',
                                    letterSpacing: '0.12em', color: 'var(--bone)',
                                }}>
                                    <Film size={11} color="var(--sepia)" />
                                    {totalFilms} CREDITS
                                </div>
                                {definingFilm && (
                                    <div style={{
                                        fontFamily: 'var(--font-ui)', fontSize: '0.55rem',
                                        letterSpacing: '0.12em', color: 'var(--fog)',
                                    }}>
                                        KNOWN FOR: <span style={{ color: 'var(--bone)', textDecoration: 'underline', textDecorationColor: 'rgba(139,105,20,0.3)' }}>
                                            {definingFilm.title}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* ═══════════════════════════════════════════════════
                    THE CLASSIFIED DOSSIER — Biography framed as a document
                ═══════════════════════════════════════════════════ */}
                {person.biography && (
                    <div style={{
                        maxWidth: 900,
                        marginBottom: IS_TOUCH ? '2rem' : '3rem',
                        padding: IS_TOUCH ? '1.25rem' : '2rem 2.5rem',
                        background: 'linear-gradient(160deg, rgba(25,20,15,0.6) 0%, rgba(10,7,3,0.8) 100%)',
                        border: '1px solid rgba(139,105,20,0.15)',
                        borderLeft: '2px solid rgba(139,105,20,0.4)',
                        borderRadius: '0 var(--radius-card) var(--radius-card) 0',
                        position: 'relative',
                    }}>
                        {/* Top accent line */}
                        <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
                            background: 'linear-gradient(90deg, rgba(139,105,20,0.4), transparent 80%)',
                        }} />

                        <div style={{
                            fontFamily: 'var(--font-ui)', fontSize: '0.5rem',
                            letterSpacing: '0.3em', color: 'var(--sepia)',
                            marginBottom: '0.75rem', opacity: 0.8,
                        }}>
                            CLASSIFIED DOSSIER — BIOGRAPHY
                        </div>

                        <div style={{ position: 'relative' }}>
                            <div
                                className="bio-scroll"
                                style={{
                                    fontFamily: 'var(--font-body)', fontSize: '0.9rem',
                                    color: 'var(--bone)', lineHeight: 1.75,
                                    maxHeight: IS_TOUCH ? 180 : 280, overflowY: 'auto',
                                    paddingRight: '0.5rem',
                                }}
                            >
                                {person.biography}
                            </div>
                            {/* Fade mask */}
                            <div style={{
                                position: 'absolute', bottom: 0, left: 0, right: 0, height: 50,
                                pointerEvents: 'none',
                                background: 'linear-gradient(to top, rgba(10,7,3,0.9), transparent)',
                            }} />
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════
                    DEFINING WORKS — The films that earned them their place in the House.
                    Larger cards, hero treatment, curated selection.
                ═══════════════════════════════════════════════════ */}
                {definingWorks.length > 0 && (
                    <div style={{ marginBottom: IS_TOUCH ? '2rem' : '3.5rem' }}>
                        <SectionHeader label="DEFINING WORKS" title="The Legacy" />

                        {IS_TOUCH ? (
                            /* Mobile: horizontal scroll strip */
                            <div style={{
                                display: 'flex', gap: '0.75rem', overflowX: 'auto',
                                scrollbarWidth: 'none', paddingBottom: '0.75rem',
                                marginLeft: '-1.25rem', paddingLeft: '1.25rem',
                                marginRight: '-1.25rem', paddingRight: '1.25rem',
                            }}>
                                {definingWorks.map((film: any) => (
                                    <Link key={film.id} to={`/film/${film.id}`} style={{
                                        flexShrink: 0, width: 130, display: 'block', textDecoration: 'none',
                                    }}>
                                        <div className="card-film" style={{
                                            boxShadow: '0 12px 30px rgba(0,0,0,0.7), 0 0 20px rgba(139,105,20,0.15)',
                                        }}>
                                            <Poster path={film.poster_path} title={film.title} sizeHint="md" style={{ filter: 'sepia(0.12) contrast(1.05)' }} />
                                        </div>
                                        <div style={{ marginTop: '0.5rem' }}>
                                            <div style={{
                                                fontFamily: 'var(--font-sub)', fontSize: '0.72rem',
                                                color: 'var(--parchment)', lineHeight: 1.2,
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            }}>{film.title}</div>
                                            <div style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                marginTop: '0.25rem',
                                            }}>
                                                <span style={{
                                                    fontFamily: 'var(--font-ui)', fontSize: '0.5rem',
                                                    color: 'var(--fog)', letterSpacing: '0.1em',
                                                }}>
                                                    {film.release_date?.substring(0, 4) || 'TBA'}
                                                </span>
                                                <ObscurityBadge score={obscurityScore(film)} />
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            /* Desktop: large hero cards in a row */
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: `repeat(${definingWorks.length}, 1fr)`,
                                gap: '1.25rem',
                            }}>
                                {definingWorks.map((film: any, idx: number) => (
                                    <motion.div
                                        key={film.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.35, delay: idx * 0.08 }}
                                    >
                                        <Link to={`/film/${film.id}`} style={{ display: 'block', textDecoration: 'none' }}>
                                            <div className="card-film" style={{
                                                boxShadow: '0 16px 40px rgba(0,0,0,0.7), 0 0 24px rgba(139,105,20,0.15)',
                                            }}>
                                                <Poster path={film.poster_path} title={film.title} sizeHint="lg" style={{ filter: 'sepia(0.12) contrast(1.05)' }} />
                                                {/* Title overlay at bottom */}
                                                <div style={{
                                                    position: 'absolute', bottom: 0, left: 0, right: 0,
                                                    background: 'linear-gradient(to top, rgba(10,7,3,0.9) 0%, rgba(10,7,3,0.5) 50%, transparent 100%)',
                                                    padding: '2.5rem 0.75rem 0.75rem',
                                                    zIndex: 4,
                                                }}>
                                                    <div style={{
                                                        fontFamily: 'var(--font-sub)', fontSize: '0.82rem',
                                                        color: 'var(--parchment)', lineHeight: 1.2,
                                                        textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                                                    }}>{film.title}</div>
                                                    <div style={{
                                                        fontFamily: 'var(--font-ui)', fontSize: '0.48rem',
                                                        letterSpacing: '0.1em', color: 'var(--fog)',
                                                        marginTop: '0.2rem',
                                                    }}>
                                                        {film.release_date?.substring(0, 4) || 'TBA'}
                                                        {film.vote_average > 0 && <span> · ★ {film.vote_average.toFixed(1)}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        </Link>
                                        <div style={{ marginTop: '0.4rem' }}>
                                            <ObscurityBadge score={obscurityScore(film)} />
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════
                    COMPLETE FILMOGRAPHY — The full archive of their work
                ═══════════════════════════════════════════════════ */}
                {remainingCredits.length > 0 && (
                    <>
                        {/* Separator */}
                        <div style={{
                            height: '1px',
                            background: 'linear-gradient(90deg, transparent, rgba(139,105,20,0.3), transparent)',
                            margin: IS_TOUCH ? '0.5rem 0 1.5rem' : '1rem 0 2.5rem',
                        }} />

                        <SectionHeader label="COMPLETE FILMOGRAPHY" title="The Full Archive" />

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: IS_TOUCH ? 'repeat(3, 1fr)' : 'repeat(auto-fill, minmax(140px, 1fr))',
                            gap: IS_TOUCH ? '0.75rem' : '1.25rem',
                        }}>
                            {remainingCredits.map((film: any, idx: number) => (
                                <motion.div
                                    key={film.id}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.2, delay: (idx % 20) * 0.03 }}
                                >
                                    <Link to={`/film/${film.id}`} style={{ display: 'block', textDecoration: 'none' }}>
                                        <FilmCard film={film} />
                                    </Link>
                                    <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>
                                            {film.release_date?.substring(0, 4) || 'TBA'}
                                        </div>
                                        <ObscurityBadge score={obscurityScore(film)} />
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </>
                )}

                {/* If no credits at all */}
                {sortedCredits.length === 0 && (
                    <div style={{
                        padding: '3rem', textAlign: 'center',
                        border: '1px dashed rgba(139,105,20,0.2)',
                        borderRadius: 'var(--radius-card)',
                        background: 'rgba(18,14,9,0.4)',
                    }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.3em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>THE VAULT IS SEALED</div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--parchment)', opacity: 0.6 }}>No Known Works Found</div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--fog)', marginTop: '0.3rem', fontStyle: 'italic' }}>The archive has no film records on file for this artist.</div>
                    </div>
                )}
            </div>

            {/* Bottom breathing room */}
            <div style={{ height: IS_TOUCH ? 'calc(4rem + env(safe-area-inset-bottom))' : '4rem' }} />
        </div>
    )
}
