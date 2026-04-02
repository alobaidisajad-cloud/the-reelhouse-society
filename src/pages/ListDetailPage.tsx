import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store'
import { SectionHeader, LoadingReel } from '../components/UI'
import { ArrowLeft, Clock, Film, Edit3, Trash2, MessageCircle } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import PageSEO from '../components/PageSEO'
import CreateListModal from '../components/CreateListModal'
import ListActions from '../components/ListActions'
import ReportButton from '../components/ReportButton'
import ShareToLoungeModal from '../components/ShareToLoungeModal'
import { useState } from 'react'

import toast from 'react-hot-toast'

export default function ListDetailPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { user: currentUser } = useAuthStore()
    const queryClient = useQueryClient()

    const [isEditing, setIsEditing] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [showShareLounge, setShowShareLounge] = useState(false)
    const isArchivist = currentUser && ['archivist', 'auteur', 'projectionist'].includes((currentUser as any).role)
    const isAuteurRole = (currentUser as any)?.role === 'auteur' || (currentUser as any)?.role === 'projectionist'



    // Fetch list detail from Supabase
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

            // Fetch counts
            const [endorsementsResp, commentsResp] = await Promise.all([
                supabase.from('interactions').select('user_id', { count: 'exact', head: false }).eq('target_list_id', id).eq('type', 'endorse_list'),
                supabase.from('list_comments').select('id', { count: 'exact', head: true }).eq('list_id', id)
            ])
            const classify = (endorsementsResp.data || []).find((e: any) => e.user_id === currentUser?.id)

            return {
                id: data.id,
                title: data.title,
                description: data.description,
                userId: data.user_id,
                user: profile?.username || 'anonymous',
                films: (items || []).map((item: any) => ({
                    id: item.film_id,
                    title: item.film_title,
                    poster_path: item.poster_path,
                })),
                createdAt: data.created_at,
                isPrivate: data.is_private,
                certifyCount: endorsementsResp.count || endorsementsResp.data?.length || 0,
                isCertified: !!classify,
                commentCount: commentsResp.count || 0,
            }
        },
        enabled: !!id,
        staleTime: 1000 * 60 * 2,
    })

    if (isLoading) return (
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

    const list = remoteList

    if (!list) {
        return (
            <div style={{ paddingTop: 100, textAlign: 'center', minHeight: '100dvh', background: 'var(--ink)' }}>
                <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--sepia)' }}>Archive Missing</h1>
                <p style={{ color: 'var(--fog)', marginTop: '1rem', fontFamily: 'var(--font-ui)' }}>This collection cannot be located in the vault.</p>
                <button onClick={() => navigate(-1)} className="btn btn-ghost" style={{ marginTop: '2rem' }}>GO BACK</button>
            </div>
        )
    }

    const { title, description, desc, user: listUser, userId: listUserId, films = [], createdAt, certifyCount = 0, isCertified = false, commentCount = 0 } = list as any
    const isOwner = currentUser?.id && listUserId && currentUser.id === listUserId
    const displayDesc = description || desc
    const authorParam = listUser || 'YOU'

    // Format created date if real
    const displayDate = createdAt ? new Date(createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'ARCHIVE REEL'

    return (
        <div style={{ paddingTop: 70, minHeight: '100dvh', background: 'var(--ink)' }}>
            <style>{`
                .list-detail-container {
                    max-width: 1000px;
                    margin: 0 auto;
                    padding: 2rem 1rem;
                    display: flex;
                    flex-direction: column;
                    gap: 2rem;
                }
                @media (min-width: 600px) {
                    .list-detail-container {
                        padding: 3rem 1.5rem;
                        gap: 3rem;
                    }
                }
            `}</style>
            <div className="list-detail-container">

                <button onClick={() => navigate(-1)} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--sepia)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', marginLeft: '-0.5rem', alignSelf: 'flex-start', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--parchment)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--sepia)'}>
                    <ArrowLeft size={12} /> GO BACK
                </button>

                <header style={{ borderBottom: '1px solid rgba(139,105,20,0.3)', paddingBottom: '2.5rem', position: 'relative' }}>
                    
                    {/* Actions for owner */}
                    {isOwner && (
                        <div style={{ position: 'absolute', top: 0, right: 0, display: 'flex', gap: '0.5rem' }}>
                            <button onClick={() => setIsEditing(true)} className="btn btn-ghost" style={{ padding: '0.4rem', color: 'var(--fog)' }} title="Edit List">
                                <Edit3 size={16} />
                            </button>
                            <button onClick={() => setIsDeleting(true)} className="btn btn-ghost" style={{ padding: '0.4rem', color: 'var(--danger)', opacity: 0.8 }} title="Delete List">
                                <Trash2 size={16} />
                            </button>
                        </div>
                    )}

                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.4em', color: 'var(--sepia)', marginBottom: '1rem' }}>
                        THE STACKS — VOLUME {id}
                    </div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.5rem, 6vw, 4rem)', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '1.5rem', textShadow: '0 4px 15px rgba(0,0,0,0.5)' }}>
                        {title}
                    </h1>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--sepia)' }} />
                            CURATED BY <Link to={listUser ? `/user/${authorParam}` : '#'} style={{ color: 'var(--bone)', textDecoration: 'none' }}>@{authorParam.toUpperCase()}</Link>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Film size={12} /> {films.length} ENTRIES</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Clock size={12} /> {displayDate}</div>
                    </div>

                    {displayDesc && (
                        <p style={{ marginTop: '2rem', fontFamily: 'var(--font-sub)', fontSize: '1.1rem', color: 'var(--bone)', lineHeight: 1.6, maxWidth: 800 }}>
                            {displayDesc}
                        </p>
                    )}

                    <div style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <ListActions 
                            listId={id as string} 
                            certifyCount={certifyCount} 
                            isCertified={isCertified} 
                            commentCount={commentCount} 
                        />
                        {!isOwner && <ReportButton contentType="list" contentId={id as string} />}
                        {isArchivist && (
                            <button
                                className="btn btn-ghost"
                                onClick={() => setShowShareLounge(true)}
                                style={{ fontSize: '0.6rem', padding: '0.35rem 0.75rem', borderColor: 'rgba(139,105,20,0.3)', color: 'var(--sepia)' }}
                            >
                                <MessageCircle size={12} /> Lounge
                            </button>
                        )}
                    </div>
                </header>

                <section>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.5rem' }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.2em', color: 'var(--sepia)' }}>INDEXED REELS</div>
                        <div style={{ height: 1, flex: 1, background: 'linear-gradient(90deg, transparent, rgba(139,105,20,0.2), transparent)', margin: '0 1rem' }} />
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>
                            {films.length} {films.length === 1 ? 'FILM' : 'FILMS'}
                        </div>
                    </div>

                    {films.length === 0 ? (
                        <div style={{ padding: '4rem 2rem', textAlign: 'center', background: 'rgba(22,18,12,0.5)', border: '1px dashed rgba(139,105,20,0.25)', borderRadius: '2px' }}>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--sepia)', marginBottom: '0.5rem' }}>Empty Archive</div>
                            <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--fog)', lineHeight: 1.5, maxWidth: 400, margin: '0 auto' }}>
                                {isOwner
                                    ? "To populate this anthology, search for a film, click 'LOG', and toggle it in the 'Add to Anthology' drawer."
                                    : "No films have been added to this collection yet."}
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Responsive CSS — 3 columns on mobile, auto-fill on desktop */}
                            <style>{`
                                .list-film-grid {
                                    display: grid;
                                    grid-template-columns: repeat(3, 1fr);
                                    gap: 0.6rem;
                                }
                                @media (min-width: 600px) {
                                    .list-film-grid {
                                        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
                                        gap: 1.25rem;
                                    }
                                }
                                @media (min-width: 900px) {
                                    .list-film-grid {
                                        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
                                        gap: 1.5rem;
                                    }
                                }
                                .list-film-item {
                                    position: relative;
                                    text-decoration: none;
                                    display: block;
                                    border-radius: 3px;
                                    overflow: hidden;
                                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                                }
                                .list-film-item:hover {
                                    transform: translateY(-3px);
                                    box-shadow: 0 8px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(139,105,20,0.3);
                                }
                                .list-film-poster {
                                    width: 100%;
                                    aspect-ratio: 2/3;
                                    object-fit: cover;
                                    display: block;
                                    background: #0d0b09;
                                    border: 1px solid rgba(139,105,20,0.1);
                                    border-radius: 3px;
                                }
                                .list-film-number {
                                    position: absolute;
                                    top: -1px;
                                    left: -1px;
                                    width: 22px;
                                    height: 22px;
                                    background: var(--sepia);
                                    color: var(--ink);
                                    border-radius: 0 0 6px 0;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    font-family: var(--font-ui);
                                    font-size: 0.5rem;
                                    font-weight: bold;
                                    z-index: 5;
                                    letter-spacing: 0;
                                }
                                @media (min-width: 600px) {
                                    .list-film-number {
                                        width: 26px;
                                        height: 26px;
                                        font-size: 0.55rem;
                                    }
                                }
                                .list-film-title {
                                    margin-top: 0.4rem;
                                    font-family: var(--font-sub);
                                    font-size: 0.65rem;
                                    color: var(--parchment);
                                    line-height: 1.2;
                                    text-align: center;
                                    overflow: hidden;
                                    text-overflow: ellipsis;
                                    display: -webkit-box;
                                    -webkit-line-clamp: 2;
                                    -webkit-box-orient: vertical;
                                }
                                @media (min-width: 600px) {
                                    .list-film-title {
                                        font-size: 0.8rem;
                                        margin-top: 0.6rem;
                                    }
                                }
                                .list-film-fallback {
                                    width: 100%;
                                    aspect-ratio: 2/3;
                                    background: #0d0b09;
                                    border: 1px solid rgba(139,105,20,0.12);
                                    border-radius: 3px;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                }
                            `}</style>
                            <div className="list-film-grid">
                                {films.map((f: any, i: number) => {
                                    const posterUrl = f.poster_path
                                        ? `https://image.tmdb.org/t/p/w342${f.poster_path}`
                                        : null

                                    return (
                                        <Link
                                            key={f.id ?? i}
                                            to={`/film/${f.id}`}
                                            className={`list-film-item fade-in-up${isOwner && isArchivist && !isAuteurRole ? ' archivist-card-glow' : isOwner && isAuteurRole ? ' auteur-card-glow' : ''}`}
                                            style={{ animationDelay: `${Math.min(i * 0.03, 0.5)}s` }}
                                        >
                                            <div className="list-film-number">{i + 1}</div>
                                            {posterUrl ? (
                                                <img
                                                    src={posterUrl}
                                                    alt={f.title || 'Film'}
                                                    className="list-film-poster"
                                                    loading="lazy"
                                                    decoding="async"
                                                />
                                            ) : (
                                                <div className="list-film-fallback">
                                                    <img src="/reelhouse-logo.svg" alt="ReelHouse" style={{ width: '60%', opacity: 0.3 }} />
                                                </div>
                                            )}
                                            <div className="list-film-title">{f.title}</div>
                                        </Link>
                                    )
                                })}
                            </div>
                        </>
                    )}
                </section>
            </div>

            {/* Editing Modal */}
            {isEditing && (
                <CreateListModal 
                    initialList={{ ...list, isPrivate: list.isPrivate ?? false }}
                    onClose={() => setIsEditing(false)}
                    onCreate={async (updates: any) => {
                        try {
                            // 1. Update list metadata in Supabase
                            const dbUpdates: any = {}
                            if (updates.title !== undefined) dbUpdates.title = updates.title
                            if (updates.description !== undefined) dbUpdates.description = updates.description
                            if (updates.isPrivate !== undefined) dbUpdates.is_private = updates.isPrivate

                            const { error } = await supabase.from('lists').update(dbUpdates).eq('id', list.id).eq('user_id', currentUser!.id)
                            if (error) throw error

                            // 2. Sync films (diff old vs new)
                            if (updates.films) {
                                const oldIds = new Set(list.films.map((f: any) => f.id))
                                const newIds = new Set(updates.films.map((f: any) => f.id))

                                const toAdd = updates.films.filter((f: any) => !oldIds.has(f.id))
                                const toRemove = list.films.filter((f: any) => !newIds.has(f.id))

                                for (const f of toAdd) {
                                    try {
                                        await supabase.from('list_items').insert({
                                            list_id: list.id,
                                            film_id: f.id,
                                            film_title: f.title || 'Unknown',
                                            poster_path: f.poster_path || null,
                                        })
                                    } catch (e) { console.error(e) }
                                }
                                for (const f of toRemove) {
                                    try {
                                        await supabase.from('list_items').delete()
                                            .eq('list_id', list.id).eq('film_id', f.id)
                                    } catch (e) { console.error(e) }
                                }
                            }

                            toast.success('Collection updated!')
                            // Refresh detail + stacks page
                            queryClient.invalidateQueries({ queryKey: ['list-detail', id] })
                            queryClient.invalidateQueries({ queryKey: ['all-public-lists'] })
                        } catch (e) {
                            console.error('Failed updating list', e)
                            toast.error('Failed to update collection')
                        }
                    }}
                />
            )}

            {/* Deletion Confirmation */}
            {isDeleting && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(10,7,3,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }} onClick={() => setIsDeleting(false)}>
                    <div onClick={e => e.stopPropagation()} style={{ background: 'var(--ink)', border: '1px solid var(--danger)', padding: '2rem', borderRadius: '4px', maxWidth: 400, textAlign: 'center' }}>
                        <Trash2 size={32} color="var(--danger)" style={{ marginBottom: '1rem' }} />
                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--parchment)', marginBottom: '1rem' }}>Destroy Archive?</h3>
                        <p style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--fog)', marginBottom: '2rem' }}>
                            This cannot be undone. All entries in "{title}" will be lost from the stacks.
                        </p>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setIsDeleting(false)}>ABORT</button>
                            <button className="btn" style={{ flex: 1, justifyContent: 'center', background: 'var(--soot)', color: 'var(--danger)', border: '1px solid var(--danger)' }} onClick={async () => {
                                try {
                                    // Delete list items first, then the list
                                    await supabase.from('list_items').delete().eq('list_id', list.id)
                                    const { error } = await supabase.from('lists').delete().eq('id', list.id).eq('user_id', currentUser!.id)
                                    if (error) throw error
                                    toast.success('Archive destroyed.')
                                    queryClient.invalidateQueries({ queryKey: ['all-public-lists'] })
                                    navigate('/stacks')
                                } catch (e) { toast.error('Failed to destroy archive.') }
                            }}>CONFIRM</button>
                        </div>
                    </div>
                </div>
            )}

            {showShareLounge && list && (
                <ShareToLoungeModal
                    payload={{
                        type: 'list_share',
                        title: title,
                        subtitle: `${films.length} films · by @${authorParam}`,
                        image: films[0]?.poster_path ? `https://image.tmdb.org/t/p/w185${films[0].poster_path}` : undefined,
                        metadata: {
                            listId: list.id,
                            title: title,
                            filmCount: films.length,
                            curator: authorParam,
                            topPosters: films.slice(0, 4).map((f: any) => f.poster_path),
                        },
                    }}
                    onClose={() => setShowShareLounge(false)}
                />
            )}
        </div>
    )
}
