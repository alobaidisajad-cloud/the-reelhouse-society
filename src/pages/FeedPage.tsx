import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useAuthStore, useUIStore } from '../store'
import { supabase, isSupabaseConfigured } from '../supabaseClient'
import { Info } from 'lucide-react'

// ── Extracted Components ──
import ActivityCard from '../components/feed/ActivityCard'
import RatingLegend from '../components/feed/RatingLegend'
import SectionErrorBoundary from '../components/SectionErrorBoundary'
import WeeklyChallenge from '../components/profile/WeeklyChallenge'
import PageSEO from '../components/PageSEO'

import { useViewport } from '../hooks/useViewport'
import { useScrollRevealAll } from '../hooks/useScrollReveal'

// ── The Underground Styles ──
import '../styles/reel.css'

// ── Helper: map raw log rows to feed entries ──
function mapLogsToFeed(data: any[]) {
    const mapped = (data || []).map(l => {
        // Handle single profile or array of profiles depending on Supabase's join behavior
        const prof = Array.isArray(l.profiles) ? l.profiles[0] : l.profiles;
        return {
            id: l.id,
            user: prof?.username || 'anonymous',
            userRole: prof?.role || 'cinephile',
            privacyEndorsements: prof?.preferences?.privacy_endorsements || 'everyone',
            privacyAnnotations: prof?.preferences?.privacy_annotations || 'everyone',
            film: {
                id: l.film_id,
                title: l.film_title,
                year: l.year,
                poster: l.poster_path,
            },
            rating: l.rating,
            review: l.review,
            pullQuote: l.pull_quote || '',
            dropCap: l.drop_cap || false,
            autopsy: l.autopsy,
            isAutopsied: l.is_autopsied || false,
            endorsementCount: 0,
            createdAt: l.created_at,
            watchedDate: l.watched_date,
            timestamp: l.created_at
                ? new Date(l.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase()
                : 'RECENT'
        };
    })

    // Deduplicate: one card per user+film
    const seen = new Set()
    return mapped.filter((entry: any) => {
        const key = `${entry.user}:${entry.film.id}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

// ── FEED PAGE — "THE UNDERGROUND" ──
export default function FeedPage() {
    const { isTouch: IS_TOUCH } = useViewport()
    const feedContainerRef = useRef<HTMLDivElement>(null)
    useScrollRevealAll(feedContainerRef)
    const { isAuthenticated, user } = useAuthStore()
    const openSignupModal = useUIStore(state => state.openSignupModal)
    const openLogModal = useUIStore(state => state.openLogModal)

    // ── Feed Tab State ──
    type FeedTab = 'for-you' | 'following'
    const [feedTab, setFeedTab] = useState<FeedTab>('for-you')

    // ── Feed Data ──
    const [showLegend, setShowLegend] = useState(false)
    const [recentLists, setRecentLists] = useState<any[]>([])

    // ── Fetch Helper ──
    const fetchFeed = async ({ pageParam = 0 }, mode: 'for-you' | 'following') => {
        if (!isSupabaseConfigured) return { items: [], hasNextPage: false }
        if (mode === 'following' && (!user || !user.following?.length)) return { items: [], hasNextPage: false }

        let query = supabase
            .from('logs')
            .select(`
                id, user_id, film_id, film_title, poster_path, year, rating, review, status, watched_date, is_spoiler, pull_quote, drop_cap, alt_poster, editorial_header, is_autopsied, autopsy, created_at,
                profiles ( id, username, role, preferences )
            `)
            .order('created_at', { ascending: false })
            .range(pageParam * 20, (pageParam + 1) * 20 - 1)

        if (mode === 'following') {
            const followingArr = user?.following || []
            const { data: followedProfiles } = await supabase.from('profiles').select('id').in('username', followingArr)
            if (!followedProfiles?.length) return { items: [], hasNextPage: false }
            query = query.in('user_id', followedProfiles.map((p: any) => p.id))
        }

        const { data, error } = await query
        if (error || !data?.length) return { items: [], hasNextPage: false }
        
        // Filter out simple "watched" logs—only broadcast reviews/ratings to the feed
        const publicData = data.filter((l: any) => l.rating > 0 || (l.review && l.review.trim() !== ''))
        return { items: mapLogsToFeed(publicData), hasNextPage: data.length === 20 }
    }

    // ── Infinite Queries ──
    const {
        data: communityData,
        fetchNextPage: fetchNextCommunity,
        hasNextPage: hasNextCommunity,
        isFetchingNextPage: isFetchingNextCommunity,
        isLoading: feedLoading
    } = useInfiniteQuery({
        queryKey: ['feed', 'for-you'],
        queryFn: (params) => fetchFeed(params, 'for-you'),
        initialPageParam: 0,
        getNextPageParam: (lastPage, pages) => lastPage.hasNextPage ? pages.length : undefined
    })

    const {
        data: followingData,
        fetchNextPage: fetchNextFollowing,
        hasNextPage: hasNextFollowing,
        isFetchingNextPage: isFetchingNextFollowing,
        isLoading: followingLoading
    } = useInfiniteQuery({
        queryKey: ['feed', 'following', user?.following?.length],
        queryFn: (params) => fetchFeed(params, 'following'),
        enabled: isAuthenticated && !!user?.following?.length,
        initialPageParam: 0,
        getNextPageParam: (lastPage, pages) => lastPage.hasNextPage ? pages.length : undefined
    })

    const { data: societyPicks = [] } = useQuery({
        queryKey: ['society_picks_live'],
        queryFn: async () => {
            if (!isSupabaseConfigured) return []
            const { data, error } = await supabase
                .from('logs')
                .select('film_id, film_title, year, rating, review')
                .gte('rating', 4)
                .not('review', 'is', null)
                .order('created_at', { ascending: false })
                .limit(3)
            if (error) return []
            // Deduplicate by film_id
            const unique = new Map()
            data.forEach((l: any) => { if (!unique.has(l.film_id)) unique.set(l.film_id, l) })
            return Array.from(unique.values()).slice(0, 3)
        }
    })

    const observer = useRef<IntersectionObserver | null>(null)
    const lastFeedElementRef = useCallback((node: any) => {
        if (feedTab === 'for-you' ? isFetchingNextCommunity : isFetchingNextFollowing) return
        if (observer.current) observer.current.disconnect()
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) {
                if (feedTab === 'for-you' && hasNextCommunity) fetchNextCommunity()
                else if (feedTab === 'following' && hasNextFollowing) fetchNextFollowing()
            }
        })
        if (node) observer.current.observe(node)
    }, [feedTab, isFetchingNextCommunity, isFetchingNextFollowing, hasNextCommunity, hasNextFollowing, fetchNextCommunity, fetchNextFollowing])

    // ── Sidebar Data ──
    const fetchSidebarData = useCallback(async () => {
        if (!isSupabaseConfigured) return
        try {
            const { data: listsData } = await supabase
                .from('lists')
                .select('id, title, description, user_id')
                .order('created_at', { ascending: false })
                .limit(3)

            if (listsData) {
                const curatorIds = [...new Set(listsData.map((l: any) => l.user_id).filter(Boolean))]
                let curatorMap: { [key: string]: string } = {}
                if (curatorIds.length > 0) {
                    const { data: curatorsData } = await supabase
                        .from('profiles').select('id, username').in('id', curatorIds)
                    if (curatorsData) curatorMap = Object.fromEntries(curatorsData.map((p: { id: string, username: string }) => [p.id, p.username]))
                }
                setRecentLists(listsData.map((l: { id: string, title: string, user_id: string }) => ({
                    id: l.id,
                    title: l.title,
                    curator: curatorMap[l.user_id] || 'The Society'
                })))
            }
        } catch {
            // Sidebar is non-critical — fail silently so the feed still renders
        }
    }, [user?.username])

    useEffect(() => {
        fetchSidebarData()
    }, [fetchSidebarData])

    // Active feed based on tab
    const communityFeed = communityData?.pages.flatMap(p => p.items) || []
    const followingFeed = followingData?.pages.flatMap(p => p.items) || []
    const activeFeed = feedTab === 'following' ? followingFeed : communityFeed
    const isLoading = feedTab === 'following' ? followingLoading : feedLoading

    // ── Derived stats (no new API calls) ──
    const thisWeekCount = useMemo(() => {
        const now = new Date()
        const weekStart = new Date(now)
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
        weekStart.setHours(0, 0, 0, 0)
        return communityFeed.filter((l: any) => {
            const d = new Date(l.createdAt || l.timestamp || new Date().toISOString())
            return d >= weekStart
        }).length
    }, [communityFeed])

    return (
        <div ref={feedContainerRef} className="reel-lounge" style={{ paddingTop: 70, minHeight: '100dvh', background: 'var(--ink)', position: 'relative', zIndex: 1 }}>
            <PageSEO title="The Reel" description="Classified transmissions from The Underground — The ReelHouse Society." />
            
            {/* ── THE UNDERGROUND HEADER ── */}
            <div className="scroll-reveal" style={{
                background: 'var(--ink)',
                borderBottom: 'none',
                padding: IS_TOUCH ? '1.5rem 0 0' : '3rem 0 0',
                position: 'relative',
                overflow: 'hidden',
                flexShrink: 0
            }}>
                {/* Ambient radial glow behind title */}
                <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', height: '100%', background: 'radial-gradient(ellipse at top, rgba(139,105,20,0.13) 0%, transparent 60%)', pointerEvents: 'none' }} />
                
                <div className="container" style={{ position: 'relative', zIndex: 1, maxWidth: 800, textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.4em', color: 'var(--sepia)', marginBottom: '0.75rem', opacity: 0.8 }}>
                        ✦ THE REELHOUSE SOCIETY ✦
                    </div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? 'clamp(1.6rem, 5vw, 2.2rem)' : 'clamp(2.2rem, 5vw, 3.5rem)', color: 'var(--parchment)', marginBottom: '0.5rem', lineHeight: 1, textShadow: '0 0 60px rgba(139,105,20,0.25), 0 4px 20px rgba(0,0,0,0.6)' }}>
                        The Reel
                    </h1>
                    <p style={{ fontFamily: 'var(--font-sub)', fontSize: '0.95rem', color: 'var(--fog)', maxWidth: 500, margin: '0 auto 0.75rem', opacity: 0.7 }}>
                        Classified transmissions from The Underground.
                    </p>
                    
                    {/* LIVE Indicator */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: IS_TOUCH ? '0.5rem' : '0' }}>
                        <span className="reel-live-dot" />
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.42rem', letterSpacing: '0.25em', color: 'var(--fog)', opacity: 0.7 }}>
                            LIVE · {communityFeed.length > 0 ? `${communityFeed.length} DISPATCH${communityFeed.length === 1 ? '' : 'ES'}` : 'AWAITING SIGNAL'}
                        </span>
                    </div>
                </div>

                {/* ── STICKY TAB BAR ── */}
                <div
                    className="reel-tab-bar"
                    style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: 0,
                        marginTop: IS_TOUCH ? '1rem' : '1.5rem',
                        position: 'sticky',
                        top: IS_TOUCH ? 56 : 64,
                        zIndex: 100,
                    }}
                >
                    <button
                        className="reel-tab"
                        data-active={feedTab === 'for-you'}
                        onClick={() => setFeedTab('for-you')}
                    >
                        MAIN REEL
                    </button>
                    {isAuthenticated && (
                        <button
                            className="reel-tab"
                            data-active={feedTab === 'following'}
                            onClick={() => setFeedTab('following')}
                        >
                            FOLLOWING
                        </button>
                    )}
                </div>
            </div>

            {/* ── PERFORATION BAR ── */}
            <div className="reel-perf-bar" />

            <main id="feed-scroller" className="page-top" style={{ paddingBottom: IS_TOUCH ? 'calc(5rem + env(safe-area-inset-bottom))' : '3rem', paddingTop: IS_TOUCH ? '1rem' : '2rem' }}>
                <div className="container feed-grid" style={{ display: 'grid', gridTemplateColumns: IS_TOUCH ? '1fr' : 'minmax(0, 1fr) 300px', gap: IS_TOUCH ? '2rem' : '3rem', alignItems: 'start' }}>

                    {/* ── SIDEBAR ON MOBILE: Horizontal strip above feed ── */}
                    {IS_TOUCH && (
                        <SectionErrorBoundary label="SIDEBAR">
                        <div className="reel-sidebar-strip">
                            {/* Weekly Challenge — compact */}
                            <div className="reel-bulletin" style={{ minWidth: 220 }}>
                                <div className="reel-bulletin-label">SOCIETY DIRECTIVE</div>
                                <WeeklyChallenge logs={communityFeed as any} />
                            </div>
                            
                            {/* Currently Logged */}
                            <div className="reel-bulletin" style={{ minWidth: 200, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <div className="reel-bulletin-label">THIS WEEK</div>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--parchment)', lineHeight: 1 }}>
                                    {thisWeekCount}
                                </div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.4rem', letterSpacing: '0.15em', color: 'var(--fog)', marginTop: '0.3rem' }}>
                                    DISPATCHES FILED
                                </div>
                            </div>

                            {/* Curated Lists — compact */}
                            {recentLists.slice(0, 2).map((list: any) => (
                                <Link key={list.id} to={`/lists/${list.id}`} style={{ textDecoration: 'none' }}>
                                    <div className="reel-bulletin" style={{ minWidth: 200 }}>
                                        <div className="reel-bulletin-label">MEMBERS' ARCHIVE</div>
                                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '0.25rem' }}>
                                            {list.title}
                                        </div>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>
                                            BY @{list.curator.toUpperCase()}
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                        </SectionErrorBoundary>
                    )}

                    {/* ── MAIN FEED ── */}
                    <SectionErrorBoundary label="COMMUNITY FEED">
                    <div className="feed-main">

                        {/* Rating Legend Toggle */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                            <button
                                onClick={() => setShowLegend(!showLegend)}
                                style={{
                                    background: 'none', border: '1px solid rgba(139,105,20,0.15)',
                                    borderRadius: '3px', padding: '0.3rem 0.6rem',
                                    fontFamily: 'var(--font-ui)', fontSize: '0.45rem',
                                    letterSpacing: '0.12em', color: showLegend ? 'var(--sepia)' : 'var(--fog)',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                                    gap: '0.3rem', transition: 'all 0.2s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--sepia)'; e.currentTarget.style.color = 'var(--sepia)' }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(139,105,20,0.15)'; e.currentTarget.style.color = showLegend ? 'var(--sepia)' : 'var(--fog)' }}
                            >
                                <Info size={10} /> {showLegend ? 'CLOSE GUIDE' : 'RATING GUIDE'}
                            </button>
                        </div>
                        {showLegend && <RatingLegend />}

                        {/* Sign-up CTA for non-authenticated users — with blurred peek */}
                        {!isAuthenticated && (
                            <div style={{ position: 'relative', marginBottom: '2rem' }}>
                                {/* Blurred peek cards behind the CTA */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '-6rem', position: 'relative', zIndex: 0 }}>
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className="reel-peek-card">
                                            <div className="reel-peek-poster" />
                                            <div className="reel-peek-lines">
                                                <div className="reel-peek-line" />
                                                <div className="reel-peek-line" />
                                                <div className="reel-peek-line" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                
                                {/* CTA Box */}
                                <div className="reel-cta-breathing" style={{
                                    background: 'linear-gradient(180deg, rgba(11,10,8,0.97) 0%, rgba(10,7,3,0.99) 100%)',
                                    border: '1px solid rgba(139,105,20,0.2)',
                                    padding: IS_TOUCH ? '2.5rem 1.5rem' : '3rem 2rem', textAlign: 'center',
                                    borderRadius: '2px', position: 'relative', zIndex: 1,
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem',
                                    overflow: 'hidden',
                                }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, var(--sepia), transparent)' }} />
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.35em', color: 'var(--sepia)', opacity: 0.8 }}>
                                        MEMBERS ONLY
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? '1.6rem' : '2rem', color: 'var(--parchment)', lineHeight: 1.1 }}>
                                        The Archives Are Closed
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--bone)', maxWidth: 400, lineHeight: 1.6, opacity: 0.7 }}>
                                        Join The Society to trace the footsteps of the finest critics and publish your own cinematic dispatches.
                                    </div>
                                    <button className="btn btn-primary" style={{ padding: '0.85rem 2.5rem', letterSpacing: '0.2em', fontSize: '0.65rem' }} onClick={() => openSignupModal()}>
                                        CLAIM YOUR SEAT
                                    </button>
                                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, var(--sepia), transparent)' }} />
                                </div>
                            </div>
                        )}

                        {/* Following tab — empty state */}
                        {feedTab === 'following' && isAuthenticated && !isLoading && activeFeed.length === 0 && (
                            <div style={{
                                border: '1px solid rgba(139,105,20,0.15)',
                                padding: IS_TOUCH ? '2.5rem 1.5rem' : '3rem 2rem',
                                textAlign: 'center',
                                background: 'linear-gradient(180deg, rgba(28,23,16,0.4) 0%, transparent 100%)',
                                position: 'relative', overflow: 'hidden', borderRadius: '4px',
                                marginBottom: '1.5rem',
                            }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, var(--sepia), transparent)' }} />
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.35em', color: 'var(--sepia)', marginBottom: '1rem' }}>
                                    SIGNAL QUIET
                                </div>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? '1.5rem' : '2rem', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '0.75rem' }}>
                                    No transmissions yet.
                                </div>
                                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--bone)', opacity: 0.6, lineHeight: 1.6, maxWidth: 400, margin: '0 auto 1.5rem' }}>
                                    {(user?.following?.length || 0) === 0
                                        ? 'Follow other members of The Society to see their dispatches here.'
                                        : 'The people you follow haven\'t logged anything yet. Check the Main Reel for community transmissions.'}
                                </p>
                                <button
                                    className="btn btn-ghost"
                                    onClick={() => setFeedTab('for-you')}
                                    style={{ padding: '0.65rem 1.8rem', letterSpacing: '0.15em', fontSize: '0.55rem' }}
                                >
                                    BROWSE MAIN REEL →
                                </button>
                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, var(--sepia), transparent)' }} />
                            </div>
                        )}

                        {/* Loading Skeleton */}
                        {isLoading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <div key={i} className="skeleton" style={{ height: 140, borderRadius: '4px' }} />
                                ))}
                            </div>
                        ) : activeFeed.length === 0 && feedTab === 'for-you' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                {/* Premium empty state */}
                                <div style={{
                                    border: '1px solid rgba(139,105,20,0.15)',
                                    padding: IS_TOUCH ? '2.5rem 1.5rem' : '3rem 2rem',
                                    textAlign: 'center',
                                    background: 'linear-gradient(180deg, rgba(28,23,16,0.5) 0%, transparent 100%)',
                                    position: 'relative', overflow: 'hidden', borderRadius: '4px',
                                }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, var(--sepia), transparent)' }} />
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.35em', color: 'var(--sepia)', marginBottom: '1rem' }}>
                                        PROJECTION BOOTH — STANDING BY
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? '1.5rem' : '2.5rem', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '1rem' }}>
                                        The ink is fresh.
                                    </div>
                                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--bone)', opacity: 0.6, lineHeight: 1.7, maxWidth: 400, margin: '0 auto 2rem' }}>
                                        Be the first to publish a cinematic dispatch and leave your mark in the Society's permanent record.
                                    </p>
                                    <button
                                        className="btn btn-primary"
                                        style={{ padding: '0.85rem 2.5rem', letterSpacing: '0.2em', fontSize: '0.65rem' }}
                                        onClick={() => openLogModal()}
                                    >
                                        LOG THE FIRST FILM
                                    </button>
                                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, var(--sepia), transparent)' }} />
                                </div>

                                {/* Society Picks */}
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.3em', color: 'var(--ash)', textAlign: 'center', opacity: 0.5 }}>
                                    ✦ SOCIETY PICKS — TONIGHT'S RECOMMENDED VIEWING ✦
                                </div>
                                {societyPicks.length > 0 ? societyPicks.map((pick: any) => (
                                    <Link key={pick.film_id} to={`/film/${pick.film_id}`} style={{ textDecoration: 'none' }}>
                                        <div style={{
                                            background: 'var(--soot)', border: '1px solid rgba(139,105,20,0.1)',
                                            borderLeft: '3px solid rgba(139,105,20,0.3)', borderRadius: '4px',
                                            padding: '1.25rem', display: 'flex', gap: '1.25rem',
                                            opacity: 0.8, transition: 'border-color 0.2s, opacity 0.2s',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--sepia)'; e.currentTarget.style.opacity = '1' }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(139,105,20,0.1)'; e.currentTarget.style.opacity = '0.8' }}>
                                            <div style={{ width: 56, height: 84, background: 'var(--ink)', border: '1px solid rgba(139,105,20,0.15)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '3px' }}>
                                                <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--sepia)' }}>✦</span>
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--sepia)', marginBottom: '0.25rem' }}>COMMUNITY HIGHLIGHT · {pick.year || 'N/A'}</div>
                                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--parchment)', marginBottom: '0.5rem' }}>{pick.film_title}</div>
                                                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--bone)', fontStyle: 'italic', opacity: 0.7, WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>"{pick.review}"</div>
                                            </div>
                                        </div>
                                    </Link>
                                )) : (
                                    <div style={{ padding: '1rem', textAlign: 'center', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--ash)' }}>
                                        AWAITING TRANSMISSIONS...
                                    </div>
                                )}
                            </div>

                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {activeFeed.map((log: any, i: number) => {
                                    const isLast = i === activeFeed.length - 1
                                    return (
                                        <div
                                            key={log.id + i}
                                            ref={isLast ? lastFeedElementRef : null}
                                            className="fade-in-up"
                                            style={{ animationDelay: `${Math.min(i * 0.04, 0.4)}s`, '--i': i } as any}
                                        >
                                            <ActivityCard log={log} />
                                        </div>
                                    )
                                })}
                                {(feedTab === 'for-you' ? isFetchingNextCommunity : isFetchingNextFollowing) && (
                                    <div className="skeleton" style={{ height: 140, borderRadius: '4px', opacity: 0.5, marginTop: '0.5rem' }} />
                                )}
                            </div>
                        )}
                    </div>
                    </SectionErrorBoundary>

                    {/* ── DESKTOP SIDEBAR — "The Society Bulletin Board" ── */}
                    {!IS_TOUCH && (
                    <SectionErrorBoundary label="SIDEBAR">
                    <div className="reel-sidebar-strip">

                        {/* Currently Logged — Live Counter */}
                        <div className="reel-bulletin">
                            <div className="reel-bulletin-label">UNDERGROUND ACTIVITY</div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                <span style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem', color: 'var(--parchment)', lineHeight: 1 }}>
                                    {thisWeekCount}
                                </span>
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.4rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>
                                    THIS WEEK
                                </span>
                            </div>
                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--bone)', opacity: 0.5 }}>
                                dispatches filed by the society
                            </div>
                        </div>

                        {/* Weekly Challenge — Society Directive */}
                        <div className="reel-bulletin">
                            <div className="reel-bulletin-label">SOCIETY DIRECTIVE</div>
                            <WeeklyChallenge logs={communityFeed as any} />
                        </div>

                        {/* Members' Archives */}
                        <div>
                            <div className="section-title" style={{ borderBottom: '1px solid rgba(139,105,20,0.3)', paddingBottom: '0.5rem', fontSize: '0.5rem', letterSpacing: '0.25em' }}>
                                MEMBERS' ARCHIVES
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
                                {recentLists.length === 0 ? (
                                    <>
                                        {[
                                            { title: 'Essential Noir', curator: 'THE ARCHIVIST' },
                                            { title: 'Arthouse Manifesto', curator: 'THE ORACLE' },
                                        ].map(ph => (
                                            <Link key={ph.title} to="/lists" style={{ textDecoration: 'none' }}>
                                                <div style={{ padding: '0.75rem', background: 'var(--ink)', border: '1px solid var(--ash)', borderLeft: '3px solid rgba(139,105,20,0.15)', opacity: 0.5, cursor: 'pointer', transition: 'opacity 0.2s, border-left-color 0.2s' }} onMouseEnter={e => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.borderLeftColor = 'var(--sepia)' }} onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.borderLeftColor = 'rgba(139,105,20,0.15)' }}>
                                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '0.35rem' }}>
                                                        {ph.title}
                                                    </div>
                                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>
                                                        BY {ph.curator}
                                                    </div>
                                                </div>
                                            </Link>
                                        ))}
                                    </>
                                ) : recentLists.map((list: any) => (
                                    <Link key={list.id} to={`/lists/${list.id}`} style={{ textDecoration: 'none' }}>
                                        <div style={{ padding: '0.75rem', background: 'var(--ink)', border: '1px solid rgba(139,105,20,0.15)', borderLeft: '3px solid rgba(139,105,20,0.2)', cursor: 'pointer', transition: 'border-left-color 0.2s, border-color 0.2s' }} onMouseEnter={e => { e.currentTarget.style.borderLeftColor = 'var(--sepia)'; e.currentTarget.style.borderColor = 'rgba(139,105,20,0.3)' }} onMouseLeave={e => { e.currentTarget.style.borderLeftColor = 'rgba(139,105,20,0.2)'; e.currentTarget.style.borderColor = 'rgba(139,105,20,0.15)' }}>
                                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '0.35rem' }}>
                                                {list.title}
                                            </div>
                                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>
                                                BY @{list.curator.toUpperCase()}
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                            <Link to="/lists" style={{ display: 'inline-block', marginTop: '1.25rem', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--sepia)', textDecoration: 'none', borderBottom: '1px dashed var(--sepia)' }}>
                                BROWSE ALL LISTS
                            </Link>
                        </div>

                    </div>
                    </SectionErrorBoundary>
                    )}
                </div>
            </main>
        </div>
    )
}
