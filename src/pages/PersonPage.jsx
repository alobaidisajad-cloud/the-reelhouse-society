import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { tmdb, obscurityScore } from '../tmdb'
import { FilmCard, LoadingReel, SectionHeader, ObscurityBadge, PersonPlaceholder } from '../components/UI'

export default function PersonPage() {
    const { id } = useParams()

    const { data: person, isLoading: loadingPerson } = useQuery({
        queryKey: ['person', id],
        queryFn: () => tmdb.person(id),
        staleTime: 1000 * 60 * 30, // 30 mins
        enabled: !!id && !isNaN(id) && id !== 'discover' // Safety guard
    })

    const { data: credits, isLoading: loadingCredits } = useQuery({
        queryKey: ['personCredits', id],
        queryFn: () => tmdb.personCredits(id),
        staleTime: 1000 * 60 * 30
    })

    const isLoading = loadingPerson || loadingCredits

    if (isLoading) return <LoadingReel />

    if (!person) {
        return (
            <div style={{ paddingTop: 120, textAlign: 'center', color: 'var(--fog)', fontFamily: 'var(--font-body)' }}>
                <h2>Person not found.</h2>
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
        .filter(f => f.poster_path && f.vote_count > 5)
        .sort((a, b) => b.popularity - a.popularity)

    return (
        <div className="page-top" style={{ minHeight: '100vh', paddingBottom: '4rem' }}>
            <div className="container" style={{ padding: '0 1.5rem' }}>
                <Link to={-1} className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem', marginTop: '1rem', textDecoration: 'none', color: 'var(--fog)', fontSize: '0.8rem' }}>
                    <ArrowLeft size={16} /> BACK
                </Link>

                {/* Profile Header */}
                <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '4rem' }}>
                    {person.profile_path ? (
                        <img
                            src={tmdb.profile(person.profile_path, 'w500')}
                            alt={person.name}
                            style={{ width: 200, height: 300, objectFit: 'cover', borderRadius: 'var(--radius-card)', border: '1px solid var(--sepia)', filter: 'sepia(0.2) contrast(1.1)' }}
                        />
                    ) : (
                        <div style={{ width: 200, height: 300, borderRadius: 'var(--radius-card)', border: '1px solid var(--sepia)', overflow: 'hidden' }}>
                            <PersonPlaceholder />
                        </div>
                    )}

                    <div style={{ flex: 1, minWidth: 280 }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.25em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>
                            {person.known_for_department?.toUpperCase()}
                        </div>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', color: 'var(--parchment)', lineHeight: 1, marginBottom: '0.5rem' }}>
                            {person.name}
                        </h1>
                        <div style={{ display: 'flex', gap: '1rem', fontFamily: 'var(--font-ui)', fontSize: '0.7rem', color: 'var(--fog)', letterSpacing: '0.1em', marginBottom: '1.5rem' }}>
                            {person.birthday && <span>BORN: {person.birthday}</span>}
                            {person.deathday && <span>DIED: {person.deathday}</span>}
                        </div>

                        {person.biography && (
                            <div style={{
                                fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--bone)', lineHeight: 1.6, maxWidth: 800,
                                display: '-webkit-box', WebkitLineClamp: 8, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                            }}>
                                {person.biography}
                            </div>
                        )}
                    </div>
                </div>

                {/* Filmography Section */}
                <SectionHeader label="FILMOGRAPHY" title="Known Works" />

                {sortedCredits.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1.25rem' }}>
                        {sortedCredits.map((film, idx) => (
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
