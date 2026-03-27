import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { tmdb, obscurityScore } from '../tmdb'
import { FilmCard, LoadingReel, SectionHeader, ObscurityBadge, PersonPlaceholder } from '../components/UI'
import PageSEO from '../components/PageSEO'

import { useViewport } from '../hooks/useViewport'

export default function PersonPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { isTouch: IS_TOUCH } = useViewport()

    const { data: person, isLoading: loadingPerson } = useQuery({
        queryKey: ['person', id],
        queryFn: () => tmdb.person(Number(id!)),
        staleTime: 1000 * 60 * 30, // 30 mins
        enabled: !!id && !isNaN(Number(id)) && id !== 'discover' // Safety guard
    })

    const { data: credits, isLoading: loadingCredits } = useQuery({
        queryKey: ['personCredits', id],
        queryFn: () => tmdb.personCredits(Number(id!)),
        staleTime: 1000 * 60 * 30
    })

    const isLoading = loadingPerson || loadingCredits

    if (isLoading) return <LoadingReel />

    if (!person) {
        return (
            <div style={{ paddingTop: 140, textAlign: 'center', minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.4em', color: 'var(--sepia)' }}>ARCHIVE DEPT — FILE NOT FOUND</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--parchment)' }}>No Record On File</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--fog)', maxWidth: 360 }}>This person does not exist in the TMDB archive, or the reel was lost.</div>
            </div>
        )
    }

    // Process credits: deduplicate and sort by popularity (or vote_count)
    // We combine cast and crew, but we only want movies, and we sort them.
    const allCredits = [...(credits?.cast || []), ...(credits?.crew || [])]

    // Deduplicate
    const uniqueCredits = []
    const seenIds = new Set()
    for (const film of allCredits) {
        if (!seenIds.has(film.id)) {
            seenIds.add(film.id)
            uniqueCredits.push(film)
        }
    }

    // Sort by popularity and filter out films with no poster or very low votes to keep quality high
    const sortedCredits = uniqueCredits
        .filter((f: any) => f.poster_path && f.vote_count > 5)
        .sort((a: any, b: any) => b.popularity - a.popularity)

    return (
        <div className="page-top" style={{ minHeight: '100dvh', paddingBottom: '4rem' }}>
            <div className="container" style={{ padding: '0 1.5rem' }}>
                <button onClick={() => navigate(-1)} className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem', marginTop: '1rem', textDecoration: 'none', color: 'var(--fog)', fontSize: '0.8rem', background: 'none', border: 'none', cursor: 'pointer' }}>
                    <ArrowLeft size={16} /> BACK
                </button>

                {/* Profile Header */}
                <div className="person-hero-grid" style={{ display: 'flex', gap: IS_TOUCH ? '1.5rem' : '2rem', alignItems: IS_TOUCH ? 'center' : 'flex-start', flexWrap: 'wrap', marginBottom: IS_TOUCH ? '2rem' : '4rem', flexDirection: IS_TOUCH ? 'column' : 'row' }}>
                    {person.profile_path ? (
                        <img
                            src={tmdb.profile(person.profile_path, 'w500')}
                            alt={person.name}
                            style={{ width: IS_TOUCH ? 120 : 200, height: IS_TOUCH ? 180 : 300, objectFit: 'cover', borderRadius: 'var(--radius-card)', border: '1px solid var(--sepia)', filter: 'sepia(0.2) contrast(1.1)' }}
                        />
                    ) : (
                        <div style={{ width: IS_TOUCH ? 120 : 200, height: IS_TOUCH ? 180 : 300, borderRadius: 'var(--radius-card)', border: '1px solid var(--sepia)', overflow: 'hidden' }}>
                            <PersonPlaceholder />
                        </div>
                    )}

                    <div style={{ flex: 1, minWidth: IS_TOUCH ? 0 : 280, textAlign: IS_TOUCH ? 'center' : undefined }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.25em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>
                            {person.known_for_department?.toUpperCase()}
                        </div>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', color: 'var(--parchment)', lineHeight: 1, marginBottom: '0.5rem' }}>
                            {person.name}
                        </h1>
                        <div style={{ display: 'flex', gap: '1rem', fontFamily: 'var(--font-ui)', fontSize: '0.7rem', color: 'var(--fog)', letterSpacing: '0.1em', marginBottom: '1.5rem' }}>
                            {person.birthday && <span>BORN: {new Date(person.birthday + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}</span>}
                            {person.deathday && <span>DIED: {new Date(person.deathday + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}</span>}
                        </div>

                        {person.biography && (
                            <div style={{ position: 'relative', maxWidth: 800 }}>
                                <div
                                    className="bio-scroll"
                                    style={{
                                        fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--bone)', lineHeight: 1.6,
                                        maxHeight: IS_TOUCH ? 200 : 320, overflowY: 'auto',
                                        textAlign: IS_TOUCH ? 'left' : undefined,
                                        paddingRight: '0.5rem',
                                    }}
                                >
                                    {person.biography}
                                </div>
                                {/* Fade mask at bottom */}
                                <div style={{
                                    position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, pointerEvents: 'none',
                                    background: 'linear-gradient(to top, var(--ink), transparent)',
                                }} />
                            </div>
                        )}
                    </div>
                </div>

                {/* Filmography Section */}
                <SectionHeader label="FILMOGRAPHY" title="Known Works" />

                {sortedCredits.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: IS_TOUCH ? 'repeat(3, 1fr)' : 'repeat(auto-fill, minmax(140px, 1fr))', gap: IS_TOUCH ? '0.75rem' : '1.25rem' }}>
                        {sortedCredits.map((film: any, idx: number) => (
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
                ) : (
                    <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'var(--font-ui)', color: 'var(--fog)', letterSpacing: '0.1em' }}>
                        NO KNOWN WORKS FOUND.
                    </div>
                )}
            </div>
        </div>
    )
}
