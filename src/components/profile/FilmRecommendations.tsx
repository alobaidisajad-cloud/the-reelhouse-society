/**
 * FilmRecommendations — Client-side recommendation engine.
 * Uses the user's top-rated genres from their logs to query TMDB's /discover/movie endpoint.
 * Filters out already-logged films. Zero backend calls — pure TMDB + local data.
 */
import { useState, useEffect, useMemo } from 'react'
import { tmdb } from '../../tmdb'
import { useFilmStore } from '../../store'
import { useNavigate } from 'react-router-dom'

export default function FilmRecommendations() {
  const logs = useFilmStore(state => state.logs)
  const navigate = useNavigate()
  const [recs, setRecs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  // Compute top 3 genre IDs from user's highest-rated films
  const topGenreIds = useMemo(() => {
    const genreScores: Record<number, number> = {}
    logs.forEach((log: any) => {
      if (log.rating >= 3.5 && log.genres) {
        log.genres.forEach((g: any) => {
          const id = typeof g === 'number' ? g : g?.id
          if (id) genreScores[id] = (genreScores[id] || 0) + log.rating
        })
      }
    })
    return Object.entries(genreScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([id]) => Number(id))
  }, [logs])

  // Set of already-logged film IDs
  const loggedIds = useMemo(() => new Set(logs.map((l: any) => l.filmId)), [logs])

  useEffect(() => {
    if (topGenreIds.length === 0 || logs.length < 5) return
    setLoading(true)

    const params: Record<string, string> = {
      with_genres: topGenreIds.join(','),
      sort_by: 'vote_average.desc',
      'vote_count.gte': '100',
      page: '1',
    }

    tmdb.discover(params).then((data: any) => {
      const filtered = (data?.results || [])
        .filter((f: any) => !loggedIds.has(f.id))
        .slice(0, 6)
      setRecs(filtered)
      setLoading(false)
    })
  }, [topGenreIds, loggedIds, logs.length])

  if (logs.length < 5 || recs.length === 0) return null

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <div className="section-title" style={{ marginBottom: '1rem' }}>CURATED FOR YOU</div>
      <div style={{
        fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em',
        color: 'var(--fog)', marginBottom: '1.25rem',
      }}>
        BASED ON YOUR HIGHEST-RATED FILMS
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
        gap: '0.5rem',
      }}>
        {recs.map(film => (
          <div
            key={film.id}
            onClick={() => navigate(`/film/${film.id}`)}
            className="projector-glow"
            style={{ cursor: 'pointer', borderRadius: '3px', overflow: 'hidden' }}
          >
            {film.poster_path ? (
              <img
                src={tmdb.poster(film.poster_path, 'w185')}
                alt={film.title}
                loading="lazy"
                style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <div style={{
                width: '100%', aspectRatio: '2/3',
                background: 'var(--soot)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-ui)', fontSize: '0.4rem', color: 'var(--ash)',
              }}>
                NO POSTER
              </div>
            )}
            <div style={{
              fontFamily: 'var(--font-ui)', fontSize: '0.4rem', letterSpacing: '0.08em',
              color: 'var(--fog)', padding: '0.35rem 0.25rem 0', lineHeight: 1.2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {film.title}
            </div>
          </div>
        ))}
      </div>

      {loading && (
        <div style={{
          fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.2em',
          color: 'var(--sepia)', textAlign: 'center', padding: '1rem', opacity: 0.6,
        }}>
          SCREENING CANDIDATES…
        </div>
      )}
    </div>
  )
}
