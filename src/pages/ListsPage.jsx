import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useFilmStore, useAuthStore, useUIStore } from '../store'
import { SectionHeader, FilmCard } from '../components/UI'
import Buster from '../components/Buster'
import { tmdb } from '../tmdb'
import { Plus, Lock, Globe, Search as SearchIcon, X } from 'lucide-react'
import toast from 'react-hot-toast'

// Detect touch/mobile once at module level
const IS_TOUCH = typeof window !== 'undefined' && window.matchMedia('(any-pointer: coarse)').matches

const COMMUNITY_LISTS = [
    {
        id: 'c1', title: 'Films That Rewired My Brain', user: 'the_archivist_84',
        desc: 'Before and after. You will not be the same.',
        films: [
            { id: 238, title: 'The Godfather', poster_path: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg' },
            { id: 372058, title: 'Your Name', poster_path: '/q719jXXEzOoYaps6babgKnONONX.jpg' },
            { id: 12477, title: 'Grave of the Fireflies', poster_path: '/k9tv1rXZbOhH7eiCk378x61kNQ1.jpg' },
        ],
        count: 12,
    },
    {
        id: 'c2', title: 'Midnight Horror Essentials', user: 'midnight_devotee',
        desc: 'Do not watch alone. Or do. That might be worse.',
        films: [
            { id: 694, title: 'The Shining', poster_path: '/nRj5511mZdTl4saWEPoj9QroTIu.jpg' },
            { id: 346364, title: 'IT', poster_path: '/9E2y5Q7WlCVNEhP5GkVhjr85HCN.jpg' },
            { id: 299536, title: 'Avengers', poster_path: '/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg' },
        ],
        count: 34,
    },
    {
        id: 'c3', title: 'Films for When You Need to Cry', user: 'weeper_in_the_dark',
        desc: 'A curated destruction of your emotional composure.',
        films: [
            { id: 12477, title: 'Grave of the Fireflies', poster_path: '/k9tv1rXZbOhH7eiCk378x61kNQ1.jpg' },
            { id: 372058, title: 'Your Name', poster_path: '/q719jXXEzOoYaps6babgKnONONX.jpg' },
            { id: 120467, title: 'Budapest', poster_path: '/eWdyYQreja6JGCzqHWXpWHDrrPo.jpg' },
        ],
        count: 8,
    },
    {
        id: 'c4', title: 'Underrated Crime Masterpieces', user: 'contrarian_rex',
        desc: 'Not Heat. Not Godfather. The ones they forgot.',
        films: [
            { id: 590, title: 'The Hours', poster_path: '/4myDtowDJQPQnkEDB1IWGtJR1Fo.jpg' },
            { id: 238, title: 'The Godfather', poster_path: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg' },
            { id: 12477, title: 'Grave of the Fireflies', poster_path: '/k9tv1rXZbOhH7eiCk378x61kNQ1.jpg' },
        ],
        count: 19,
    },
]

function UnbreakablePoster({ posterPath, title, isTop }) {
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

function CommunityListCard({ list }) {
    // Array of high-end cinematic textures/stills from Unsplash as absolute fallbacks 
    const fallbackImages = [
        'https://images.unsplash.com/photo-1485093451681-d5dfd99b55b5?q=80&w=1000', // Cinema Seats
        'https://images.unsplash.com/photo-1440404653325-ab12d1927771?q=80&w=1000', // Reel
        'https://images.unsplash.com/photo-1478720568477-152d9b164e26?q=80&w=1000', // Theater
        'https://images.unsplash.com/photo-1517604931442-7e0c8ed0963c?q=80&w=1000' // Silhouette
    ]
    const cardFallback = fallbackImages[Math.abs(list.id.charCodeAt(0)) % fallbackImages.length]

    // Check if we have at least one valid poster path
    const primaryPoster = list.films.find(f => f.poster_path)?.poster_path
    const [imgSrc, setImgSrc] = useState(primaryPoster ? tmdb.poster(primaryPoster, 'w500') : cardFallback)
    const [failed, setFailed] = useState(false)

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
                const poster = e.currentTarget.querySelector('.main-poster')
                if (poster) poster.style.transform = 'scale(1.1) rotate(1deg)'
                const pane = e.currentTarget.querySelector('.content-pane')
                if (pane) pane.style.transform = 'translateY(0)'
                const glow = e.currentTarget.querySelector('.card-glow')
                if (glow) glow.style.opacity = '0.6'
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--ash)'
                e.currentTarget.style.transform = 'translateY(0) scale(1)'
                const poster = e.currentTarget.querySelector('.main-poster')
                if (poster) poster.style.transform = 'scale(1) rotate(0deg)'
                const pane = e.currentTarget.querySelector('.content-pane')
                if (pane) pane.style.transform = 'translateY(10px)'
                const glow = e.currentTarget.querySelector('.card-glow')
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
                <img
                    src={imgSrc}
                    alt={list.title}
                    loading="lazy"
                    decoding="async"
                    onError={() => {
                        if (!failed) {
                            setImgSrc(cardFallback)
                            setFailed(true)
                        }
                    }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.7) sepia(0.2)' }}
                />
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

function CreateListModal({ onClose, onCreate }) {
    const [title, setTitle] = useState('')
    const [desc, setDesc] = useState('')
    const [isPrivate, setIsPrivate] = useState(false)

    const handleCreate = () => {
        if (!title.trim()) { toast.error('Give your list a name'); return }
        onCreate({ title: title.trim(), description: desc.trim(), isPrivate })
        toast.success(`List "${title}" created!`)
        onClose()
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
                        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleCreate}>
                            Create List
                        </button>
                        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function ListsPage() {
    const { isAuthenticated } = useAuthStore()
    const { lists, createList } = useFilmStore()
    const { openSignupModal } = useUIStore()
    const [showCreate, setShowCreate] = useState(false)
    const [query, setQuery] = useState('')

    // Smart filtering logic
    const filterLists = (listArray) => {
        if (!query.trim()) return listArray
        const q = query.toLowerCase()
        return listArray.filter(l =>
            l.title.toLowerCase().includes(q) ||
            (l.desc && l.desc.toLowerCase().includes(q)) ||
            (l.description && l.description.toLowerCase().includes(q)) ||
            (l.user && l.user.toLowerCase().includes(q))
        )
    }

    const filteredMyLists = filterLists(lists)
    const filteredCommunity = filterLists(COMMUNITY_LISTS)

    return (
        <div style={{ paddingTop: 70, minHeight: '100vh', background: 'var(--ink)' }}>
            {/* Massive Centered Header Area */}
            <div style={{
                background: 'var(--ink)',
                borderBottom: '1px solid var(--ash)',
                padding: '4rem 0 3rem',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* Vintage darkroom glow / halation */}
                <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', height: '100%', background: 'radial-gradient(ellipse at top, rgba(139,105,20,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

                <div className="container" style={{ position: 'relative', zIndex: 1, maxWidth: 800, textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.4em', color: 'var(--sepia)', marginBottom: '1rem' }}>
                        THE STACKS
                    </div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(3rem, 7vw, 5.5rem)', color: 'var(--parchment)', marginBottom: '1.5rem', lineHeight: 1.1, textShadow: '0 10px 30px rgba(0,0,0,0.8)' }}>
                        Curated <span style={{ color: 'var(--sepia)', fontStyle: 'italic', fontFamily: 'var(--font-sub)', fontWeight: 'normal' }}>Anthologies</span>
                    </h1>
                    <p style={{ fontFamily: 'var(--font-sub)', fontSize: '1.2rem', color: 'var(--bone)', maxWidth: 650, margin: '0 auto', marginBottom: '2.5rem', lineHeight: 1.6 }}>
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
                    <div style={{ marginTop: '3rem', position: 'relative', textAlign: 'left' }}>
                        <SearchIcon size={IS_TOUCH ? 16 : 22} style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--sepia)', opacity: 0.8, zIndex: 1 }} />
                        <input
                            className="input"
                            style={{ width: '100%', padding: IS_TOUCH ? '0.9rem 2.5rem 0.9rem 3rem' : '1.4rem 3rem 1.4rem 4rem', fontSize: IS_TOUCH ? '1rem' : '1.2rem', fontFamily: 'var(--font-sub)', background: 'var(--soot)', borderColor: 'var(--ash)', color: 'var(--parchment)', borderRadius: 'var(--radius-card)', boxShadow: 'inset 0 4px 20px rgba(0,0,0,0.8)', outline: 'none', transition: 'border-color 0.3s', boxSizing: 'border-box' }}
                            placeholder="Search specific lists, curators, or keywords..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onFocus={e => e.target.style.borderColor = 'var(--sepia)'}
                            onBlur={e => e.target.style.borderColor = 'var(--ash)'}
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
                                {filteredMyLists.map((list) => (
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
                                        onMouseEnter={e => {
                                            e.currentTarget.style.transform = 'translateY(-4px)'
                                            e.currentTarget.style.borderColor = 'var(--sepia)'
                                        }}
                                        onMouseLeave={e => {
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
                                            {list.films.length} FILMS TRANSMITTED
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
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--sepia)', marginTop: '1rem' }}>No collections found with this keyword.</div>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '3rem' }}>
                                {filteredCommunity.map((list) => (
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
