import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore, useUIStore } from '../store'
import Buster from '../components/Buster'
import { tmdb } from '../tmdb'
import { Plus, Search as SearchIcon, X, ChevronDown, Award, MessageCircle } from 'lucide-react'
import CreateListModal from '../components/CreateListModal'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import reelToast from '../utils/reelToast'
import PageSEO from '../components/PageSEO'
import ListActions from '../components/ListActions'
import { motion } from 'framer-motion'

import { useViewport } from '../hooks/useViewport'
import { sanitizeDescription, sanitizeListTitle } from '../utils/sanitize'
import { useBanCheck } from '../hooks/useBanCheck'
import ReportButton from '../components/ReportButton'
import '../styles/stacks.css'


// ── FRAMER MOTION VARIANTS (matching Society page pattern) ──
const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.08, delayChildren: 0.1 }
    }
}
const itemVariants = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', damping: 22, stiffness: 90 } }
}


// ══════════════════════════════════════════════════════════
// COMMUNITY STACK CARD — The Dossier
// ══════════════════════════════════════════════════════════
function CommunityListCard({ list, index }: { list: any; index: number }) {
    const { isTouch: IS_TOUCH } = useViewport()
    const gradients = [
        'linear-gradient(135deg, #1a0e05 0%, #3a2010 40%, #0a0703 100%)',
        'linear-gradient(135deg, #0a0a0a 0%, #1c1710 50%, #2a1a05 100%)',
        'linear-gradient(135deg, #05080a 0%, #101820 50%, #1a2010 100%)',
        'linear-gradient(135deg, #0a0508 0%, #1a0f18 50%, #0a0508 100%)',
    ]
    const cardGradient = gradients[Math.abs(list.id.charCodeAt(0)) % gradients.length]
    const posters = list.films.filter((f: any) => f.poster_path).slice(0, 3).map((f: any) => f.poster_path)

    // Generate catalog reference from list ID
    const refCode = `REF: ${list.id.slice(0, 4).toUpperCase()}`

    return (
        <motion.div variants={itemVariants as any}>
            <Link
                to={`/lists/${list.id}`}
                className="stack-card"
                style={{ minHeight: IS_TOUCH ? 200 : 440 }}
            >
                {/* Catalog Reference Stamp */}
                <div className="stack-card-ref">{refCode}</div>

                {/* Poster Background (Triptych) */}
                <div className="stack-card-poster-wrap">
                    {posters.length === 0 ? (
                        <div style={{ width: '100%', height: '100%', background: cardGradient }} />
                    ) : (
                        posters.map((p: string, i: number) => (
                            <div key={i} className="stack-card-poster-panel">
                                <img
                                    src={tmdb.poster(p, 'w342')}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                />
                                {i < posters.length - 1 && (
                                    <div className="stack-card-poster-fade" />
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* Overlays */}
                <div className="stack-card-glow" />
                <div className="stack-card-gradient" />

                {/* Content Pane */}
                <div className="stack-card-content">
                    {/* Meta Row — Film count badge + certify count */}
                    <div className="stack-card-meta-row">
                        <span className="stack-card-badge">
                            {list.count} FILMS
                        </span>
                        {!IS_TOUCH && list.certifyCount > 0 && (
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em', color: 'var(--flicker)', display: 'flex', alignItems: 'center', gap: '0.2rem', opacity: 0.8 }}>
                                <Award size={10} /> {list.certifyCount}
                            </span>
                        )}
                        <div className="stack-card-meta-divider" />
                    </div>

                    {/* Title */}
                    <h3 className="stack-card-title">
                        {sanitizeListTitle(list.title).toUpperCase()}
                    </h3>

                    {/* Description — desktop only */}
                    {!IS_TOUCH && sanitizeDescription(list.desc) && (
                        <p className="stack-card-desc">{sanitizeDescription(list.desc)}</p>
                    )}

                    {/* Curator */}
                    {!IS_TOUCH && (
                        <div className="stack-card-curator">
                            <div className="stack-card-curator-dot" />
                            <span className="stack-card-curator-name">
                                @{list.user.toUpperCase()}
                            </span>
                        </div>
                    )}

                    {/* Certify + Comment Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                        <ReportButton contentType="list" contentId={list.id} size={IS_TOUCH ? 10 : 12} />
                    </div>
                </div>
            </Link>
        </motion.div>
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
type SortOption = 'newest' | 'oldest' | 'most-certified'


// ══════════════════════════════════════════════════════════
// MAIN PAGE — THE STACKS
// ══════════════════════════════════════════════════════════
export default function ListsPage() {
    const { isTouch: IS_TOUCH } = useViewport()
    const { isAuthenticated, user } = useAuthStore()
    const queryClient = useQueryClient()

    const { checkBan } = useBanCheck()

    const handleCreateList = async (listData: any) => {
        if (checkBan()) return
        // Create list via Supabase directly
        const { data: newList, error } = await supabase.from('lists').insert({
            title: listData.title,
            description: listData.description || '',
            is_private: listData.isPrivate || false,
            user_id: user?.id,
        }).select().single()

        if (error || !newList) {
            reelToast.error('Failed to create collection')
            return
        }

        // Add films if any
        if (listData.films && listData.films.length > 0) {
            const filmRows = listData.films.map((film: any) => ({
                list_id: newList.id,
                film_id: film.id,
                film_title: film.title,
                poster_path: film.poster_path || null,
            }))
            await supabase.from('list_items').insert(filmRows)
        }

        reelToast.success('Collection created!')
        // Refresh the list
        queryClient.invalidateQueries({ queryKey: ['all-public-lists'] })
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
        const handleClick = (e: PointerEvent) => {
            if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
                setShowSortMenu(false)
            }
        }
        if (showSortMenu) document.addEventListener('pointerdown', handleClick)
        return () => document.removeEventListener('pointerdown', handleClick)
    }, [showSortMenu])

    // Fetch public community lists from Supabase
    // Fetch ALL public lists from Supabase (no user exclusion)
    const { data: allLists = [], isLoading } = useQuery({
        queryKey: ['all-public-lists'],
        queryFn: async () => {
            const q = supabase
                .from('lists')
                .select('id, title, description, created_at, user_id, is_private')
                .eq('is_private', false)
                .order('created_at', { ascending: false })
                .limit(100)
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
                    // list_comments table doesn't exist — use interactions table instead
                    supabase.from('interactions').select('target_list_id').in('target_list_id', listIds).eq('type', 'comment_list')
                ])

                if (endorsementsResp.data) {
                    endorsementsResp.data.forEach((e: any) => {
                        endorseMap[e.target_list_id] = (endorseMap[e.target_list_id] || 0) + 1
                        if (user?.id && e.user_id === user.id) userEndorsed[e.target_list_id] = true
                    })
                }

                if (commentsResp.data) {
                    commentsResp.data.forEach((c: any) => {
                        commentCountMap[c.target_list_id] = (commentCountMap[c.target_list_id] || 0) + 1
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

    const filteredLists = useMemo(() => filterAndSort(allLists, true), [allLists, filterAndSort])
    const totalResults = filteredLists.length

    const sortLabels: Record<SortOption, string> = { 'newest': 'NEWEST', 'oldest': 'OLDEST', 'most-certified': 'MOST CERTIFIED' }
    const hasActiveFilters = timeFilter !== 'all' || followingOnly || debouncedQuery.trim().length > 0

    return (
        <div className="stacks-page">
            <PageSEO
                title="The Stacks — The ReelHouse Society"
                description="Curated stacks and film collections forged by the Society's devoted members. Discover, certify, and build your own cinema archive."
            />

            {/* ══════════════════════════════════════════
                HERO HEADER — "The Library Entrance"
            ══════════════════════════════════════════ */}
            <motion.header
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7 }}
                className="stacks-header"
            >
                <div className="stacks-header-glow" />

                <div className="container" style={{ position: 'relative', zIndex: 1, maxWidth: 800, textAlign: 'center' }}>
                    <div className="stacks-eyebrow">✦ THE REELHOUSE SOCIETY ✦</div>

                    <h1 className="stacks-title">The Stacks</h1>

                    <p className="stacks-subtitle">
                        Behind these doors lies the permanent collection — curated stacks forged by the Society's most devoted members.
                    </p>

                    {/* Ornamental Divider */}
                    <div className="stacks-ornament">
                        <div className="stacks-ornament-line stacks-ornament-line--left" />
                        <div className="stacks-ornament-dot" />
                        <div className="stacks-ornament-line stacks-ornament-line--right" />
                    </div>

                    {isAuthenticated ? (
                        <button className="btn btn-primary stacks-cta" style={{ padding: '0.7rem 1.8rem', letterSpacing: '0.18em', fontSize: '0.65rem' }} onClick={() => setShowCreate(true)} id="create-collection-btn">
                            <Plus size={14} /> CREATE COLLECTION
                        </button>
                    ) : (
                        <button className="btn btn-ghost stacks-cta" style={{ padding: '0.7rem 1.8rem', letterSpacing: '0.12em', fontSize: '0.6rem' }} onClick={() => openSignupModal()}>
                            JOIN TO CREATE COLLECTIONS
                        </button>
                    )}
                </div>
            </motion.header>

            {/* Gold Divider */}
            <div className="stacks-gold-divider" />

            {/* ══════════════════════════════════════════
                SEARCH + FILTER BAR — "The Index Drawer"
            ══════════════════════════════════════════ */}
            <div className="stacks-filter-bar">
                <div className="container" style={{ maxWidth: 800, display: 'flex', flexDirection: 'column', gap: IS_TOUCH ? '0.5rem' : '0.65rem' }}>
                    {/* Search Input */}
                    <div style={{ position: 'relative' }}>
                        <SearchIcon size={IS_TOUCH ? 14 : 16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--sepia)', opacity: 0.6, zIndex: 1 }} />
                        <input
                            ref={searchRef}
                            className="stacks-search-input"
                            placeholder="Search the permanent collection..."
                            value={query}
                            onChange={(e: any) => setQuery(e.target.value)}
                        />
                        {query && (
                            <button type="button" onClick={() => setQuery('')} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Filter Pills + Sort */}
                    <div style={{ width: '100%', maxWidth: '100vw', overflowX: 'hidden' }}>
                        <div style={{ display: 'flex', gap: IS_TOUCH ? '0.35rem' : '0.5rem', alignItems: 'center', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '2px', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                        <FilterPill label="ALL TIME" active={timeFilter === 'all'} onClick={() => setTimeFilter('all')} />
                        <FilterPill label="THIS WEEK" active={timeFilter === 'week'} onClick={() => setTimeFilter('week')} />
                        <FilterPill label="THIS MONTH" active={timeFilter === 'month'} onClick={() => setTimeFilter('month')} />

                        <div style={{ width: '1px', height: '14px', background: 'rgba(139,105,20,0.15)', flexShrink: 0 }} />

                        {isAuthenticated && (
                            <FilterPill label="FOLLOWING" active={followingOnly} onClick={() => setFollowingOnly(!followingOnly)} />
                        )}

                        {/* Sort dropdown */}
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
                </div>

                    {/* Results count */}
                    {!IS_TOUCH && (
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em', color: 'var(--fog)', opacity: 0.6 }}>
                            {hasActiveFilters ? `${totalResults} RESULTS` : `${totalResults} ARCHIVES`}
                        </div>
                    )}
                </div>
            </div>

            {/* ══════════════════════════════════════════
                MAIN CONTENT
            ══════════════════════════════════════════ */}
            <main style={{ padding: IS_TOUCH ? '1.5rem 0 5rem' : '2.5rem 0 5rem', position: 'relative', zIndex: 1 }}>
                <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: IS_TOUCH ? '2rem' : '3rem' }}>



                    {/* ── ALL PUBLIC LISTS ── */}
                    <section>
                        <div className="stacks-section-header">
                            <div className="stacks-section-accent" />
                            <div>
                                <div className="stacks-section-eyebrow">SOCIETY ARCHIVES</div>
                                <div className="stacks-section-title">
                                    {debouncedQuery ? `Results (${filteredLists.length})` : 'Curated Stacks'}
                                </div>
                            </div>
                        </div>

                        {isLoading ? (
                            <div className="stacks-grid">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <div key={i} className="shimmer stacks-skeleton" style={{ animationDelay: `${i * 0.1}s` }} />
                                ))}
                            </div>
                        ) : filteredLists.length === 0 ? (
                            /* ── EMPTY STATE — "The Empty Shelf" ── */
                            <div className="stacks-empty">
                                <div className="stacks-empty-rule" />
                                <Buster size={IS_TOUCH ? 50 : 60} mood="peeking" />
                                <div className="stacks-empty-label">
                                    {debouncedQuery ? 'NO MATCHES' : 'ARCHIVE EMPTY'}
                                </div>
                                <div className="stacks-empty-title">
                                    {debouncedQuery ? 'No collections match your search.' : 'The Archive Awaits Its First Curator.'}
                                </div>
                                {!debouncedQuery && (
                                    <div className="stacks-empty-desc">
                                        Every great library began with a single volume. Be the one to forge a permanent stack for the Society.
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
                            <motion.div
                                className="stacks-grid"
                                variants={containerVariants as any}
                                initial="hidden"
                                animate="visible"
                            >
                                {filteredLists.map((list: any, i: number) => (
                                    <CommunityListCard key={list.id} list={list} index={i} />
                                ))}
                            </motion.div>
                        )}
                    </section>

                    {/* ── BOTTOM CTA — "The Vault Door" ── */}
                    {!isAuthenticated && (
                        <div className="stacks-gate">
                            <div className="stacks-gate-rule stacks-gate-rule--top" />
                            <div className="stacks-gate-label">MEMBERS ONLY</div>
                            <div className="stacks-gate-title">The Archives Are Closed</div>
                            <div className="stacks-gate-desc">
                                Forge your own collections. Immortalize your cinematic taste in the permanent archive.
                            </div>
                            <button className="btn btn-primary stacks-gate-btn" style={{ padding: '0.8rem 2.2rem', letterSpacing: '0.2em', fontSize: '0.65rem' }} onClick={() => openSignupModal()}>
                                CLAIM YOUR SEAT
                            </button>
                            <div className="stacks-gate-rule stacks-gate-rule--bottom" />
                        </div>
                    )}
                </div>
            </main>

            {showCreate && (
                <CreateListModal
                    onClose={() => setShowCreate(false)}
                    onCreate={handleCreateList}
                />
            )}
        </div>
    )
}
