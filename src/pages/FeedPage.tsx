import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useAuthStore, useUIStore } from '../store'
import { SectionHeader } from '../components/UI'
import { supabase, isSupabaseConfigured } from '../supabaseClient'
import { Info } from 'lucide-react'

// ── Extracted Components ──
import ActivityCard from '../components/feed/ActivityCard'
import RatingLegend from '../components/feed/RatingLegend'
import SectionErrorBoundary from '../components/SectionErrorBoundary'
import WeeklyChallenge from '../components/profile/WeeklyChallenge'
import PageSEO from '../components/PageSEO'

const IS_TOUCH = typeof window !== 'undefined' && window.matchMedia('(any-pointer: coarse)').matches

// ── Helper: map raw log rows to feed entries ──
function mapLogsToFeed(data: any[], usernameMap: Record<string, any>) {
    const mapped = (data || []).map(l => ({
        ...l,
        profiles: usernameMap[l.user_id] || { username: 'anonymous', role: 'cinephile' },
    })).map(l => ({
        id: l.id,
        user: l.profiles?.username || 'anonymous',
        userRole: l.profiles?.role || 'cinephile',
        privacyEndorsements: l.profiles?.preferences?.privacy_endorsements || 'everyone',
        privacyAnnotations: l.profiles?.preferences?.privacy_annotations || 'everyone',
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
    }))
    // Deduplicate: one card per user+film
    const seen = new Set()
    return mapped.filter((entry: any) => {
        const key = `${entry.user}:${entry.film.id}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

// ── FEED PAGE ──
export default function FeedPage() {
    const isAuthenticated = useAuthStore(state => state.isAuthenticated)
    const user = useAuthStore(state => state.user)
    const openSignupModal = useUIStore(state => state.openSignupModal)
    const openLogModal = useUIStore(state => state.openLogModal)

    // ── Feed Tab State ──
    type FeedTab = 'for-you' | 'following'
    const [feedTab, setFeedTab] = useState<FeedTab>('for-you')

    // ── Feed Data ──
    const [showLegend, setShowLegend] = useState(false)
    const [recentLists, setRecentLists] = useState<any[]>([])
    const tabBarRef = useRef<HTMLDivElement>(null)

    // ── Fetch Helper ──
    const fetchFeed = async ({ pageParam = 0 }, mode: 'for-you' | 'following') => {
        if (!isSupabaseConfigured) return []
        if (mode === 'following' && (!user || !user.following?.length)) return []

        let query = supabase
            .from('logs')
            .select('id, user_id, film_id, film_title, poster_path, year, rating, review, status, watched_date, is_spoiler, pull_quote, drop_cap, alt_poster, editorial_header, is_autopsied, autopsy, created_at')
            .order('created_at', { ascending: false })
            .range(pageParam * 20, (pageParam + 1) * 20 - 1)

        if (mode === 'following') {
            const followingArr = user?.following || []
            const { data: followedProfiles } = await supabase.from('profiles').select('id').in('username', followingArr)
            if (!followedProfiles?.length) return []
            query = query.in('user_id', followedProfiles.map((p: any) => p.id))
        }

        const { data, error } = await query
        if (error || !data?.length) return []

        const userIds = [...new Set(data.map((l: any) => l.user_id).filter(Boolean))]
        let usernameMap: Record<string, any> = {}
        if (userIds.length > 0) {
            const { data: profilesData } = await supabase.from('profiles').select('id, username, role, preferences').in('id', userIds)
            if (profilesData) usernameMap = Object.fromEntries(profilesData.map((p: any) => [p.id, p]))
        }
        
        return mapLogsToFeed(data, usernameMap)
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
        getNextPageParam: (lastPage, pages) => lastPage.length === 20 ? pages.length : undefined
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
        getNextPageParam: (lastPage, pages) => lastPage.length === 20 ? pages.length : undefined
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
    const communityFeed = communityData?.pages.flat() || []
    const followingFeed = followingData?.pages.flat() || []
    const activeFeed = feedTab === 'following' ? followingFeed : communityFeed
    const isLoading = feedTab === 'following' ? followingLoading : feedLoading

    return (
        <div style={{ paddingTop: 70, minHeight: '100dvh', background: 'var(--ink)' }}>
            <PageSEO title="The Feed" description="Community dispatches and global curation from The ReelHouse Society." />
            {/* ── REFINED HEADER ── */}
            <div style={{
                background: 'var(--ink)',
                borderBottom: 'none',
                padding: IS_TOUCH ? '1.5rem 0 0' : '3rem 0 0',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', height: '100%', background: 'radial-gradient(ellipse at top, rgba(139,105,20,0.06) 0%, transparent 60%)', pointerEvents: 'none' }} />
                <div className="container" style={{ position: 'relative', zIndex: 1, maxWidth: 800, textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.4em', color: 'var(--sepia)', marginBottom: '0.75rem', opacity: 0.8 }}>
                        ✦ THE REELHOUSE SOCIETY ✦
                    </div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? 'clamp(1.6rem, 5vw, 2.2rem)' : 'clamp(2.2rem, 5vw, 3.5rem)', color: 'var(--parchment)', marginBottom: '0.5rem', lineHeight: 1, textShadow: '0 8px 25px rgba(0,0,0,0.6)' }}>
                        The Reel
                    </h1>
                    <p style={{ fontFamily: 'var(--font-sub)', fontSize: '0.95rem', color: 'var(--fog)', maxWidth: 500, margin: '0 auto', opacity: 0.7 }}>
                        Dispatches from the society's finest critics.
                    </p>
                </div>

                {/* ── STICKY TAB BAR — Following / For You ── */}
                <div
                    ref={tabBarRef}
                    style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: 0,
                        marginTop: IS_TOUCH ? '1rem' : '1.5rem',
                        position: 'sticky',
                        top: IS_TOUCH ? 56 : 64,
                        zIndex: 100,
                        background: 'rgba(8,6,4,0.95)',
                        backdropFilter: 'blur(8px)',
                        borderBottom: '1px solid rgba(139,105,20,0.15)',
                    }}
                >
                    <button
                        onClick={() => setFeedTab('for-you')}
                        style={{
                            flex: 1,
                            maxWidth: 240,
                            padding: '1rem 1.5rem',
                            background: 'none',
                            border: 'none',
                            borderBottom: feedTab === 'for-you' ? '2px solid var(--sepia)' : '2px solid transparent',
                            fontFamily: 'var(--font-ui)',
                            fontSize: '0.6rem',
                            letterSpacing: '0.2em',
                            color: feedTab === 'for-you' ? 'var(--parchment)' : 'var(--fog)',
                            cursor: 'pointer',
                            transition: 'color 0.2s, border-color 0.3s',
                            fontWeight: feedTab === 'for-you' ? 700 : 400,
                        }}
                    >
                        MAIN REEL
                    </button>
                    {isAuthenticated && (
                        <button
                            onClick={() => setFeedTab('following')}
                            style={{
                                flex: 1,
                                maxWidth: 240,
                                padding: '1rem 1.5rem',
                                background: 'none',
                                border: 'none',
                                borderBottom: feedTab === 'following' ? '2px solid var(--sepia)' : '2px solid transparent',
                                fontFamily: 'var(--font-ui)',
                                fontSize: '0.6rem',
                                letterSpacing: '0.2em',
                                color: feedTab === 'following' ? 'var(--parchment)' : 'var(--fog)',
                                cursor: 'pointer',
                                transition: 'color 0.2s, border-color 0.3s',
                                fontWeight: feedTab === 'following' ? 700 : 400,
                            }}
                        >
                            FOLLOWING
                        </button>
                    )}
                </div>
            </div>

            {/* ── GOLD GRADIENT DIVIDER ── */}
            <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(139,105,20,0.3), transparent)' }} />

            <main className="page-top" style={{ paddingBottom: '7rem', paddingTop: IS_TOUCH ? '1.5rem' : '2rem' }}>
                <div className="container feed-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: '3rem', alignItems: 'start' }}>

                    {/* Main Feed */}
                    <SectionErrorBoundary label="COMMUNITY FEED">
                    <div className="feed-main">

                        {/* Section Header + Rating Legend Toggle */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                            <SectionHeader label={feedTab === 'following' ? 'FOLLOWING DISPATCHES' : 'ALL TRANSMISSIONS'} title="The Log" />
                            <button
                                onClick={() => setShowLegend(!showLegend)}
                                style={{
                                    background: 'none', border: '1px solid rgba(139,105,20,0.2)',
                                    borderRadius: '3px', padding: '0.3rem 0.6rem',
                                    fontFamily: 'var(--font-ui)', fontSize: '0.45rem',
                                    letterSpacing: '0.12em', color: 'var(--fog)',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                                    gap: '0.3rem', transition: 'border-color 0.2s',
                                    flexShrink: 0,
                                }}
                                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--sepia)'}
                                onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(139,105,20,0.2)'}
                            >
                                <Info size={10} /> RATING GUIDE
                            </button>
                        </div>
                        {showLegend && <RatingLegend />}

                        {/* Sign-up CTA for non-authenticated users */}
                        {!isAuthenticated && (
                            <div style={{
                                background: 'transparent', border: '1px dashed var(--ash)',
                                padding: '2rem', textAlign: 'center',
                                marginBottom: '2rem', borderRadius: '2px',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem'
                            }}>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--sepia)' }}>
                                    The Archives Are Closed
                                </div>
                                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--bone)', maxWidth: 400, lineHeight: 1.5 }}>
                                    Ascend to The Society to trace the footsteps of the finest critics and transmit your own cinematic intelligence.
                                </div>
                                <button className="btn btn-primary" style={{ padding: '1rem 3rem', letterSpacing: '0.2em' }} onClick={() => openSignupModal()}>
                                    CLAIM YOUR SEAT
                                </button>
                            </div>
                        )}

                        {/* Following tab — empty state when not following anyone */}
                        {feedTab === 'following' && isAuthenticated && !isLoading && activeFeed.length === 0 && (
                            <div style={{
                                border: '1px solid var(--ash)',
                                padding: '3rem 2rem',
                                textAlign: 'center',
                                background: 'linear-gradient(180deg, rgba(28,23,16,0.4) 0%, transparent 100%)',
                                position: 'relative',
                                overflow: 'hidden',
                                marginBottom: '1.5rem',
                            }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, var(--sepia), transparent)' }} />
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.35em', color: 'var(--sepia)', marginBottom: '1rem' }}>
                                    SIGNAL QUIET
                                </div>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '0.75rem' }}>
                                    No transmissions yet.
                                </div>
                                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--bone)', opacity: 0.6, lineHeight: 1.6, maxWidth: 400, margin: '0 auto 1.5rem' }}>
                                    {(user?.following?.length || 0) === 0
                                        ? 'Follow other members of The Society to see their dispatches here.'
                                        : 'The people you follow haven\'t logged anything yet. Check the For You tab for community transmissions.'}
                                </p>
                                <button
                                    className="btn btn-ghost"
                                    onClick={() => setFeedTab('for-you')}
                                    style={{ padding: '0.7rem 2rem', letterSpacing: '0.15em', fontSize: '0.6rem' }}
                                >
                                    BROWSE MAIN REEL →
                                </button>
                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, var(--sepia), transparent)' }} />
                            </div>
                        )}

                        {/* Loading Skeleton */}
                        {isLoading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <div key={i} className="skeleton" style={{ height: 140, borderRadius: '2px' }} />
                                ))}
                            </div>
                        ) : activeFeed.length === 0 && feedTab === 'for-you' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                {/* Premium empty state */}
                                <div style={{
                                    border: '1px solid var(--ash)',
                                    padding: '3rem 2rem',
                                    textAlign: 'center',
                                    background: 'linear-gradient(180deg, rgba(28,23,16,0.6) 0%, transparent 100%)',
                                    position: 'relative',
                                    overflow: 'hidden',
                                }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, var(--sepia), transparent)' }} />
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.35em', color: 'var(--sepia)', marginBottom: '1rem' }}>
                                        PROJECTION BOOTH — STANDING BY
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '1rem' }}>
                                        The ink is fresh.
                                    </div>
                                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '1rem', color: 'var(--bone)', opacity: 0.6, lineHeight: 1.7, maxWidth: 400, margin: '0 auto 2rem' }}>
                                        Be the first to transmit a cinematic dispatch and leave your mark in the Society's permanent record.
                                    </p>
                                    <button
                                        className="btn btn-primary"
                                        style={{ padding: '0.9rem 2.5rem', letterSpacing: '0.2em', fontSize: '0.7rem' }}
                                        onClick={() => openLogModal()}
                                    >
                                        LOG THE FIRST FILM
                                    </button>
                                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, var(--sepia), transparent)' }} />
                                </div>

                                {/* Society Picks — Dynamic Live Top Logs */}
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.3em', color: 'var(--ash)', textAlign: 'center', opacity: 0.5 }}>
                                    ✦ SOCIETY PICKS — TONIGHT'S RECOMMENDED VIEWING ✦
                                </div>
                                {societyPicks.length > 0 ? societyPicks.map((pick: any) => (
                                    <Link key={pick.film_id} to={`/film/${pick.film_id}`} style={{ textDecoration: 'none' }}>
                                        <div style={{
                                            background: 'var(--soot)', border: '1px solid var(--ash)',
                                            borderLeft: '3px solid var(--ash)', borderRadius: '2px',
                                            padding: '1.25rem', display: 'flex', gap: '1.25rem',
                                            opacity: 0.8, transition: 'border-color 0.2s, opacity 0.2s',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--sepia)'; e.currentTarget.style.opacity = '1' }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--ash)'; e.currentTarget.style.opacity = '0.8' }}>
                                            <div style={{ width: 56, height: 84, background: 'var(--ink)', border: '1px solid var(--ash)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '2px' }}>
                                                <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--sepia)' }}>✦</span>
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--sepia)', marginBottom: '0.25rem' }}>COMMUNITY HIGHLIGHT · {pick.year || 'N/A'}</div>
                                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--parchment)', marginBottom: '0.5rem' }}>{pick.film_title}</div>
                                                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--bone)', fontStyle: 'italic', opacity: 0.7, WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>"{pick.review}"</div>
                                            </div>
                                        </div>
                                    </Link>
                                )) : (
                                    <div style={{ padding: '1rem', textAlign: 'center', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--ash)' }}>
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
                                            style={{ animationDelay: `${Math.min(i * 0.04, 0.4)}s` }}
                                        >
                                            <ActivityCard log={log} />
                                        </div>
                                    )
                                })}
                                {(feedTab === 'for-you' ? isFetchingNextCommunity : isFetchingNextFollowing) && (
                                    <div className="skeleton" style={{ height: 140, borderRadius: '2px', opacity: 0.5, marginTop: '0.5rem' }} />
                                )}
                            </div>
                        )}
                    </div>
                    </SectionErrorBoundary>

                    {/* Sidebar */}
                    <SectionErrorBoundary label="SIDEBAR">
                    <div className="feed-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                        {/* E2: Weekly Film Challenge */}
                        <WeeklyChallenge logs={communityFeed} />


                        {/* Curated Lists — Real Supabase data */}
                        <div>
                            <div className="section-title" style={{ borderBottom: '1px solid var(--ash)', paddingBottom: '0.5rem' }}>
                                CURATED LISTS
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {recentLists.length === 0 ? (
                                    <>
                                        {[
                                            { title: 'Essential Noir', curator: 'THE ARCHIVIST' },
                                            { title: 'Arthouse Manifesto', curator: 'THE ORACLE' },
                                        ].map(ph => (
                                            <Link key={ph.title} to="/lists" style={{ textDecoration: 'none' }}>
                                                <div style={{ padding: '0.75rem', background: 'var(--ink)', border: '1px solid var(--ash)', opacity: 0.5, cursor: 'pointer', transition: 'opacity 0.2s' }} onMouseEnter={e => e.currentTarget.style.opacity = '0.8'} onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}>
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
                                        <div style={{ padding: '0.75rem', background: 'var(--ink)', border: '1px solid var(--ash)', cursor: 'pointer', transition: 'border-color 0.2s' }} onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--sepia)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--ash)'}>
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
                </div>
            </main>
        </div>
    )
}
