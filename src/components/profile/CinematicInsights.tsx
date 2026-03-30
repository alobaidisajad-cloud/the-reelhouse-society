/**
 * CinematicInsights — Real analytics computed from the user's logged films.
 * Fetches TMDB credits to determine top actors, directors, and genres.
 * Nitrate Noir themed — fits the Projector Room analytics tab.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { tmdb } from '../../tmdb'
import { User, Megaphone, Clapperboard, Loader } from 'lucide-react'

// ── Genre map for resolving genre IDs ──
const GENRE_MAP: Record<number, string> = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
    80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
    14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
    9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie',
    53: 'Thriller', 10752: 'War', 37: 'Western',
}

interface InsightsProps {
    logs: any[]
    userId?: string
}

interface PersonCount {
    id: number
    name: string
    profile_path: string | null
    count: number
}

interface GenreCount {
    name: string
    count: number
}

export default function CinematicInsights({ logs, userId }: InsightsProps) {
    // Get unique film IDs from user's logs
    const filmIds = useMemo(() => {
        const ids = new Set<number>()
        for (const log of logs) {
            const fid = log.filmId || log.film_id
            if (fid) ids.add(Number(fid))
        }
        return Array.from(ids)
    }, [logs])

    // Fetch credits for all unique films — BATCHED to respect TMDB rate limits
    const { data: insights, isLoading } = useQuery({
        queryKey: ['cinematic-insights', userId || 'self', filmIds.join(',')],
        queryFn: async () => {
            if (filmIds.length === 0) return null

            const idsToFetch = filmIds.slice(0, 80)
            const BATCH_SIZE = 5
            const BATCH_DELAY = 350 // ms between batches to avoid TMDB rate limit (40 req/10s)

            const allMovies: any[] = []

            // Process in sequential batches
            for (let i = 0; i < idsToFetch.length; i += BATCH_SIZE) {
                const batch = idsToFetch.slice(i, i + BATCH_SIZE)
                const batchResults = await Promise.allSettled(
                    batch.map(id => tmdb.movieDetails(id))
                )

                for (const result of batchResults) {
                    if (result.status === 'fulfilled' && result.value) {
                        allMovies.push(result.value)
                    }
                }

                // Wait between batches to avoid rate limiting
                if (i + BATCH_SIZE < idsToFetch.length) {
                    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
                }
            }

            const actorMap = new Map<number, PersonCount>()
            const directorMap = new Map<number, PersonCount>()
            const genreMap = new Map<string, number>()

            for (const movie of allMovies) {
                // Genres
                if (movie.genres) {
                    for (const g of movie.genres) {
                        genreMap.set(g.name, (genreMap.get(g.name) || 0) + 1)
                    }
                } else if (movie.genre_ids) {
                    for (const gid of movie.genre_ids) {
                        const name = GENRE_MAP[gid]
                        if (name) genreMap.set(name, (genreMap.get(name) || 0) + 1)
                    }
                }

                // Credits
                const credits = movie.credits
                if (!credits) continue

                // Top billed actors (first 5 per film)
                if (credits.cast) {
                    for (const person of credits.cast.slice(0, 5)) {
                        const existing = actorMap.get(person.id)
                        if (existing) {
                            existing.count++
                        } else {
                            actorMap.set(person.id, {
                                id: person.id,
                                name: person.name,
                                profile_path: person.profile_path,
                                count: 1,
                            })
                        }
                    }
                }

                // Directors
                if (credits.crew) {
                    for (const person of credits.crew) {
                        if (person.job === 'Director') {
                            const existing = directorMap.get(person.id)
                            if (existing) {
                                existing.count++
                            } else {
                                directorMap.set(person.id, {
                                    id: person.id,
                                    name: person.name,
                                    profile_path: person.profile_path,
                                    count: 1,
                                })
                            }
                        }
                    }
                }
            }

            const topActors = Array.from(actorMap.values())
                .sort((a, b) => b.count - a.count)
                .slice(0, 5)

            const topDirectors = Array.from(directorMap.values())
                .sort((a, b) => b.count - a.count)
                .slice(0, 5)

            const topGenres = Array.from(genreMap.entries())
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 8)

            return {
                topActors,
                topDirectors,
                topGenres,
                totalFilms: idsToFetch.length,
                fetchedFilms: allMovies.length,
            }
        },
        enabled: filmIds.length >= 3,
        staleTime: 1000 * 60 * 30, // 30 min cache — data doesn't change often
        gcTime: 1000 * 60 * 60, // Keep in cache for 1 hour
    })

    if (filmIds.length < 3) {
        return (
            <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.75rem' }}>
                    CINEMATIC INSIGHTS
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--fog)', fontStyle: 'italic' }}>
                    Log at least 3 films to unlock your cinematic insights.
                </div>
            </div>
        )
    }

    if (isLoading) {
        return (
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1rem' }}>
                    ANALYZING {filmIds.length} LOGGED FILMS
                </div>
                <Loader size={20} style={{ color: 'var(--sepia)', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--fog)', fontStyle: 'italic', marginTop: '0.75rem' }}>
                    Fetching credits from TMDB...
                </div>
            </div>
        )
    }

    if (!insights) return null

    const maxActorCount = insights.topActors[0]?.count || 1
    const maxDirectorCount = insights.topDirectors[0]?.count || 1
    const maxGenreCount = insights.topGenres[0]?.count || 1

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Data source note */}
            <div style={{ textAlign: 'center', fontFamily: 'var(--font-ui)', fontSize: '0.42rem', letterSpacing: '0.15em', color: 'var(--ash)' }}>
                BASED ON {insights.fetchedFilms} OF {filmIds.length} LOGGED FILMS
            </div>
            {/* ── TOP ACTORS ── */}
            {insights.topActors.length > 0 && (
                <div className="card" style={{ padding: '1.75rem', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <User size={14} style={{ color: 'var(--sepia)' }} />
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)' }}>
                            MOST WATCHED ACTORS
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {insights.topActors.map((actor, i) => (
                            <motion.div
                                key={actor.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.08 }}
                                style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}
                            >
                                {/* Rank */}
                                <div style={{
                                    width: 24, height: 24, borderRadius: '50%',
                                    background: i === 0 ? 'var(--sepia)' : 'rgba(139,105,20,0.15)',
                                    color: i === 0 ? 'var(--ink)' : 'var(--fog)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontFamily: 'var(--font-ui)', fontSize: '0.5rem', fontWeight: 700,
                                    flexShrink: 0,
                                }}>
                                    {i + 1}
                                </div>

                                {/* Photo */}
                                <div style={{
                                    width: 40, height: 40, borderRadius: '50%',
                                    overflow: 'hidden', flexShrink: 0,
                                    border: i === 0 ? '2px solid var(--sepia)' : '1px solid var(--ash)',
                                    background: 'var(--soot)',
                                }}>
                                    {actor.profile_path ? (
                                        <img
                                            src={`https://image.tmdb.org/t/p/w185${actor.profile_path}`}
                                            alt={actor.name}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <User size={16} style={{ color: 'var(--ash)' }} />
                                        </div>
                                    )}
                                </div>

                                {/* Name + Bar */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontFamily: 'var(--font-sub)', fontSize: '0.85rem',
                                        color: i === 0 ? 'var(--parchment)' : 'var(--bone)',
                                        marginBottom: '0.35rem',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    }}>
                                        {actor.name}
                                    </div>
                                    <div style={{ height: 4, background: 'var(--ash)', borderRadius: 2, overflow: 'hidden' }}>
                                        <motion.div
                                            initial={{ scaleX: 0 }}
                                            animate={{ scaleX: actor.count / maxActorCount }}
                                            transition={{ duration: 0.6, delay: i * 0.1 }}
                                            style={{
                                                height: '100%', width: '100%', transformOrigin: 'left',
                                                background: i === 0 ? 'linear-gradient(90deg, var(--sepia), var(--flicker))' : 'var(--sepia)',
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Count */}
                                <div style={{
                                    fontFamily: 'var(--font-display-alt)', fontSize: '1.1rem',
                                    color: i === 0 ? 'var(--sepia)' : 'var(--fog)',
                                    flexShrink: 0, minWidth: 30, textAlign: 'right',
                                }}>
                                    {actor.count}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── TOP DIRECTORS ── */}
            {insights.topDirectors.length > 0 && (
                <div className="card" style={{ padding: '1.75rem', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <Megaphone size={14} style={{ color: 'var(--sepia)' }} />
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)' }}>
                            MOST WATCHED DIRECTORS
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {insights.topDirectors.map((director, i) => (
                            <motion.div
                                key={director.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.08 }}
                                style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}
                            >
                                <div style={{
                                    width: 24, height: 24, borderRadius: '50%',
                                    background: i === 0 ? 'var(--sepia)' : 'rgba(139,105,20,0.15)',
                                    color: i === 0 ? 'var(--ink)' : 'var(--fog)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontFamily: 'var(--font-ui)', fontSize: '0.5rem', fontWeight: 700,
                                    flexShrink: 0,
                                }}>
                                    {i + 1}
                                </div>

                                <div style={{
                                    width: 40, height: 40, borderRadius: '50%',
                                    overflow: 'hidden', flexShrink: 0,
                                    border: i === 0 ? '2px solid var(--sepia)' : '1px solid var(--ash)',
                                    background: 'var(--soot)',
                                }}>
                                    {director.profile_path ? (
                                        <img
                                            src={`https://image.tmdb.org/t/p/w185${director.profile_path}`}
                                            alt={director.name}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Megaphone size={16} style={{ color: 'var(--ash)' }} />
                                        </div>
                                    )}
                                </div>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontFamily: 'var(--font-sub)', fontSize: '0.85rem',
                                        color: i === 0 ? 'var(--parchment)' : 'var(--bone)',
                                        marginBottom: '0.35rem',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    }}>
                                        {director.name}
                                    </div>
                                    <div style={{ height: 4, background: 'var(--ash)', borderRadius: 2, overflow: 'hidden' }}>
                                        <motion.div
                                            initial={{ scaleX: 0 }}
                                            animate={{ scaleX: director.count / maxDirectorCount }}
                                            transition={{ duration: 0.6, delay: i * 0.1 }}
                                            style={{
                                                height: '100%', width: '100%', transformOrigin: 'left',
                                                background: i === 0 ? 'linear-gradient(90deg, var(--sepia), var(--flicker))' : 'var(--sepia)',
                                            }}
                                        />
                                    </div>
                                </div>

                                <div style={{
                                    fontFamily: 'var(--font-display-alt)', fontSize: '1.1rem',
                                    color: i === 0 ? 'var(--sepia)' : 'var(--fog)',
                                    flexShrink: 0, minWidth: 30, textAlign: 'right',
                                }}>
                                    {director.count}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── TOP GENRES ── */}
            {insights.topGenres.length > 0 && (
                <div className="card" style={{ padding: '1.75rem', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <Clapperboard size={14} style={{ color: 'var(--sepia)' }} />
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)' }}>
                            GENRE BREAKDOWN
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        {insights.topGenres.map((genre, i) => {
                            const pct = Math.round((genre.count / insights.totalFilms) * 100)
                            return (
                                <motion.div
                                    key={genre.name}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.3rem' }}>
                                        <span style={{
                                            fontFamily: 'var(--font-sub)', fontSize: '0.8rem',
                                            color: i === 0 ? 'var(--parchment)' : 'var(--bone)',
                                        }}>
                                            {genre.name}
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                                            <span style={{
                                                fontFamily: 'var(--font-display-alt)', fontSize: '0.95rem',
                                                color: i === 0 ? 'var(--sepia)' : 'var(--fog)',
                                            }}>
                                                {genre.count}
                                            </span>
                                            <span style={{
                                                fontFamily: 'var(--font-ui)', fontSize: '0.4rem',
                                                letterSpacing: '0.1em', color: 'var(--ash)',
                                            }}>
                                                {pct}%
                                            </span>
                                        </div>
                                    </div>
                                    <div style={{ height: 5, background: 'var(--ash)', borderRadius: 3, overflow: 'hidden' }}>
                                        <motion.div
                                            initial={{ scaleX: 0 }}
                                            animate={{ scaleX: genre.count / maxGenreCount }}
                                            transition={{ duration: 0.6, delay: i * 0.06 }}
                                            style={{
                                                height: '100%', width: '100%', transformOrigin: 'left',
                                                background: i === 0
                                                    ? 'linear-gradient(90deg, var(--sepia), var(--flicker))'
                                                    : `rgba(139, 105, 20, ${0.7 - i * 0.08})`,
                                                borderRadius: 3,
                                            }}
                                        />
                                    </div>
                                </motion.div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
