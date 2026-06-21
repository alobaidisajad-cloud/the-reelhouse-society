import { Link } from 'react-router-dom'
import { Play, Film } from 'lucide-react'
import { tmdb, formatRuntime } from '../../../tmdb'
import { SectionHeader, PersonPlaceholder } from '../../../components/UI'
import CommunityReviews from '../../../components/film/CommunityReviews'
import WatchProviders from '../../../components/film/WatchProviders'
import CountryReleases from '../../../components/film/CountryReleases'
import ViewingChronicle from '../../../components/film/ViewingChronicle'
import { useViewport } from '../../../hooks/useViewport'
import { useFilmStore } from '../../../store'

export function FilmDetailsSection({ film, onPlayVideo }: any) {
    const { isTouch: IS_TOUCH } = useViewport()
    const director = film.credits?.crew?.find((c: any) => c.job === 'Director')
    const cast = film.credits?.cast?.slice(0, 8) || []

    // Grab all trailers + teasers for a richer video section
    const allVideos = film.videos?.results?.filter((v: any) => v.site === 'YouTube') || []
    const trailer = allVideos.find((v: any) => v.type === 'Trailer') || allVideos[0]

    // Watch providers (already in detail via append_to_response)
    const providers = film['watch/providers']?.results || null

    // Studios
    const studios = film.production_companies || []

    return (
        <div className="layout-sidebar reversed">
            <div className="teletype-container" style={{ display: 'flex', flexDirection: 'column', gap: IS_TOUCH ? '1.5rem' : '2.5rem' }}>
                <div>
                    <SectionHeader label="SYNOPSIS" title="About the Film" />
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--bone)', lineHeight: 1.8 }}>
                        {film.overview || 'No synopsis available.'}
                    </p>
                </div>

                {/* Cast */}
                {cast.length > 0 && (
                    <div>
                        <SectionHeader label="CAST" title="The Players" />
                        <div className="cast-grid">
                            {cast.map((member: any) => (
                                <Link key={member.id} to={`/person/${member.id}`} className="cast-item"
                                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                >
                                    <div className="cast-photo">
                                        {member.profile_path ? (
                                            <img src={tmdb.profile(member.profile_path) || undefined} alt={member.name} decoding="async" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.15) contrast(1.05)' }} />
                                        ) : (
                                            <PersonPlaceholder size="100%" />
                                        )}
                                    </div>
                                    <div className="cast-name">{member.name}</div>
                                    <div className="cast-role">{member.character}</div>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {/* Videos / Extra Trailers */}
                {allVideos.length > 1 && (
                    <div>
                        <SectionHeader label="FOOTAGE" title="More Videos" />
                        <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '0.5rem', marginLeft: IS_TOUCH ? '-1.25rem' : 0, paddingLeft: IS_TOUCH ? '1.25rem' : 0 }}>
                            {allVideos.slice(0, 6).map((v: any) => (
                                <button key={v.id} onClick={() => onPlayVideo(v.key)}
                                    style={{ flexShrink: 0, width: IS_TOUCH ? 160 : 200, background: 'var(--soot)', border: '1px solid rgba(139,105,20,0.2)', borderRadius: '4px', cursor: 'pointer', overflow: 'hidden', textAlign: 'left', padding: 0, position: 'relative', transition: 'border-color 0.25s, box-shadow 0.25s' }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--sepia)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.6), 0 0 12px rgba(139,105,20,0.2)' }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(139,105,20,0.2)'; e.currentTarget.style.boxShadow = 'none' }}
                                >
                                    <div style={{ position: 'relative', aspectRatio: '16/9', overflow: 'hidden' }}>
                                        <img src={`https://img.youtube.com/vi/${v.key}/mqdefault.jpg`} alt={v.name} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.3)', display: 'block' }} />
                                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(139,105,20,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Play size={14} fill="rgba(242,232,160,0.9)" color="transparent" />
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ padding: '0.5rem 0.6rem' }}>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', color: 'var(--sepia)', marginBottom: '0.2rem' }}>{v.type?.toUpperCase()}</div>
                                        <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.65rem', color: 'var(--bone)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Reviews — Dynamic from Supabase, fallback to curated */}
                <CommunityReviews filmId={film.id} />
            </div>

            {/* Sidebar */}
            <div className="teletype-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Trailer — desktop inline card */}
                {trailer && !IS_TOUCH && (
                    <div className="card" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }} onClick={() => onPlayVideo(trailer.key)}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--sepia)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--ash)'}
                    >
                        <div style={{ position: 'relative', aspectRatio: '16/9', overflow: 'hidden' }}>
                            <img src={`https://img.youtube.com/vi/${trailer.key}/mqdefault.jpg`} alt="Trailer" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.3)', display: 'block', transition: 'transform 0.4s ease', transform: 'scale(1.02)' }} />
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.7))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(10,7,3,0.8)', border: '2px solid rgba(139,105,20,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(139,105,20,0.3)' }}>
                                    <Play size={20} fill="rgba(242,232,160,0.95)" color="transparent" />
                                </div>
                            </div>
                        </div>
                        <div style={{ padding: '0.75rem 1rem' }}>
                            <div className="ui-micro" style={{ color: 'var(--sepia)', marginBottom: '0.2rem' }}>OFFICIAL TRAILER</div>
                            <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.75rem', color: 'var(--bone)', lineHeight: 1.2 }}>{trailer.name}</div>
                        </div>
                    </div>
                )}

                {/* Director */}
                {director && (
                    <Link to={`/person/${director.id}`} className="card" style={{ textDecoration: 'none', display: 'block' }}>
                        <div className="section-title" style={{ marginBottom: '0.5rem' }}>DIRECTED BY</div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--parchment)' }}>{director.name}</div>
                    </Link>
                )}

                {/* Streaming Providers */}
                <WatchProviders providers={providers} />

                {/* Film Dossier */}
                <div className="card glass-panel">
                    <div className="section-title">FILM DOSSIER</div>
                    {[
                        { label: 'GENRES', value: film.genres?.map((g: any) => g.name).join(', ') },
                        { label: 'RELEASE', value: film.release_date ? new Date(film.release_date + 'T12:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase() : '—' },
                        { label: 'RUNTIME', value: formatRuntime(film.runtime) },
                        { label: 'STATUS', value: film.status },
                        { label: 'LANGUAGE', value: film.original_language?.toUpperCase() },
                        { label: 'BUDGET', value: film.budget > 0 ? `$${(film.budget / 1e6).toFixed(1)}M` : 'Unknown' },
                        { label: 'REVENUE', value: film.revenue > 0 ? `$${(film.revenue / 1e6).toFixed(1)}M` : 'Unknown' },
                    ].map(({ label, value }: any) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--ash)' }}>
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>{label}</span>
                            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--bone)' }}>{value || '—'}</span>
                        </div>
                    ))}
                </div>

                {/* Production Studios */}
                {studios.length > 0 && (
                    <div className="card glass-panel">
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Film size={12} /> PRODUCTION STUDIOS
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            {studios.slice(0, 5).map((studio: any) => (
                                <div key={studio.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    {studio.logo_path ? (
                                        <div style={{ width: 40, height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', padding: '2px' }}>
                                            <img src={`https://image.tmdb.org/t/p/w185${studio.logo_path}`} alt={studio.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: 'brightness(0.8) sepia(0.2)' }} />
                                        </div>
                                    ) : (
                                        <div style={{ width: 40, height: 24, flexShrink: 0, background: 'var(--ash)', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Film size={10} color="var(--fog)" />
                                        </div>
                                    )}
                                    <div>
                                        <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.75rem', color: 'var(--bone)', lineHeight: 1.2 }}>{studio.name}</div>
                                        {studio.origin_country && <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', color: 'var(--fog)', marginTop: '0.1rem' }}>{studio.origin_country}</div>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Country Releases */}
                <CountryReleases releaseDates={film.release_dates} />
            </div>
        </div>
    )
}

export function ViewingChronicleSection({ filmId }: { filmId: number }) {
    const log = useFilmStore(s => s._loggedIndex[filmId])
    if (!log || !log.viewingHistory?.length) return null
    return <ViewingChronicle log={log} />
}
