import { useState, useCallback, useRef, useMemo } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { Link, useNavigate } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useAuthStore, useUIStore } from '../store'
import { supabase, isSupabaseConfigured } from '../supabaseClient'
import { Eye, Clock, MessageSquare, Info, Shield, RefreshCcw } from 'lucide-react'

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
            editorialHeader: l.editorial_header || null,
            autopsy: l.autopsy,
            isAutopsied: l.is_autopsied || false,
            videoUrl: l.video_url || null,
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
    const navigate = useNavigate()

    // ── Feed Data ──
    const [showLegend, setShowLegend] = useState(false)

    // ── Pull-to-Refresh State ──
    const [pullDistance, setPullDistance] = useState(0)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const pullStartY = useRef(0)

    const handleTouchStart = (e: React.TouchEvent) => {
        if (!IS_TOUCH) return
        if (window.scrollY <= 0) pullStartY.current = e.touches[0].clientY
        else pullStartY.current = 0
    }

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!IS_TOUCH || pullStartY.current <= 0 || window.scrollY > 0) return
        const y = e.touches[0].clientY
        const distance = y - pullStartY.current
        if (distance > 0) {
            setPullDistance(Math.min(distance * 0.4, 80))
            if (distance > 10 && e.cancelable) e.preventDefault()
        } else {
            setPullDistance(0)
        }
    }

    const handleTouchEnd = async () => {
        if (!IS_TOUCH) return
        if (pullDistance > 60 && !isRefreshing) {
            setIsRefreshing(true)
            if (feedTab === 'following') await refetchFollowing()
            else await refetchCommunity()
            setIsRefreshing(false)
        }
        setPullDistance(0)
        pullStartY.current = 0
    }

    // ── Fetch Helper ──
    const fetchFeed = async ({ pageParam = 0 }, mode: 'for-you' | 'following') => {
        if (!isSupabaseConfigured) return { items: [], hasNextPage: false }
        if (mode === 'following' && (!user || !user.following?.length)) return { items: [], hasNextPage: false }

        let query = supabase
            .from('logs')
            .select(`
                id, user_id, film_id, film_title, poster_path, year, rating, review, status, watched_date, is_spoiler, pull_quote, drop_cap, alt_poster, editorial_header, is_autopsied, autopsy, video_url, created_at,
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
        
        // Filter out simple "watched" logs—only broadcast actual written reviews to the feed
        const publicData = data.filter((l: any) => l.review && l.review.trim() !== '')
        return { items: mapLogsToFeed(publicData), hasNextPage: data.length === 20 }
    }

    // ── Infinite Queries ──
    const {
        data: communityData,
        fetchNextPage: fetchNextCommunity,
        hasNextPage: hasNextCommunity,
        isFetchingNextPage: isFetchingNextCommunity,
        isLoading: feedLoading,
        refetch: refetchCommunity
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
        isLoading: followingLoading,
        refetch: refetchFollowing
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

    // Virtuoso handles infinite scroll natively via endReached — no manual IntersectionObserver needed

    // ── Sidebar Data (TanStack cached — no redundant fetches on navigation) ──
    const { data: recentLists = [] } = useQuery({
        queryKey: ['sidebar_lists'],
        queryFn: async () => {
            if (!isSupabaseConfigured) return []
            const { data: listsData } = await supabase
                .from('lists')
                .select('id, title, description, user_id')
                .order('created_at', { ascending: false })
                .limit(3)
            if (!listsData) return []
            const curatorIds = [...new Set(listsData.map((l: any) => l.user_id).filter(Boolean))]
            let curatorMap: { [key: string]: string } = {}
            if (curatorIds.length > 0) {
                const { data: curatorsData } = await supabase
                    .from('profiles').select('id, username').in('id', curatorIds)
                if (curatorsData) curatorMap = Object.fromEntries(curatorsData.map((p: { id: string, username: string }) => [p.id, p.username]))
            }
            return listsData.map((l: { id: string, title: string, user_id: string }) => ({
                id: l.id, title: l.title,
                curator: curatorMap[l.user_id] || 'The Society'
            }))
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
    })


    // Active feed based on tab
    const communityFeed = useMemo(() => communityData?.pages.flatMap(p => p.items) || [], [communityData])
    const followingFeed = useMemo(() => followingData?.pages.flatMap(p => p.items) || [], [followingData])
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
        <div ref={feedContainerRef} className="reel-lounge" style={{ paddingTop: 70, minHeight: '100dvh', background: 'var(--ink)', position: 'relative', zIndex: 1 }} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
            <PageSEO title="The Reel" description="Classified transmissions from The Underground — The ReelHouse Society." />
            
            {/* ── THE UNDERGROUND HEADER ── */}
            <div className="scroll-reveal" style={{
                background: 'var(--ink)',
                borderBottom: 'none',
                padding: IS_TOUCH ? '1.5rem 0 0' : '3rem 0 0',
                position: 'relative',
                overflow: 'hidden',
                flexShrink: 0,
                transform: `translateY(${isRefreshing ? 60 : pullDistance}px)`,
                transition: isRefreshing || pullDistance === 0 ? 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'none'
            }}>
                {/* Visual Pull Indicator (behind header, revealed as we drag it down) */}
                {IS_TOUCH && (pullDistance > 0 || isRefreshing) && (
                    <div style={{
                        position: 'absolute', top: -40, left: 0, right: 0, height: 40,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 0
                    }}>
                        <div style={{
                            transform: `rotate(${(isRefreshing ? 100 : pullDistance) * 5}deg)`,
                            color: pullDistance > 60 || isRefreshing ? 'var(--sepia)' : 'var(--fog)',
                            animation: isRefreshing ? 'pullSpin 1s linear infinite' : 'none',
                            opacity: isRefreshing ? 1 : Math.min(pullDistance / 60, 1),
                            transition: 'color 0.2s',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <RefreshCcw size={20} strokeWidth={1.5} />
                        </div>
                    </div>
                )}
                <style>{`
                    @keyframes pullSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                `}</style>

                {/* Ambient radial glow behind title */}
                <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', height: '100%', background: 'radial-gradient(ellipse at top, rgba(139,105,20,0.13) 0%, transparent 60%)', pointerEvents: 'none', zIndex: 1 }} />
                
                <div className="container" style={{ position: 'relative', zIndex: 2, maxWidth: 800, textAlign: 'center' }}>
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
                        transform: `translateY(${isRefreshing ? 60 : pullDistance}px)`,
                        transition: isRefreshing || pullDistance === 0 ? 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'none'
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
            <div className="reel-perf-bar" style={{
                transform: `translateY(${isRefreshing ? 60 : pullDistance}px)`,
                transition: isRefreshing || pullDistance === 0 ? 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'none'
            }} />

            <main id="feed-scroller" className="page-top" style={{
                paddingBottom: IS_TOUCH ? 'calc(5rem + env(safe-area-inset-bottom))' : '3rem', paddingTop: IS_TOUCH ? '1rem' : '2rem',
                transform: `translateY(${isRefreshing ? 60 : pullDistance}px)`,
                transition: isRefreshing || pullDistance === 0 ? 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'none'
            }}>
                <div className="container feed-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: IS_TOUCH ? '2rem' : '3rem', alignItems: 'start', maxWidth: IS_TOUCH ? undefined : 720 }}>


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
                            <div className="bg-wireframe" style={{
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
                                    onClick={() => navigate('/discover')}
                                    style={{ padding: '0.65rem 1.8rem', letterSpacing: '0.15em', fontSize: '0.55rem' }}
                                >
                                    DISCOVER FILMS →
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
                                <div className="bg-wireframe" style={{
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
                            <Virtuoso
                                useWindowScroll
                                data={activeFeed}
                                overscan={600}
                                endReached={() => {
                                    if (feedTab === 'for-you' && hasNextCommunity && !isFetchingNextCommunity) fetchNextCommunity()
                                    else if (feedTab === 'following' && hasNextFollowing && !isFetchingNextFollowing) fetchNextFollowing()
                                }}
                                itemContent={(index, log: any) => (
                                    <div
                                        key={log.id + index}
                                        className="fade-in-up"
                                        style={{ animationDelay: `${Math.min(index * 0.04, 0.4)}s`, marginBottom: '0.5rem' } as any}
                                    >
                                        <ActivityCard log={log} />
                                    </div>
                                )}
                                components={{
                                    Footer: () => (feedTab === 'for-you' ? isFetchingNextCommunity : isFetchingNextFollowing) ? (
                                        <div className="skeleton" style={{ height: 140, borderRadius: '4px', opacity: 0.5, marginTop: '0.5rem' }} />
                                    ) : null,
                                }}
                            />
                        )}
                    </div>
                    </SectionErrorBoundary>


                </div>
            </main>
        </div>
    )
}
