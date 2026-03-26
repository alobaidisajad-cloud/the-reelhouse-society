import { useParams, Link, useNavigate } from 'react-router-dom'
import { useFilmStore } from '../store'
import { FilmCard, SectionHeader, LoadingReel } from '../components/UI'
import { ArrowLeft, Clock, Film } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import PageSEO from '../components/PageSEO'

export default function ListDetailPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { lists: userLists } = useFilmStore()

    // Check local user lists first — fast, no network needed
    const localList = userLists.find((l: any) => l.id.toString() === id)

    // Fetch from Supabase for any community list (only fires when not found locally)
    const { data: remoteList, isLoading } = useQuery({
        queryKey: ['list-detail', id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('lists')
                .select('id, title, description, created_at, user_id, is_private')
                .eq('id', id)
                .maybeSingle()
            if (error || !data) return null

            // Resolve username
            const { data: profile } = await supabase
                .from('profiles').select('username').eq('id', data.user_id).maybeSingle()

            // Resolve list items
            const { data: items } = await supabase
                .from('list_items').select('film_id, film_title, poster_path').eq('list_id', id)

            return {
                id: data.id,
                title: data.title,
                description: data.description,
                user: profile?.username || 'anonymous',
                films: (items || []).map((item: any) => ({
                    id: item.film_id,
                    title: item.film_title,
                    poster_path: item.poster_path,
                })),
                createdAt: data.created_at,
                isPrivate: data.is_private,
            }
        },
        enabled: !localList && !!id,
        staleTime: 1000 * 60 * 5,
    })

    if (!localList && isLoading) return (
        <div style={{ paddingTop: 70, minHeight: '100dvh', background: 'var(--ink)' }}>
            <div style={{ maxWidth: 1000, margin: '0 auto', padding: '3rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                <div className="shimmer" style={{ height: '0.6rem', width: 100, borderRadius: '2px' }} />
                <div>
                    <div className="shimmer" style={{ height: '0.65rem', width: '20%', borderRadius: '2px', marginBottom: '1rem' }} />
                    <div className="shimmer" style={{ height: '3rem', width: '55%', borderRadius: '2px', marginBottom: '1.5rem' }} />
                    <div style={{ display: 'flex', gap: '1.5rem' }}>
                        <div className="shimmer" style={{ height: '0.6rem', width: 80, borderRadius: '2px' }} />
                        <div className="shimmer" style={{ height: '0.6rem', width: 60, borderRadius: '2px' }} />
                        <div className="shimmer" style={{ height: '0.6rem', width: 90, borderRadius: '2px' }} />
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1.5rem' }}>
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div className="shimmer" style={{ aspectRatio: '2/3', width: '100%', borderRadius: '2px', animationDelay: `${i * 0.06}s` }} />
                            <div className="shimmer" style={{ height: '0.7rem', width: '70%', borderRadius: '2px', animationDelay: `${i * 0.06 + 0.1}s` }} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )

    const list = localList || remoteList

    if (!list) {
        return (
            <div style={{ paddingTop: 100, textAlign: 'center', minHeight: '100dvh', background: 'var(--ink)' }}>
                <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--sepia)' }}>Archive Missing</h1>
                <p style={{ color: 'var(--fog)', marginTop: '1rem', fontFamily: 'var(--font-ui)' }}>This collection cannot be located in the vault.</p>
                <button onClick={() => navigate(-1)} className="btn btn-ghost" style={{ marginTop: '2rem' }}>GO BACK</button>
            </div>
        )
    }

    const { title, description, desc, user, films = [], createdAt } = list as any
    const displayDesc = description || desc
    const authorParam = user || 'YOU'

    // Format created date if real
    const displayDate = createdAt ? new Date(createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'ARCHIVE REEL'

    return (
        <div style={{ paddingTop: 70, minHeight: '100dvh', background: 'var(--ink)' }}>
            <div style={{ maxWidth: 1000, margin: '0 auto', padding: '3rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '3rem' }}>

                <button onClick={() => navigate(-1)} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--fog)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', marginLeft: '-0.5rem', alignSelf: 'flex-start', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--parchment)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--fog)'}>
                    <ArrowLeft size={12} /> GO BACK
                </button>

                <header style={{ borderBottom: '1px solid rgba(139,105,20,0.3)', paddingBottom: '2.5rem' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.4em', color: 'var(--sepia)', marginBottom: '1rem' }}>
                        THE STACKS — VOLUME {id}
                    </div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.5rem, 6vw, 4rem)', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '1.5rem', textShadow: '0 4px 15px rgba(0,0,0,0.5)' }}>
                        {title}
                    </h1>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--sepia)' }} />
                            CURATED BY <Link to={user ? `/user/${authorParam}` : '#'} style={{ color: 'var(--bone)', textDecoration: 'none' }}>@{authorParam.toUpperCase()}</Link>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Film size={12} /> {films.length} ENTRIES</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Clock size={12} /> {displayDate}</div>
                    </div>

                    {displayDesc && (
                        <p style={{ marginTop: '2rem', fontFamily: 'var(--font-sub)', fontSize: '1.1rem', color: 'var(--bone)', lineHeight: 1.6, maxWidth: 800 }}>
                            {displayDesc}
                        </p>
                    )}
                </header>

                <section>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.5rem' }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.2em', color: 'var(--sepia)' }}>INDEXED REELS</div>
                        <div style={{ height: 1, flex: 1, background: 'linear-gradient(90deg, transparent, rgba(139,105,20,0.2), transparent)', margin: '0 1rem' }} />
                    </div>

                    {films.length === 0 ? (
                        <div style={{ padding: '4rem 2rem', textAlign: 'center', background: 'var(--soot)', border: '1px dashed var(--ash)', borderRadius: '2px' }}>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--sepia)', marginBottom: '0.5rem' }}>Empty Archive</div>
                            <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--fog)' }}>No films have been added to this collection yet.</div>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1.5rem' }}>
                            {films.map((f: any, i: number) => (
                                <Link key={i} to={`/film/${f.id}`} style={{ textDecoration: 'none', display: 'block' }} className="fade-in-up">
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ position: 'absolute', top: -10, left: -10, width: 30, height: 30, background: 'var(--sepia)', color: 'var(--ink)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-ui)', fontSize: '0.65rem', fontWeight: 'bold', zIndex: 10, boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
                                            {i + 1}
                                        </div>
                                        <FilmCard film={f} />
                                    </div>
                                    <div style={{ marginTop: '0.75rem', fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: 'var(--parchment)', lineHeight: 1.2, textAlign: 'center' }}>{f.title}</div>
                                </Link>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    )
}
