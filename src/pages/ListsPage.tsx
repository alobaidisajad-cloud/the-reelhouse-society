import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useFilmStore, useAuthStore, useUIStore } from '../store'
import Buster from '../components/Buster'
import { tmdb } from '../tmdb'
import { Plus, Lock, Globe, Search as SearchIcon, X, ChevronDown } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import toast from 'react-hot-toast'
import PageSEO from '../components/PageSEO'

// Detect touch/mobile once at module level
const IS_TOUCH = typeof window !== 'undefined' && window.matchMedia('(any-pointer: coarse)').matches


function UnbreakablePoster({ posterPath, title, isTop }: any) {
    const [failed, setFailed] = useState(!posterPath)

    return (
        <div style={{
            width: 105, height: 158,
            background: 'var(--soot)',
            borderRadius: '3px',
            overflow: 'hidden',
            position: 'relative',
            boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
            border: '1px solid rgba(139,105,20,0.08)',
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
                    border: '1px solid rgba(139,105,20,0.2)'
                }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--sepia)', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
                        REELHOUSE
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.65rem', color: 'var(--parchment)', lineHeight: 1.2, textTransform: 'uppercase' }}>
                        {title}
                    </div>
                </div>
            )}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 60%, rgba(0,0,0,0.8) 100%)', pointerEvents: 'none' }} />
        </div>
    )
}

function CommunityListCard({ list }: any) {
    const gradients = [
        'linear-gradient(135deg, #1a0e05 0%, #3a2010 40%, #0a0703 100%)',
        'linear-gradient(135deg, #0a0a0a 0%, #1c1710 50%, #2a1a05 100%)',
        'linear-gradient(135deg, #05080a 0%, #101820 50%, #1a2010 100%)',
        'linear-gradient(135deg, #0a0508 0%, #1a0f18 50%, #0a0508 100%)',
    ]
    const cardGradient = gradients[Math.abs(list.id.charCodeAt(0)) % gradients.length]

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
                background: 'var(--ink)', border: '1px solid rgba(139,105,20,0.08)',
                borderRadius: '6px', height: IS_TOUCH ? 380 : 440, display: 'flex', flexDirection: 'column',
                boxShadow: '0 15px 40px rgba(0,0,0,0.6)', cursor: 'pointer', transition: 'all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)',
                position: 'relative', overflow: 'hidden'
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(139,105,20,0.3)'
                e.currentTarget.style.transform = 'translateY(-8px)'
                e.currentTarget.style.boxShadow = '0 20px 50px rgba(0,0,0,0.7), 0 0 30px rgba(139,105,20,0.1)'
                const poster = e.currentTarget.querySelector('.main-poster') as HTMLElement
                if (poster) poster.style.transform = 'scale(1.06)'
                const glow = e.currentTarget.querySelector('.card-glow') as HTMLElement
                if (glow) glow.style.opacity = '0.5'
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(139,105,20,0.08)'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 15px 40px rgba(0,0,0,0.6)'
                const poster = e.currentTarget.querySelector('.main-poster') as HTMLElement
                if (poster) poster.style.transform = 'scale(1)'
                const glow = e.currentTarget.querySelector('.card-glow') as HTMLElement
                if (glow) glow.style.opacity = '0.25'
            }}
        >
            {/* Main Visual Poster */}
            <div
                className="main-poster"
                style={{
                    position: 'absolute', inset: 0, zIndex: 0,
                    transition: 'transform 1s cubic-bezier(0.2, 0.8, 0.2, 1)',
                }}
            >
                {failed || !imgSrc ? (
                    <div style={{ width: '100%', height: '100%', background: cardGradient }} />
                ) : (
                    <img
                        src={imgSrc}
                        alt={list.title}
                        loading="lazy"
                        decoding="async"
                        onError={() => setFailed(true)}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.65) sepia(0.15) contrast(1.05)' }}
                    />
                )}
            </div>

            {/* Overlays */}
            <div className="card-glow" style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top left, var(--sepia) 0%, transparent 60%)', opacity: 0.25, zIndex: 1, transition: 'opacity 0.5s' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 25%, var(--ink) 95%)', zIndex: 2 }} />

            {/* Content Pane */}
            <div style={{
                position: 'relative', zIndex: 10, marginTop: 'auto', padding: IS_TOUCH ? '1.25rem' : '1.75rem',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.35em', color: 'var(--sepia)', border: '1px solid rgba(139,105,20,0.3)', padding: '2px 8px', borderRadius: '2px' }}>
                        {list.count} FILMS
                    </span>
                    <div style={{ height: '1px', flex: 1, background: 'linear-gradient(to right, rgba(139,105,20,0.3), transparent)' }} />
                </div>

                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? '1.4rem' : '1.6rem', color: 'var(--parchment)', marginBottom: '0.5rem', textShadow: '0 4px 15px rgba(0,0,0,0.9)', lineHeight: 1.1 }}>
                    {list.title.toUpperCase()}
                </h3>

                {list.desc && (
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--bone)', lineHeight: 1.5, marginBottom: '1rem', opacity: 0.7, WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {list.desc}
                    </p>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderTop: '1px solid rgba(139,105,20,0.15)', paddingTop: '0.75rem' }}>
                    <div style={{ width: 12, height: 12, background: 'var(--sepia)', borderRadius: '50%', opacity: 0.6 }} />
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>
                        @{list.user.toUpperCase()}
                    </span>
                </div>
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
                    background: 'var(--ink)', border: '1px solid rgba(139,105,20,0.3)',
                    borderRadius: '6px', width: '100%', maxWidth: 420, padding: IS_TOUCH ? '1.75rem' : '2.5rem',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
                    position: 'relative', overflow: 'hidden',
                }}
            >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, var(--sepia), transparent)' }} />
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.3em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>
                    NEW COLLECTION
                </div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', marginBottom: '1.25rem', color: 'var(--parchment)' }}>Create a List</h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <input className="input" placeholder="List title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
                    <textarea className="input" placeholder="What's this list about?" value={desc} onChange={(e) => setDesc(e.target.value)} style={{ minHeight: 80 }} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--bone)' }}>
                        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} style={{ accentColor: 'var(--sepia)' }} />
                        {isPrivate ? <><Lock size={12} /> PRIVATE</> : <><Globe size={12} /> PUBLIC</>}
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

// ── FILTER PILL COMPONENT ──
function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            style={{
                background: active ? 'rgba(139,105,20,0.15)' : 'transparent',
                border: `1px solid ${active ? 'rgba(139,105,20,0.4)' : 'rgba(139,105,20,0.1)'}`,
                borderRadius: '20px',
                padding: '0.35rem 0.85rem',
                fontFamily: 'var(--font-ui)',
                fontSize: '0.5rem',
                letterSpacing: '0.12em',
                color: active ? 'var(--sepia)' : 'var(--fog)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                flexShrink: 0,
            }}
            onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = 'rgba(139,105,20,0.25)'; e.currentTarget.style.color = 'var(--bone)' } }}
            onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = 'rgba(139,105,20,0.1)'; e.currentTarget.style.color = 'var(--fog)' } }}
        >
            {label}
        </button>
    )
}

type TimeFilter = 'all' | 'week' | 'month'
type SortOption = 'newest' | 'most-films' | 'a-z'

export default function ListsPage() {
    const { isAuthenticated, user } = useAuthStore()
    const { lists, createList } = useFilmStore()
    const { openSignupModal } = useUIStore()
    const [showCreate, setShowCreate] = useState(false)
    const [query, setQuery] = useState('')
    const [debouncedQuery, setDebouncedQuery] = useState('')
    const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
    const [followingOnly, setFollowingOnly] = useState(false)
    const [sortBy, setSortBy] = useState<SortOption>('newest')
    const [showSortMenu, setShowSortMenu] = useState(false)
    const searchRef = useRef<HTMLInputElement>(null)
    const sortMenuRef = useRef<HTMLDivElement>(null)

    // Debounced search — 300ms delay
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(query), 300)
        return () => clearTimeout(timer)
    }, [query])

    // Close sort menu on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
                setShowSortMenu(false)
            }
        }
        if (showSortMenu) document.addEventListener('click', handleClick)
        return () => document.removeEventListener('click', handleClick)
    }, [showSortMenu])

    // Fetch public community lists from Supabase
    const { data: communityLists = [], isLoading } = useQuery({
        queryKey: ['public-lists', user?.id],
        queryFn: async () => {
            let q = supabase
                .from('lists')
                .select('id, title, description, created_at, user_id, is_private')
                .eq('is_private', false)
                .order('created_at', { ascending: false })
                .limit(50)
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
                const { data: items } = await supabase.from('list_items').select('list_id, film_id, film_title, poster_path').in('list_id', listIds)
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
                userId: l.user_id,
                createdAt: l.created_at,
                films: (itemsMap[l.id] || []).map((item: any) => ({ id: item.film_id, title: item.film_title, poster_path: item.poster_path || null })),
                count: (itemsMap[l.id] || []).length,
            }))
        },
        staleTime: 1000 * 60 * 2,
    })

    // ── FILTERING + SORTING LOGIC ──
    const filterAndSort = useCallback((listArray: any[], isCommunity: boolean) => {
        let result = [...listArray]

        // Text search
        if (debouncedQuery.trim()) {
            const q = debouncedQuery.toLowerCase()
            result = result.filter((l: any) =>
                l.title.toLowerCase().includes(q) ||
                (l.desc && l.desc.toLowerCase().includes(q)) ||
                (l.description && l.description.toLowerCase().includes(q)) ||
                (l.user && l.user.toLowerCase().includes(q))
            )
        }

        // Time filter — only for community lists
        if (isCommunity && timeFilter !== 'all') {
            const now = new Date()
            const cutoff = new Date()
            if (timeFilter === 'week') cutoff.setDate(now.getDate() - 7)
            else if (timeFilter === 'month') cutoff.setMonth(now.getMonth() - 1)
            result = result.filter((l: any) => new Date(l.createdAt) >= cutoff)
        }

        // Following filter
        if (isCommunity && followingOnly && user?.following?.length > 0) {
            result = result.filter((l: any) => user.following.includes(l.userId))
        }

        // Sort
        if (sortBy === 'newest') {
            result.sort((a: any, b: any) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime())
        } else if (sortBy === 'most-films') {
            result.sort((a: any, b: any) => (b.count || b.films?.length || 0) - (a.count || a.films?.length || 0))
        } else if (sortBy === 'a-z') {
            result.sort((a: any, b: any) => a.title.localeCompare(b.title))
        }

        return result
    }, [debouncedQuery, timeFilter, followingOnly, sortBy, user?.following])

    const filteredMyLists = useMemo(() => filterAndSort(lists, false), [lists, filterAndSort])
    const filteredCommunity = useMemo(() => filterAndSort(communityLists, true), [communityLists, filterAndSort])
    const totalResults = filteredMyLists.length + filteredCommunity.length

    const sortLabels: Record<SortOption, string> = { 'newest': 'NEWEST', 'most-films': 'MOST FILMS', 'a-z': 'A → Z' }
    const hasActiveFilters = timeFilter !== 'all' || followingOnly || debouncedQuery.trim().length > 0

    return (
        <div style={{ paddingTop: 70, minHeight: '100dvh', background: 'var(--ink)' }}>
            {/* ── HERO HEADER ── */}
            <div style={{
                padding: IS_TOUCH ? '1.5rem 0 1.25rem' : '3.5rem 0 2.5rem',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* Ambient glow */}
                <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', height: '100%', background: 'radial-gradient(ellipse at top, rgba(139,105,20,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

                <div className="container" style={{ position: 'relative', zIndex: 1, maxWidth: 800, textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.4em', color: 'var(--sepia)', marginBottom: IS_TOUCH ? '0.5rem' : '0.75rem', opacity: 0.8 }}>
                        ✦ THE REELHOUSE SOCIETY ✦
                    </div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? '2rem' : '3.5rem', color: 'var(--parchment)', marginBottom: IS_TOUCH ? '0.5rem' : '1rem', lineHeight: 1.05 }}>
                        The Stacks
                    </h1>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: IS_TOUCH ? '0.85rem' : '1.05rem', color: 'var(--bone)', maxWidth: 520, margin: '0 auto', marginBottom: IS_TOUCH ? '1.25rem' : '2rem', lineHeight: 1.6, opacity: 0.7 }}>
                        Curated anthologies meticulously assembled by the Society's devoted members.
                    </p>

                    {isAuthenticated ? (
                        <button className="btn btn-primary" style={{ padding: '0.7rem 1.8rem', letterSpacing: '0.18em', fontSize: '0.65rem' }} onClick={() => setShowCreate(true)}>
                            <Plus size={14} style={{ marginRight: '0.4rem' }} /> CREATE COLLECTION
                        </button>
                    ) : (
                        <button className="btn btn-ghost" style={{ padding: '0.7rem 1.8rem', letterSpacing: '0.12em', fontSize: '0.6rem' }} onClick={() => openSignupModal()}>
                            JOIN TO CREATE COLLECTIONS
                        </button>
                    )}
                </div>
            </div>

            {/* ── GOLD DIVIDER ── */}
            <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(139,105,20,0.25), transparent)' }} />

            {/* ── SEARCH + FILTER BAR ── */}
            <div style={{
                background: 'linear-gradient(180deg, rgba(28,23,16,0.4) 0%, transparent 100%)',
                padding: IS_TOUCH ? '1rem 0 0.75rem' : '1.5rem 0 1rem',
                position: 'sticky', top: IS_TOUCH ? 56 : 60, zIndex: 50,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderBottom: '1px solid rgba(139,105,20,0.08)',
            }}>
                <div className="container" style={{ maxWidth: 800, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* Search Input */}
                    <div style={{ position: 'relative' }}>
                        <SearchIcon size={IS_TOUCH ? 14 : 16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--sepia)', opacity: 0.6, zIndex: 1 }} />
                        <input
                            ref={searchRef}
                            className="input"
                            style={{
                                width: '100%', padding: IS_TOUCH ? '0.75rem 2.5rem 0.75rem 2.5rem' : '0.85rem 3rem 0.85rem 2.75rem',
                                fontSize: IS_TOUCH ? '0.85rem' : '0.95rem', fontFamily: 'var(--font-body)',
                                background: 'rgba(10,7,3,0.8)', borderColor: 'rgba(139,105,20,0.12)',
                                color: 'var(--parchment)', borderRadius: '4px',
                                boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.4)', outline: 'none',
                                transition: 'border-color 0.3s, box-shadow 0.3s', boxSizing: 'border-box'
                            }}
                            placeholder="Search lists, curators, keywords..."
                            value={query}
                            onChange={(e: any) => setQuery(e.target.value)}
                            onFocus={(e: any) => { e.target.style.borderColor = 'rgba(139,105,20,0.35)'; e.target.style.boxShadow = 'inset 0 2px 8px rgba(0,0,0,0.4), 0 0 12px rgba(139,105,20,0.08)' }}
                            onBlur={(e: any) => { e.target.style.borderColor = 'rgba(139,105,20,0.12)'; e.target.style.boxShadow = 'inset 0 2px 8px rgba(0,0,0,0.4)' }}
                        />
                        {query && (
                            <button type="button" onClick={() => setQuery('')} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Filter Pills */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', overflowX: 'auto', paddingBottom: '2px', WebkitOverflowScrolling: 'touch' }}>
                        {/* Time Filters */}
                        <FilterPill label="ALL TIME" active={timeFilter === 'all'} onClick={() => setTimeFilter('all')} />
                        <FilterPill label="THIS WEEK" active={timeFilter === 'week'} onClick={() => setTimeFilter('week')} />
                        <FilterPill label="THIS MONTH" active={timeFilter === 'month'} onClick={() => setTimeFilter('month')} />

                        {/* Separator */}
                        <div style={{ width: '1px', height: '16px', background: 'rgba(139,105,20,0.15)', flexShrink: 0 }} />

                        {/* Following filter — only show if logged in */}
                        {isAuthenticated && (
                            <FilterPill
                                label="FOLLOWING"
                                active={followingOnly}
                                onClick={() => setFollowingOnly(!followingOnly)}
                            />
                        )}

                        {/* Sort dropdown */}
                        <div ref={sortMenuRef} style={{ position: 'relative', marginLeft: 'auto', flexShrink: 0 }}>
                            <button
                                onClick={() => setShowSortMenu(!showSortMenu)}
                                style={{
                                    background: 'transparent', border: '1px solid rgba(139,105,20,0.12)',
                                    borderRadius: '20px', padding: '0.35rem 0.75rem',
                                    fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em',
                                    color: 'var(--fog)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {sortLabels[sortBy]} <ChevronDown size={10} />
                            </button>
                            {showSortMenu && (
                                <div style={{
                                    position: 'absolute', top: 'calc(100% + 4px)', right: 0,
                                    background: 'var(--ink)', border: '1px solid rgba(139,105,20,0.2)',
                                    borderRadius: '4px', boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                                    overflow: 'hidden', zIndex: 100, minWidth: 130,
                                }}>
                                    {(['newest', 'most-films', 'a-z'] as SortOption[]).map(opt => (
                                        <button
                                            key={opt}
                                            onClick={() => { setSortBy(opt); setShowSortMenu(false) }}
                                            style={{
                                                display: 'block', width: '100%', textAlign: 'left',
                                                padding: '0.6rem 1rem', border: 'none',
                                                background: sortBy === opt ? 'rgba(139,105,20,0.1)' : 'transparent',
                                                fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em',
                                                color: sortBy === opt ? 'var(--sepia)' : 'var(--fog)',
                                                cursor: 'pointer', transition: 'background 0.15s',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,105,20,0.08)'}
                                            onMouseLeave={e => e.currentTarget.style.background = sortBy === opt ? 'rgba(139,105,20,0.1)' : 'transparent'}
                                        >
                                            {sortLabels[opt]}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Results count */}
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em', color: 'var(--fog)', opacity: 0.6 }}>
                        {hasActiveFilters ? `${totalResults} RESULTS` : `${totalResults} ARCHIVES`}
                    </div>
                </div>
            </div>

            {/* ── MAIN CONTENT ── */}
            <main style={{ padding: IS_TOUCH ? '1.5rem 0 5rem' : '2.5rem 0 5rem' }}>
                <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: IS_TOUCH ? '2rem' : '3rem' }}>

                    {/* ── MY COLLECTIONS ── */}
                    {isAuthenticated && filteredMyLists.length > 0 && (
                        <section>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                                <div style={{ width: '3px', height: '1.4rem', background: 'linear-gradient(to bottom, var(--sepia), transparent)', borderRadius: '2px' }} />
                                <div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.3em', color: 'var(--sepia)', marginBottom: '0.15rem' }}>YOUR ARCHIVE</div>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? '1.3rem' : '1.6rem', color: 'var(--parchment)', lineHeight: 1 }}>My Collections</div>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: IS_TOUCH ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: IS_TOUCH ? '0.75rem' : '1rem' }}>
                                {filteredMyLists.map((list: any) => (
                                    <Link
                                        key={list.id}
                                        to={`/lists/${list.id}`}
                                        className="fade-in-up"
                                        style={{
                                            textDecoration: 'none', color: 'inherit', display: 'block',
                                            background: 'linear-gradient(135deg, rgba(28,23,16,0.4) 0%, rgba(10,7,3,0.7) 100%)',
                                            border: '1px solid rgba(139,105,20,0.08)',
                                            borderRadius: '6px',
                                            padding: IS_TOUCH ? '1rem' : '1.25rem',
                                            position: 'relative', overflow: 'hidden',
                                            borderLeft: '3px solid rgba(139,105,20,0.3)',
                                            transition: 'border-color 0.3s, box-shadow 0.3s, transform 0.3s'
                                        }}
                                        onMouseEnter={(e: any) => {
                                            e.currentTarget.style.borderColor = 'rgba(139,105,20,0.25)'
                                            e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)'
                                            e.currentTarget.style.transform = 'translateY(-2px)'
                                        }}
                                        onMouseLeave={(e: any) => {
                                            e.currentTarget.style.borderColor = 'rgba(139,105,20,0.08)'
                                            e.currentTarget.style.boxShadow = 'none'
                                            e.currentTarget.style.transform = 'translateY(0)'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? '1.1rem' : '1.2rem', color: 'var(--parchment)', lineHeight: 1.15 }}>
                                                {list.title}
                                            </h3>
                                            <div style={{ color: 'var(--fog)', opacity: 0.5, flexShrink: 0, marginLeft: '0.5rem' }}>
                                                {list.isPrivate ? <Lock size={14} /> : <Globe size={14} />}
                                            </div>
                                        </div>
                                        {list.description && (
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--bone)', marginBottom: '0.75rem', lineHeight: 1.5, opacity: 0.6, WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                {list.description}
                                            </p>
                                        )}
                                        <div style={{ borderTop: '1px solid rgba(139,105,20,0.1)', paddingTop: '0.6rem', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--sepia)' }}>
                                            {list.films.length} FILMS
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* ── SECTION DIVIDER ── */}
                    {isAuthenticated && filteredMyLists.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, rgba(139,105,20,0.25))' }} />
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.35em', color: 'var(--sepia)', opacity: 0.5, whiteSpace: 'nowrap' }}>✦ PUBLIC ARCHIVE ✦</span>
                            <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, rgba(139,105,20,0.25))' }} />
                        </div>
                    )}

                    {/* ── COMMUNITY LISTS ── */}
                    <section>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                            <div style={{ width: '3px', height: '1.4rem', background: 'linear-gradient(to bottom, var(--sepia), transparent)', borderRadius: '2px' }} />
                            <div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.3em', color: 'var(--sepia)', marginBottom: '0.15rem' }}>SOCIETY ARCHIVES</div>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? '1.3rem' : '1.6rem', color: 'var(--parchment)', lineHeight: 1 }}>
                                    {debouncedQuery ? `Results (${filteredCommunity.length})` : 'Curated Stacks'}
                                </div>
                            </div>
                        </div>

                        {isLoading ? (
                            <div style={{ display: 'grid', gridTemplateColumns: IS_TOUCH ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="skeleton" style={{ height: IS_TOUCH ? 380 : 440, borderRadius: '6px' }} />
                                ))}
                            </div>
                        ) : filteredCommunity.length === 0 ? (
                            <div style={{
                                border: '1px solid rgba(139,105,20,0.12)',
                                padding: IS_TOUCH ? '2.5rem 1.5rem' : '3.5rem 2rem',
                                textAlign: 'center',
                                background: 'linear-gradient(180deg, rgba(28,23,16,0.4) 0%, transparent 100%)',
                                position: 'relative', overflow: 'hidden', borderRadius: '6px',
                            }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, var(--sepia), transparent)' }} />
                                <Buster size={IS_TOUCH ? 50 : 60} mood="peeking" />
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.3em', color: 'var(--sepia)', marginTop: '1rem', marginBottom: '0.5rem' }}>
                                    {debouncedQuery ? 'NO MATCHES' : 'ARCHIVE EMPTY'}
                                </div>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? '1.3rem' : '1.6rem', color: 'var(--parchment)', marginBottom: '0.5rem' }}>
                                    {debouncedQuery ? 'No collections found.' : 'The Archive Awaits Its First Curator.'}
                                </div>
                                {!debouncedQuery && (
                                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--bone)', opacity: 0.6, maxWidth: 400, margin: '0 auto' }}>
                                        Be the first to forge a public anthology for the Society.
                                    </div>
                                )}
                                {debouncedQuery && (
                                    <button
                                        className="btn btn-ghost"
                                        onClick={() => { setQuery(''); setTimeFilter('all'); setFollowingOnly(false) }}
                                        style={{ marginTop: '1rem', padding: '0.5rem 1.5rem', fontSize: '0.55rem', letterSpacing: '0.12em' }}
                                    >
                                        CLEAR FILTERS
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: IS_TOUCH ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: IS_TOUCH ? '1rem' : '1.5rem' }}>
                                {filteredCommunity.map((list: any) => (
                                    <CommunityListCard key={list.id} list={list} />
                                ))}
                            </div>
                        )}
                    </section>

                    {/* ── BOTTOM CTA ── */}
                    {!isAuthenticated && (
                        <div style={{
                            background: 'linear-gradient(180deg, rgba(28,23,16,0.5) 0%, rgba(10,7,3,0.9) 100%)',
                            border: '1px solid rgba(139,105,20,0.15)',
                            padding: IS_TOUCH ? '2.5rem 1.5rem' : '3rem 2rem', textAlign: 'center',
                            borderRadius: '6px',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem',
                            position: 'relative', overflow: 'hidden',
                        }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, var(--sepia), transparent)' }} />
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.35em', color: 'var(--sepia)', opacity: 0.8 }}>
                                MEMBERS ONLY
                            </div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? '1.5rem' : '1.8rem', color: 'var(--parchment)', lineHeight: 1.1 }}>
                                The Archives Are Closed
                            </div>
                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--bone)', maxWidth: 420, lineHeight: 1.6, opacity: 0.7 }}>
                                Forge your own collections. Immortalize your cinematic taste in the permanent archive.
                            </div>
                            <button className="btn btn-primary" style={{ padding: '0.8rem 2.2rem', letterSpacing: '0.2em', fontSize: '0.65rem' }} onClick={() => openSignupModal()}>
                                CLAIM YOUR SEAT
                            </button>
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, var(--sepia), transparent)' }} />
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
