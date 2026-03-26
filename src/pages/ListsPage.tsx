import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useFilmStore, useAuthStore, useUIStore } from '../store'
import { SectionHeader, FilmCard } from '../components/UI'
import Buster from '../components/Buster'
import { tmdb } from '../tmdb'
import { Plus, Lock, Globe, Search as SearchIcon, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import toast from 'react-hot-toast'
import PageSEO from '../components/PageSEO'

// Detect touch/mobile once at module level
const IS_TOUCH = typeof window !== 'undefined' && window.matchMedia('(any-pointer: coarse)').matches

// Community lists are fetched live from Supabase


function UnbreakablePoster({ posterPath, title, isTop }: any) {
    const [failed, setFailed] = useState(!posterPath)

    // If it's the top poster, we want it to be more vibrant
    // If it's a fallback, we use a stylized box with typography
    return (
        <div style={{
            width: 105, height: 158,
            background: 'var(--soot)',
            borderRadius: '1px',
            overflow: 'hidden',
            position: 'relative',
            boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
            border: '1px solid rgba(255,255,255,0.05)',
            flexShrink: 0
        }}>
            {!failed ? (
                <img
                    src={tmdb.poster(posterPath, 'w185')}
                    alt={title}
                    loading="lazy"
                    decoding="async"
                    onError={() => setFailed(true)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', mixBlendMode: isTop ? 'normal' : 'luminosity', opacity: isTop ? 1 : 0.4 }}
                />
            ) : (
                <div style={{
                    width: '100%', height: '100%',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    padding: '0.5rem', textAlign: 'center',
                    background: 'linear-gradient(45deg, #1A1710 0%, #0A0703 100%)',
                    border: '1px solid var(--sepia)'
                }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--sepia)', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
                        REELHOUSE
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.7rem', color: 'var(--parchment)', lineHeight: 1.2, textTransform: 'uppercase' }}>
                        {title}
                    </div>
                </div>
            )}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 60%, rgba(0,0,0,0.8) 100%)', pointerEvents: 'none' }} />
        </div>
    )
}

function CommunityListCard({ list }: any) {
    // Deterministic gradient fallback — no external image dependency, zero 404 risk
    const gradients = [
        'linear-gradient(135deg, #1a0e05 0%, #3a2010 40%, #0a0703 100%)',
        'linear-gradient(135deg, #0a0a0a 0%, #1c1710 50%, #2a1a05 100%)',
        'linear-gradient(135deg, #05080a 0%, #101820 50%, #1a2010 100%)',
        'linear-gradient(135deg, #0a0508 0%, #1a0f18 50%, #0a0508 100%)',
    ]
    const cardGradient = gradients[Math.abs(list.id.charCodeAt(0)) % gradients.length]

    // Check if we have at least one valid poster path from TMDB (these are reliable)
    const primaryPoster = list.films.find((f: any) => f.poster_path)?.poster_path
    const [imgSrc, setImgSrc] = useState(primaryPoster ? tmdb.poster(primaryPoster, 'w500') : null)
    const [failed, setFailed] = useState(!primaryPoster)

    return (
        <Link
            to={`/lists/${list.id}`}
            className="fade-in-up"
            style={{
                textDecoration: 'none',
                color: 'inherit',
                background: 'var(--ink)', border: '1px solid var(--ash)',
                borderRadius: 'none', height: 480, display: 'flex', flexDirection: 'column',
                boxShadow: '0 25px 60px rgba(0,0,0,0.7)', cursor: 'pointer', transition: 'all 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)',
                position: 'relative', overflow: 'hidden'
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--sepia)'
                e.currentTarget.style.transform = 'translateY(-12px) scale(1.02)'
                const poster = e.currentTarget.querySelector('.main-poster') as HTMLElement
                if (poster) poster.style.transform = 'scale(1.1) rotate(1deg)'
                const pane = e.currentTarget.querySelector('.content-pane') as HTMLElement
                if (pane) pane.style.transform = 'translateY(0)'
                const glow = e.currentTarget.querySelector('.card-glow') as HTMLElement
                if (glow) glow.style.opacity = '0.6'
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--ash)'
                e.currentTarget.style.transform = 'translateY(0) scale(1)'
                const poster = e.currentTarget.querySelector('.main-poster') as HTMLElement
                if (poster) poster.style.transform = 'scale(1) rotate(0deg)'
                const pane = e.currentTarget.querySelector('.content-pane') as HTMLElement
                if (pane) pane.style.transform = 'translateY(10px)'
                const glow = e.currentTarget.querySelector('.card-glow') as HTMLElement
                if (glow) glow.style.opacity = '0.3'
            }}
        >
            {/* Main Visual Poster */}
            <div
                className="main-poster"
                style={{
                    position: 'absolute', inset: 0, zIndex: 0,
                    transition: 'transform 1.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
                }}
            >
                {failed || !imgSrc ? (
                    // No-request gradient fallback — deterministic from list ID, always renders
                    <div style={{ width: '100%', height: '100%', background: cardGradient }} />
                ) : (
                    <img
                        src={imgSrc}
                        alt={list.title}
                        loading="lazy"
                        decoding="async"
                        onError={() => setFailed(true)}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.7) sepia(0.2)' }}
                    />
                )}
            </div>

            {/* Overlays */}
            <div className="card-glow" style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top left, var(--sepia) 0%, transparent 60%)', opacity: 0.3, zIndex: 1, transition: 'opacity 0.6s' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 30%, var(--ink) 95%)', zIndex: 2 }} />

            {/* Content Pane */}
            <div
                className="content-pane"
                style={{
                    position: 'relative', zIndex: 10, marginTop: 'auto', padding: '2rem',
                    transition: 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)',
                    transform: 'translateY(10px)'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.4em', color: 'var(--sepia)', border: '1px solid var(--sepia)', padding: '2px 8px' }}>
                        {list.count} VOLS
                    </span>
                    <div style={{ height: '1px', flex: 1, background: 'linear-gradient(to right, var(--sepia), transparent)' }} />
                </div>

                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--parchment)', marginBottom: '0.75rem', textShadow: '0 5px 15px rgba(0,0,0,0.9)', lineHeight: 1 }}>
                    {list.title.toUpperCase()}
                </h3>

                <p style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--fog)', lineHeight: 1.5, marginBottom: '1.5rem', opacity: 0.8 }}>
                    {list.desc}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderTop: '1px solid rgba(139,105,20,0.3)', paddingTop: '1.25rem' }}>
                    <div style={{ width: 14, height: 14, background: 'var(--sepia)', borderRadius: '50%' }} />
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--bone)', textDecoration: 'none' }}
                        onClick={e => e.stopPropagation()}>
                        @{list.user.toUpperCase()}
                    </span>
                </div>
            </div>

            {/* Top Badge */}
            <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 10, writingMode: 'vertical-rl', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.5em', color: 'var(--sepia)', opacity: 0.7 }}>
                ARCHIVE-REEL
            </div>
        </Link>
    )
}

function CreateListModal({ onClose, onCreate }: any) {
    const [title, setTitle] = useState('')
    const [desc, setDesc] = useState('')
    const [isPrivate, setIsPrivate] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const handleCreate = async () => {
        if (!title.trim()) { toast.error('Give your list a name'); return }
        if (submitting) return
        setSubmitting(true)
        try {
            await onCreate({ title: title.trim(), description: desc.trim(), isPrivate })
            toast.success(`List "${title}" created!`)
            onClose()
        } catch (error) {
            toast.error('Failed to create list.')
            setSubmitting(false)
        }
    }

    return (
        <div
            className="fade-in"
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 10000,
                background: 'rgba(10,7,3,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
                backdropFilter: 'blur(8px)'
            }}
        >
            <div
                className="fade-in-up"
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: 'var(--ink)', border: '1px solid var(--sepia)',
                    borderRadius: '2px', width: '100%', maxWidth: 420, padding: '2.5rem',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
                }}
            >
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>
                    NEW COLLECTION
                </div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', marginBottom: '1.25rem' }}>Create a List</h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <input className="input" placeholder="List title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
                    <textarea className="input" placeholder="What's this list about?" value={desc} onChange={(e) => setDesc(e.target.value)} style={{ minHeight: 80 }} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.1em', color: 'var(--bone)' }}>
                        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} style={{ accentColor: 'var(--sepia)' }} />
                        {isPrivate ? <><Lock size={12} /> Private</> : <><Globe size={12} /> Public</>}
                    </label>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleCreate} disabled={submitting}>
                            {submitting ? 'CREATING...' : 'CREATE LIST'}
                        </button>
                        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function ListsPage() {
    const { isAuthenticated, user } = useAuthStore()
    const { lists, createList } = useFilmStore()
    const { openSignupModal } = useUIStore()
    const [showCreate, setShowCreate] = useState(false)
    const [query, setQuery] = useState('')

    // Fetch public community lists from Supabase
    // Excludes: private lists + the logged-in user's own lists (they see those in My Collections)
    const { data: communityLists = [] } = useQuery({
        queryKey: ['public-lists', user?.id],
        queryFn: async () => {
            let q = supabase
                .from('lists')
                .select('id, title, description, created_at, user_id')
                .order('created_at', { ascending: false })
                .limit(30)
            if (user?.id) q = q.neq('user_id', user.id)
            const { data, error } = await q
            if (error || !data || data.length === 0) return []

            // Batch-resolve usernames
            const userIds = [...new Set(data.map((l: any) => l.user_id).filter(Boolean))]
            let usernameMap: Record<string, string> = {}
            if (userIds.length > 0) {
                const { data: p } = await supabase.from('profiles').select('id, username').in('id', userIds)
                if (p) usernameMap = Object.fromEntries(p.map((x: any) => [x.id, x.username]))
            }

            // Batch-resolve list items
            const listIds = data.map((l: any) => l.id)
            let itemsMap: Record<string, any[]> = {}
            if (listIds.length > 0) {
                const { data: items } = await supabase.from('list_items').select('list_id, film_id, film_title').in('list_id', listIds)
                if (items) {
                    items.forEach((item: any) => {
                        if (!itemsMap[item.list_id]) itemsMap[item.list_id] = []
                        itemsMap[item.list_id].push(item)
                    })
                }
            }

            return data.map((l: any) => ({
                id: l.id,
                title: l.title,
                desc: l.description || '',
                user: usernameMap[l.user_id] || 'anonymous',
                films: (itemsMap[l.id] || []).map((item: any) => ({ id: item.film_id, title: item.film_title, poster_path: null })),
                count: (itemsMap[l.id] || []).length,
            }))
        },
        staleTime: 1000 * 60 * 2,
    })

    const filterLists = (listArray: any[]) => {
        if (!query.trim()) return listArray
        const q = query.toLowerCase()
        return listArray.filter((l: any) =>
            l.title.toLowerCase().includes(q) ||
            (l.desc && l.desc.toLowerCase().includes(q)) ||
            (l.description && l.description.toLowerCase().includes(q)) ||
            (l.user && l.user.toLowerCase().includes(q))
        )
    }

    const filteredMyLists = filterLists(lists)
    const filteredCommunity = filterLists(communityLists)

    return (
        <div style={{ paddingTop: 70, minHeight: '100dvh', background: 'var(--ink)' }}>
            {/* Massive Centered Header Area */}
            <div style={{
                background: 'var(--ink)',
                borderBottom: '1px solid var(--ash)',
                padding: IS_TOUCH ? '1.5rem 0 1rem' : '4rem 0 3rem',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* Vintage darkroom glow / halation */}
                <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', height: '100%', background: 'radial-gradient(ellipse at top, rgba(139,105,20,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

                <div className="container" style={{ position: 'relative', zIndex: 1, maxWidth: 800, textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.4em', color: 'var(--sepia)', marginBottom: '1rem' }}>
                        THE STACKS
                    </div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? 'clamp(1.8rem, 7vw, 2.5rem)' : 'clamp(3rem, 7vw, 5.5rem)', color: 'var(--parchment)', marginBottom: IS_TOUCH ? '0.75rem' : '1.5rem', lineHeight: 1.1, textShadow: '0 10px 30px rgba(0,0,0,0.8)' }}>
                        Curated <span style={{ color: 'var(--sepia)', fontStyle: 'italic', fontFamily: 'var(--font-sub)', fontWeight: 'normal' }}>Anthologies</span>
                    </h1>
                    <p style={{ fontFamily: 'var(--font-sub)', fontSize: IS_TOUCH ? '0.9rem' : '1.2rem', color: 'var(--bone)', maxWidth: 650, margin: '0 auto', marginBottom: IS_TOUCH ? '1.25rem' : '2.5rem', lineHeight: 1.6 }}>
                        The definitive archives of the Society. Discover essential anthologies meticulously assembled by our devoted members.
                    </p>

                    {isAuthenticated ? (
                        <button className="btn btn-primary" style={{ padding: '0.8rem 2rem', letterSpacing: '0.2em' }} onClick={() => setShowCreate(true)}>
                            <Plus size={16} style={{ marginRight: '0.5rem' }} /> CREATE COLLECTION
                        </button>
                    ) : (
                        <button className="btn btn-ghost" style={{ padding: '0.8rem 2rem', letterSpacing: '0.1em' }} onClick={() => openSignupModal()}>
                            ASCEND TO CREATE COLLECTIONS
                        </button>
                    )}

                    {/* Smart Search Bar */}
                    <div style={{ marginTop: IS_TOUCH ? '1.5rem' : '3rem', position: 'relative', textAlign: 'left' }}>
                        <SearchIcon size={IS_TOUCH ? 16 : 22} style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--sepia)', opacity: 0.8, zIndex: 1 }} />
                        <input
                            className="input"
                            style={{ width: '100%', padding: IS_TOUCH ? '0.9rem 2.5rem 0.9rem 3rem' : '1.4rem 3rem 1.4rem 4rem', fontSize: IS_TOUCH ? '1rem' : '1.2rem', fontFamily: 'var(--font-sub)', background: 'var(--soot)', borderColor: 'var(--ash)', color: 'var(--parchment)', borderRadius: 'var(--radius-card)', boxShadow: 'inset 0 4px 20px rgba(0,0,0,0.8)', outline: 'none', transition: 'border-color 0.3s', boxSizing: 'border-box' }}
                            placeholder="Search specific lists, curators, or keywords..."
                            value={query}
                            onChange={(e: any) => setQuery(e.target.value)}
                            onFocus={(e: any) => e.target.style.borderColor = 'var(--sepia)'}
                            onBlur={(e: any) => e.target.style.borderColor = 'var(--ash)'}
                        />
                        {query && (
                            <button type="button" onClick={() => setQuery('')} style={{ position: 'absolute', right: '1.25rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <X size={18} />
                            </button>
                        )}
                        <div style={{ position: 'absolute', bottom: -24, left: 10, fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>
                            SHOWING {filteredMyLists.length + filteredCommunity.length} ARCHIVES
                        </div>
                    </div>
                </div>
            </div>

            <main style={{ padding: '2rem 0 5rem' }}>
                <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
                    {/* My lists */}
                    {isAuthenticated && filteredMyLists.length > 0 && (
                        <section>
                            <SectionHeader label="YOUR ARCHIVE" title="My Collections" />
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '2rem' }}>
                                {filteredMyLists.map((list: any) => (
                                    <Link
                                        key={list.id}
                                        to={`/lists/${list.id}`}
                                        className="fade-in-up"
                                        style={{
                                            textDecoration: 'none',
                                            color: 'inherit',
                                            display: 'block',
                                            background: 'var(--ink)', border: '1px solid var(--ash)',
                                            padding: '1.5rem', position: 'relative', borderLeft: '4px solid var(--flicker)',
                                            transition: 'transform 0.2s, border-color 0.2s'
                                        }}
                                        onMouseEnter={(e: any) => {
                                            e.currentTarget.style.transform = 'translateY(-4px)'
                                            e.currentTarget.style.borderColor = 'var(--sepia)'
                                        }}
                                        onMouseLeave={(e: any) => {
                                            e.currentTarget.style.transform = 'translateY(0)'
                                            e.currentTarget.style.borderColor = 'var(--ash)'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--parchment)', lineHeight: 1.1 }}>
                                                {list.title}
                                            </h3>
                                            <div style={{ color: 'var(--fog)' }}>
                                                {list.isPrivate ? <Lock size={16} /> : <Globe size={16} />}
                                            </div>
                                        </div>
                                        {list.description && (
                                            <p style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--fog)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                                                {list.description}
                                            </p>
                                        )}
                                        <div style={{ borderTop: '1px solid var(--ash)', paddingTop: '1rem', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)' }}>
                                            {list.films.length} FILMS PUBLISHED
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Divider */}
                    <div style={{
                        height: '1px', background: 'linear-gradient(90deg, transparent, var(--ash), transparent)',
                        margin: '2rem 0', position: 'relative', textAlign: 'center'
                    }}>
                        <span style={{
                            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                            background: 'var(--ink)', padding: '0 2rem', fontFamily: 'var(--font-ui)',
                            fontSize: '0.65rem', letterSpacing: '0.5em', color: 'var(--sepia)'
                        }}>
                            THE PUBLIC ARCHIVE
                        </span>
                    </div>

                    {/* Community lists */}
                    <section>
                        <SectionHeader label="SOCIETY PICKS" title={query ? `Found in Public Archive (${filteredCommunity.length})` : "Curated Stacks"} />
                        {filteredCommunity.length === 0 ? (
                            <div style={{ padding: '4rem 2rem', border: '1px dashed var(--ash)', textAlign: 'center' }}>
                                <Buster size={60} mood="peeking" />
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--sepia)', marginTop: '1rem' }}>
                                    {query ? 'No collections found for this keyword.' : 'The Public Archive Awaits Its First Curators.'}
                                </div>
                                {!query && (
                                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--fog)', marginTop: '0.5rem', opacity: 0.7 }}>
                                        Be the first to forge a public anthology for the Society.
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '3rem' }}>
                                {filteredCommunity.map((list: any) => (
                                    <CommunityListCard key={list.id} list={list} />
                                ))}
                            </div>
                        )}
                    </section>

                    {!isAuthenticated && (
                        <div style={{
                            background: 'transparent', border: '1px dashed var(--ash)',
                            padding: '3rem', textAlign: 'center',
                            marginTop: '2rem', borderRadius: '2px',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem'
                        }}>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--sepia)' }}>
                                The Archives Are Closed
                            </div>
                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--bone)', maxWidth: 450, lineHeight: 1.5 }}>
                                Forge your own collections. Immortalize your unique cinematic taste in the permanent archive.
                            </div>
                            <button className="btn btn-primary" style={{ padding: '1rem 3rem', letterSpacing: '0.2em' }} onClick={() => openSignupModal()}>
                                CLAIM YOUR SEAT
                            </button>
                        </div>
                    )}
                </div>
            </main>

            {showCreate && (
                <CreateListModal
                    onClose={() => setShowCreate(false)}
                    onCreate={createList}
                />
            )}
        </div>
    )
}
