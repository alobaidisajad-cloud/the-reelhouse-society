import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useFilmStore, useAuthStore, useUIStore } from '../store'
import Buster from '../components/Buster'
import { tmdb } from '../tmdb'
import { Plus, Lock, Globe, Search as SearchIcon, X, ChevronDown, Award, MessageCircle, Send } from 'lucide-react'
import CreateListModal from '../components/CreateListModal'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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

import ListActions from '../components/ListActions'

function CommunityListCard({ list }: any) {
    const gradients = [
        'linear-gradient(135deg, #1a0e05 0%, #3a2010 40%, #0a0703 100%)',
        'linear-gradient(135deg, #0a0a0a 0%, #1c1710 50%, #2a1a05 100%)',
        'linear-gradient(135deg, #05080a 0%, #101820 50%, #1a2010 100%)',
        'linear-gradient(135deg, #0a0508 0%, #1a0f18 50%, #0a0508 100%)',
    ]
    const cardGradient = gradients[Math.abs(list.id.charCodeAt(0)) % gradients.length]

    const posters = list.films.filter((f: any) => f.poster_path).slice(0, 3).map((f: any) => f.poster_path)

    return (
        <Link
            to={`/lists/${list.id}`}
            className="fade-in-up"
            style={{
                textDecoration: 'none',
                color: 'inherit',
                background: 'var(--ink)', border: '1px solid rgba(139,105,20,0.08)',
                borderRadius: '6px', minHeight: IS_TOUCH ? 220 : 440, display: 'flex', flexDirection: 'column',
                boxShadow: '0 15px 40px rgba(0,0,0,0.6)', cursor: 'pointer', transition: 'all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)',
                position: 'relative', overflow: 'hidden'
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(139,105,20,0.3)'
                e.currentTarget.style.transform = 'translateY(-8px)'
                e.currentTarget.style.boxShadow = '0 20px 50px rgba(0,0,0,0.7), 0 0 30px rgba(139,105,20,0.1)'
                const posterContainer = e.currentTarget.querySelector('.main-poster') as HTMLElement
                if (posterContainer) posterContainer.style.transform = 'scale(1.06)'
                const glow = e.currentTarget.querySelector('.card-glow') as HTMLElement
                if (glow) glow.style.opacity = '0.5'
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(139,105,20,0.08)'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 15px 40px rgba(0,0,0,0.6)'
                const posterContainer = e.currentTarget.querySelector('.main-poster') as HTMLElement
                if (posterContainer) posterContainer.style.transform = 'scale(1)'
                const glow = e.currentTarget.querySelector('.card-glow') as HTMLElement
                if (glow) glow.style.opacity = '0.25'
            }}
        >
            {/* Main Visual Poster (Triptych) */}
            <div
                className="main-poster"
                style={{
                    position: 'absolute', inset: 0, zIndex: 0,
                    transition: 'transform 1s cubic-bezier(0.2, 0.8, 0.2, 1)',
                    display: 'flex', width: '100%', height: '100%'
                }}
            >
                {posters.length === 0 ? (
                    <div style={{ width: '100%', height: '100%', background: cardGradient }} />
                ) : (
                    posters.map((p: string, i: number) => (
                        <div key={i} style={{ flex: 1, height: '100%', position: 'relative', overflow: 'hidden' }}>
                            <img
                                src={tmdb.poster(p, 'w342')}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.65) sepia(0.15) contrast(1.05)', transform: 'scale(1.02)' }}
                            />
                            {/* Inner fade mask between posters */}
                            {i < posters.length - 1 && (
                                <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '30%', background: 'linear-gradient(to left, rgba(10,7,3,0.9), transparent)', zIndex: 1 }} />
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Overlays */}
            <div className="card-glow" style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top left, var(--sepia) 0%, transparent 60%)', opacity: 0.25, zIndex: 1, transition: 'opacity 0.5s' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 20%, var(--ink) 90%)', zIndex: 2 }} />

            {/* Content Pane */}
            <div style={{
                position: 'relative', zIndex: 10, marginTop: 'auto', padding: IS_TOUCH ? '0.6rem' : '1.75rem',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: IS_TOUCH ? '0.25rem' : '0.75rem' }}>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: IS_TOUCH ? '0.4rem' : '0.5rem', letterSpacing: '0.2em', color: 'var(--sepia)', border: '1px solid rgba(139,105,20,0.3)', padding: '2px 6px', borderRadius: '2px', whiteSpace: 'nowrap' }}>
                        {list.count} FILMS
                    </span>
                    {!IS_TOUCH && list.certifyCount > 0 && (
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em', color: 'var(--flicker)', display: 'flex', alignItems: 'center', gap: '0.2rem', opacity: 0.8 }}>
                            <Award size={10} /> {list.certifyCount}
                        </span>
                    )}
                    <div style={{ height: '1px', flex: 1, background: 'linear-gradient(to right, rgba(139,105,20,0.3), transparent)' }} />
                </div>

                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? '0.8rem' : '1.6rem', color: 'var(--parchment)', marginBottom: IS_TOUCH ? '0.25rem' : '0.5rem', textShadow: '0 2px 10px rgba(0,0,0,0.9)', lineHeight: 1.15, WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>
                    {list.title.toUpperCase()}
                </h3>

                {!IS_TOUCH && list.desc && (
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--bone)', lineHeight: 1.5, marginBottom: '0.5rem', opacity: 0.7, WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>
                        {list.desc}
                    </p>
                )}

                {!IS_TOUCH && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: 12, height: 12, background: 'var(--sepia)', borderRadius: '50%', opacity: 0.6 }} />
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>
                            @{list.user.toUpperCase()}
                        </span>
                    </div>
                )}

                {/* Certify + Comment Actions */}
                {!IS_TOUCH ? (
                    <ListActions
                        listId={list.id}
                        certifyCount={list.certifyCount || 0}
                        isCertified={list.isCertified || false}
                        commentCount={list.commentCount || 0}
                    />
                ) : (
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem' }}>
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', display: 'flex', alignItems: 'center', gap: '2px', color: list.isCertified ? 'var(--sepia)' : 'var(--fog)', opacity: list.isCertified ? 1 : 0.6 }}><Award size={9} /> {list.certifyCount || 0}</span>
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', display: 'flex', alignItems: 'center', gap: '2px', color: 'var(--fog)', opacity: 0.6 }}><MessageCircle size={9} /> {list.commentCount || 0}</span>
                    </div>
                )}
            </div>
        </Link>
    )
}

// CreateListModal extracted to src/components/CreateListModal.tsx

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
type SortOption = 'newest' | 'oldest' | 'most-certified'

export default function ListsPage() {
    const { isAuthenticated, user } = useAuthStore()
    const { lists, createList, addFilmToList } = useFilmStore()

    const handleCreateListWithFilms = async (listData: any) => {
        // 1. Create the list
        const { films, ...listInfo } = listData
        await createList(listInfo)
        
        // 2. Add films sequentially after creation (the newly created list will be first in store array)
        // Give the state a tiny moment to flush, then grab the ID from the store
        setTimeout(async () => {
            const newListId = useFilmStore.getState().lists[0]?.id
            if (newListId && films && films.length > 0) {
                // Background add tasks
                for (const film of films) {
                    try {
                        await addFilmToList(newListId, film)
                    } catch (e) { console.error('Failed to add film silently', e) }
                }
            }
        }, 100)
    }

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
        if (showSortMenu) document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
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

            // Batch-resolve endorsement counts + user's own endorsement state
            let endorseMap: Record<string, number> = {}
            let userEndorsed: Record<string, boolean> = {}
            let commentCountMap: Record<string, number> = {}
            if (listIds.length > 0) {
                const [endorsementsResp, commentsResp] = await Promise.all([
                    supabase.from('interactions').select('target_list_id, user_id, type').in('target_list_id', listIds).eq('type', 'endorse_list'),
                    supabase.from('list_comments').select('list_id').in('list_id', listIds)
                ])

                if (endorsementsResp.data) {
                    endorsementsResp.data.forEach((e: any) => {
                        endorseMap[e.target_list_id] = (endorseMap[e.target_list_id] || 0) + 1
                        if (user?.id && e.user_id === user.id) userEndorsed[e.target_list_id] = true
                    })
                }

                if (commentsResp.data) {
                    commentsResp.data.forEach((c: any) => {
                        commentCountMap[c.list_id] = (commentCountMap[c.list_id] || 0) + 1
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
                certifyCount: endorseMap[l.id] || 0,
                isCertified: userEndorsed[l.id] || false,
                commentCount: commentCountMap[l.id] || 0,
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
        if (isCommunity && followingOnly && user?.following && Array.isArray(user.following) && user.following.length > 0) {
            result = result.filter((l: any) => (user.following as string[]).includes(l.userId))
        }

        // Sort
        if (sortBy === 'newest') {
            result.sort((a: any, b: any) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime())
        } else if (sortBy === 'oldest') {
            result.sort((a: any, b: any) => new Date(a.createdAt || a.created_at || 0).getTime() - new Date(b.createdAt || b.created_at || 0).getTime())
        } else if (sortBy === 'most-certified') {
            result.sort((a: any, b: any) => (b.certifyCount || 0) - (a.certifyCount || 0))
        }

        return result
    }, [debouncedQuery, timeFilter, followingOnly, sortBy, user?.following])

    const filteredMyLists = useMemo(() => filterAndSort(lists, false), [lists, filterAndSort])
    const filteredCommunity = useMemo(() => filterAndSort(communityLists, true), [communityLists, filterAndSort])
    const totalResults = filteredMyLists.length + filteredCommunity.length

    const sortLabels: Record<SortOption, string> = { 'newest': 'NEWEST', 'oldest': 'OLDEST', 'most-certified': 'MOST CERTIFIED' }
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
                background: 'var(--ink)',
                padding: IS_TOUCH ? '0.75rem 0' : '1.25rem 0 1rem',
                position: 'sticky', top: IS_TOUCH ? 56 : 60, zIndex: 50,
                borderBottom: '1px solid rgba(139,105,20,0.1)',
            }}>
                <div className="container" style={{ maxWidth: 800, display: 'flex', flexDirection: 'column', gap: IS_TOUCH ? '0.5rem' : '0.65rem' }}>
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

                    {/* Filter Pills + Sort */}
                    <div style={{ display: 'flex', gap: IS_TOUCH ? '0.35rem' : '0.5rem', alignItems: 'center', overflowX: IS_TOUCH ? 'auto' : 'visible', WebkitOverflowScrolling: 'touch' as any, paddingBottom: '2px', msOverflowStyle: 'none' as any }}>
                        {/* Time Filters */}
                        <FilterPill label="ALL TIME" active={timeFilter === 'all'} onClick={() => setTimeFilter('all')} />
                        <FilterPill label="THIS WEEK" active={timeFilter === 'week'} onClick={() => setTimeFilter('week')} />
                        <FilterPill label="THIS MONTH" active={timeFilter === 'month'} onClick={() => setTimeFilter('month')} />

                        {/* Separator */}
                        <div style={{ width: '1px', height: '14px', background: 'rgba(139,105,20,0.15)', flexShrink: 0 }} />

                        {/* Following filter — only show if logged in */}
                        {isAuthenticated && (
                            <FilterPill
                                label="FOLLOWING"
                                active={followingOnly}
                                onClick={() => setFollowingOnly(!followingOnly)}
                            />
                        )}

                        {/* Sort dropdown — positioned with portal-like z-index */}
                        <div ref={sortMenuRef} style={{ position: 'relative', marginLeft: 'auto', flexShrink: 0 }}>
                            <button
                                onClick={(e) => { e.stopPropagation(); setShowSortMenu(!showSortMenu) }}
                                style={{
                                    background: showSortMenu ? 'rgba(139,105,20,0.1)' : 'transparent',
                                    border: `1px solid ${showSortMenu ? 'rgba(139,105,20,0.3)' : 'rgba(139,105,20,0.12)'}`,
                                    borderRadius: '20px', padding: '0.35rem 0.75rem',
                                    fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em',
                                    color: showSortMenu ? 'var(--sepia)' : 'var(--fog)',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {sortLabels[sortBy]} <ChevronDown size={10} style={{ transform: showSortMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                            </button>
                            {showSortMenu && (
                                <div style={{
                                    position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                                    background: 'rgba(15,12,8,0.98)', border: '1px solid rgba(139,105,20,0.25)',
                                    borderRadius: '6px', boxShadow: '0 12px 32px rgba(0,0,0,0.8)',
                                    zIndex: 200, minWidth: 160,
                                    backdropFilter: 'blur(12px)',
                                }}>
                                    <div style={{ padding: '0.4rem 0' }}>
                                        {(['newest', 'oldest', 'most-certified'] as SortOption[]).map(opt => (
                                            <button
                                                key={opt}
                                                onClick={(e) => { e.stopPropagation(); setSortBy(opt); setShowSortMenu(false) }}
                                                style={{
                                                    display: 'flex', width: '100%', textAlign: 'left', alignItems: 'center', gap: '0.5rem',
                                                    padding: '0.65rem 1rem', border: 'none',
                                                    background: sortBy === opt ? 'rgba(139,105,20,0.12)' : 'transparent',
                                                    fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em',
                                                    color: sortBy === opt ? 'var(--sepia)' : 'var(--bone)',
                                                    cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,105,20,0.1)'; e.currentTarget.style.color = 'var(--sepia)' }}
                                                onMouseLeave={e => { e.currentTarget.style.background = sortBy === opt ? 'rgba(139,105,20,0.12)' : 'transparent'; e.currentTarget.style.color = sortBy === opt ? 'var(--sepia)' : 'var(--bone)' }}
                                            >
                                                {opt === 'most-certified' && <Award size={11} />}
                                                {sortLabels[opt]}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Results count — hide on mobile to save space */}
                    {!IS_TOUCH && (
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em', color: 'var(--fog)', opacity: 0.6 }}>
                            {hasActiveFilters ? `${totalResults} RESULTS` : `${totalResults} ARCHIVES`}
                        </div>
                    )}
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
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: IS_TOUCH ? '0.4rem' : '1.25rem' }}>
                                {filteredMyLists.map((list: any) => {
                                    const posters = list.films.filter((f: any) => f.poster_path).slice(0, 3).map((f: any) => f.poster_path)
                                    return (
                                    <Link
                                        key={list.id}
                                        to={`/lists/${list.id}`}
                                        className="fade-in-up"
                                        style={{
                                            textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column',
                                            background: 'var(--ink)',
                                            border: '1px solid rgba(139,105,20,0.08)',
                                            borderRadius: '6px',
                                            padding: IS_TOUCH ? '0.6rem' : '1.5rem',
                                            position: 'relative', overflow: 'hidden',
                                            borderLeft: IS_TOUCH ? 'none' : '3px solid rgba(139,105,20,0.4)',
                                            borderBottom: IS_TOUCH ? '2px solid rgba(139,105,20,0.4)' : 'none',
                                            transition: 'border-color 0.3s, box-shadow 0.3s, transform 0.3s',
                                            minHeight: IS_TOUCH ? 130 : 180,
                                            boxShadow: '0 8px 25px rgba(0,0,0,0.6)'
                                        }}
                                        onMouseEnter={(e: any) => {
                                            e.currentTarget.style.borderColor = 'rgba(139,105,20,0.3)'
                                            e.currentTarget.style.boxShadow = '0 12px 35px rgba(0,0,0,0.7), 0 0 20px rgba(139,105,20,0.08)'
                                            e.currentTarget.style.transform = 'translateY(-3px)'
                                            const bg = e.currentTarget.querySelector('.my-bg') as HTMLElement
                                            if (bg) bg.style.transform = 'scale(1.04)'
                                        }}
                                        onMouseLeave={(e: any) => {
                                            e.currentTarget.style.borderColor = 'rgba(139,105,20,0.08)'
                                            e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.6)'
                                            e.currentTarget.style.transform = 'translateY(0)'
                                            const bg = e.currentTarget.querySelector('.my-bg') as HTMLElement
                                            if (bg) bg.style.transform = 'scale(1)'
                                        }}
                                    >
                                        {/* Background Posters */}
                                        <div className="my-bg" style={{ position: 'absolute', inset: 0, zIndex: 0, display: 'flex', width: '100%', height: '100%', transition: 'transform 0.5s' }}>
                                            {posters.length === 0 ? (
                                                <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, rgba(28,23,16,0.4) 0%, rgba(10,7,3,0.7) 100%)' }} />
                                            ) : (
                                                posters.map((p: string, i: number) => (
                                                    <div key={i} style={{ flex: 1, height: '100%', position: 'relative', overflow: 'hidden' }}>
                                                        <img
                                                            src={tmdb.poster(p, 'w185')}
                                                            alt=""
                                                            loading="lazy"
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.35) sepia(0.3) contrast(1.1)' }}
                                                        />
                                                    </div>
                                                ))
                                            )}
                                            {/* Unified Overlay */}
                                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(10,7,3,0.6), rgba(5,4,2,0.95))', zIndex: 1 }} />
                                        </div>

                                        {/* Content */}
                                        <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', height: '100%' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                                                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? '0.75rem' : '1.3rem', color: 'var(--parchment)', lineHeight: 1.15, textShadow: '0 2px 10px rgba(0,0,0,0.8)', WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>
                                                    {list.title}
                                                </h3>
                                                {!IS_TOUCH && (
                                                    <div style={{ color: 'var(--fog)', opacity: 0.5, flexShrink: 0, marginLeft: '0.5rem' }}>
                                                        {list.isPrivate ? <Lock size={14} /> : <Globe size={14} />}
                                                    </div>
                                                )}
                                            </div>
                                            {!IS_TOUCH && list.description && (
                                                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--bone)', marginBottom: 'auto', lineHeight: 1.5, opacity: 0.7, WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>
                                                    {list.description}
                                                </p>
                                            )}
                                            <div style={{ borderTop: '1px solid rgba(139,105,20,0.15)', paddingTop: '0.6rem', marginTop: !IS_TOUCH && list.description ? '1rem' : 'auto', fontFamily: 'var(--font-ui)', fontSize: IS_TOUCH ? '0.45rem' : '0.55rem', letterSpacing: '0.15em', color: 'var(--sepia)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span>{list.films.length} FILMS</span>
                                                {IS_TOUCH && list.isPrivate && <Lock size={10} style={{ opacity: 0.6 }} />}
                                            </div>
                                        </div>
                                    </Link>
                                    )
                                })}
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
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: IS_TOUCH ? '0.4rem' : '1.5rem' }}>
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="skeleton" style={{ height: IS_TOUCH ? 220 : 440, borderRadius: '6px' }} />
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
                                    {debouncedQuery ? 'No collections match your search.' : 'The Archive Awaits Its First Curator.'}
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
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: IS_TOUCH ? '0.4rem' : '1.5rem' }}>
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
                    onCreate={handleCreateListWithFilms}
                />
            )}
        </div>
    )
}
