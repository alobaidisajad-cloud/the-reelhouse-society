import { useState, useRef, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Star, Lock, Camera, Settings, Globe, Download, Share2, Film, LogOut, RotateCcw, X, ChevronRight, ChevronLeft, Archive, Bookmark, LayoutList, Ticket, LineChart, BookOpen, Disc } from 'lucide-react'
import { useAuthStore, useFilmStore, useUIStore, useProgrammeStore } from '../store'
import { ReelRating, SectionHeader, FilmCard } from '../components/UI'
import Buster from '../components/Buster'
import { tmdb } from '../tmdb'
import reelToast from '../utils/reelToast'

import exportLogsCSV from '../components/profile/exportLogsCSV'
import SocialModal from '../components/profile/SocialModal'
import ReviewModal from '../components/profile/ReviewModal'
import { CinemaDNACard } from '../components/profile/CinemaDNACard'
import { ShareCardOverlay } from '../components/profile/ShareCardOverlay'

import PageSEO from '../components/PageSEO'
import { ProfileHeader } from '../features/profile/components/ProfileHeader'
import { ProfileTabs } from '../features/profile/components/ProfileTabs'
import { ProfileContent } from '../features/profile/components/ProfileContent'

import { useViewport } from '../hooks/useViewport'



// ── MAIN PAGE ──
export default function UserProfilePage() {
    const { isTouch: IS_TOUCH } = useViewport()
    const navigate = useNavigate()
    const { username: routeUsername, tab } = useParams()
    const queryClient = useQueryClient()
    const { user: currentUser, isAuthenticated, updateUser, followUser, unfollowUser } = useAuthStore()
    const { logs: currentLogs, watchlist: currentWatchlist, lists: currentLists, stubs: currentStubs, physicalArchive, getCinephileStats } = useFilmStore()
    const { programmes: currentProgrammes } = useProgrammeStore()
    const { openLogModal } = useUIStore()
    const fileRef = useRef(null)
    const isOwnProfile = !routeUsername || routeUsername === currentUser?.username || routeUsername === 'me'

    // Fetch the profile from Supabase for other users' pages
    const { data: fetchedProfile, isLoading: profileLoading } = useQuery({
        queryKey: ['profile-by-username', routeUsername],
        queryFn: async () => {
            const { data } = await supabase
                .from('profiles')
                .select('id, username, role, bio, avatar_url, followers_count, following_count, is_social_private, preferences, created_at, tier, social_links')
                .eq('username', routeUsername)
                .single()
            if (!data) return null
            return {
                id: data.id,
                username: data.username,
                role: data.role || 'cinephile',
                bio: data.bio || '',
                avatar: data.avatar_url || 'smiling',
                avatar_url: data.avatar_url || null,
                followersCount: data.followers_count || 0,
                followingCount: data.following_count || 0,
                isSocialPrivate: data.is_social_private || false,
                socialVisibility: (data as any).preferences?.social_visibility || (data.is_social_private ? 'private' : 'public'),
                privacyEndorsements: (data as any).preferences?.privacy_endorsements || 'everyone',
                privacyAnnotations: (data as any).preferences?.privacy_annotations || 'everyone',
                preferences: data.preferences || {},
                createdAt: data.created_at,
                socialLinks: (data as any).social_links || {},
            }
        },
        enabled: !isOwnProfile && !!routeUsername,
        staleTime: 1000 * 60 * 5,
    })

    // Live counts for own profile — re-fetches every 30s so follower gain is visible immediately
    const { data: ownCounts } = useQuery({
        queryKey: ['own-profile-counts', currentUser?.id],
        queryFn: async () => {
            const { data } = await supabase
                .from('profiles')
                .select('followers_count, following_count')
                .eq('id', (currentUser as any)?.id)
                .single()
            return { followersCount: data?.followers_count || 0, followingCount: data?.following_count || 0 }
        },
        enabled: isOwnProfile && !!currentUser?.id,
        refetchInterval: 30000,  // refresh every 30s
        staleTime: 10000,
    })

    const profileUser = isOwnProfile ? currentUser : fetchedProfile

    const isFollowing = currentUser?.following?.includes(profileUser?.username)
    const isRequested = currentUser?.requested?.includes(profileUser?.username)
    const isPrivacyBlocked = !isOwnProfile && fetchedProfile?.isSocialPrivate && !isFollowing

    const { data: profileMetrics } = useQuery({
        queryKey: ['profile-metrics', profileUser?.id],
        queryFn: async () => {
             // Direct query instead of RPC — get_profile_metrics function doesn't exist
             const { data, error } = await supabase
                 .from('logs')
                 .select('rating')
                 .eq('user_id', profileUser?.id)
             if (error) throw error
             const total_logs = data?.length || 0
             const rated = (data || []).filter((l: any) => l.rating > 0)
             const avg_rating = rated.length > 0
                 ? rated.reduce((sum: number, l: any) => sum + l.rating, 0) / rated.length
                 : 0
             return { total_logs, avg_rating }
        },
        enabled: !!profileUser?.id,
        staleTime: 1000 * 60 * 5,
    })

    const activeTab = tab || null

    // Scroll to top when switching tabs — prevents landing mid-page
    useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }) }, [activeTab])
    const [showDNA, setShowDNA] = useState(false)
    const [sieve, setSieve] = useState('all')
    const [archiveSieve, setArchiveSieve] = useState('all')
    const [visibleLogCount, setVisibleLogCount] = useState(40)
    const [archiveVisibleCount, setArchiveVisibleCount] = useState(40)

    // Fetch other user's public logs from Supabase — properly paginated
    const targetUserId = isOwnProfile ? currentUser?.id : (fetchedProfile as any)?.id
    const { 
        data: infiniteLogsData,
        fetchNextPage: fetchNextLogs,
        hasNextPage: logsHasMore,
        isFetchingNextPage: isFetchingLogs
    } = useInfiniteQuery({
        queryKey: ['user-profile-logs', targetUserId],
        queryFn: async ({ pageParam = 0 }) => {
            if (!targetUserId) return []
            
            const pageSize = 50;
            const from = pageParam * pageSize;
            const to = from + pageSize - 1;

            const { data: allLogs, error } = await supabase
                .from('logs')
                .select('id, film_id, film_title, poster_path, year, rating, review, status, watched_date, watched_with, created_at, pull_quote, is_autopsied, autopsy, alt_poster, physical_media')
                .eq('user_id', targetUserId)
                .order('watched_date', { ascending: false })
                .range(from, to)
                
            if (error || !allLogs) return []
            return allLogs.map((l: any) => ({
                id: l.id,
                filmId: l.film_id,
                title: l.film_title,
                poster: l.poster_path,
                year: l.year,
                rating: l.rating,
                review: l.review,
                status: l.status || 'watched',
                watchedDate: l.watched_date,
                watchedWith: l.watched_with,
                createdAt: l.created_at,
                pullQuote: l.pull_quote || '',
                isAutopsied: l.is_autopsied || false,
                autopsy: l.autopsy || null,
                altPoster: l.alt_poster || null,
                physicalMedia: l.physical_media || null,
                privacyEndorsements: (fetchedProfile as any)?.privacyEndorsements || 'everyone',
                privacyAnnotations: (fetchedProfile as any)?.privacyAnnotations || 'everyone',
            }))
        },
        getNextPageParam: (lastPage, allPages) => lastPage.length === 50 ? allPages.length : undefined,
        enabled: !!targetUserId,
        staleTime: 1000 * 60 * 5,
    })

    const profileLogs = infiniteLogsData ? infiniteLogsData.pages.flat() : []

    // Fetch other user's lists (stacks) — single embedded query (no N+1)
    const { data: otherUserLists = [] } = useQuery({
        queryKey: ['user-profile-lists', routeUsername],
        queryFn: async () => {
            const { data: prof } = await supabase
                .from('profiles').select('id').eq('username', routeUsername).single()
            if (!prof) return []
            const { data: lists } = await supabase
                .from('lists')
                .select('*, list_items(film_id, film_title, poster_path)')
                .eq('user_id', prof.id)
                .eq('is_private', false)
                .order('created_at', { ascending: false })
            if (!lists) return []
            return lists.map((list: any) => ({
                id: list.id, title: list.title, description: list.description || '',
                isRanked: list.is_ranked || false, isPrivate: false,
                films: (list.list_items || []).map((item: any) => ({ id: item.film_id, title: item.film_title, poster_path: item.poster_path })),
                createdAt: list.created_at,
            }))
        },
        enabled: !isOwnProfile && !!routeUsername,
        staleTime: 1000 * 60 * 5,
    })

    // Fetch other user's watchlist
    const { data: otherUserWatchlist = [] } = useQuery({
        queryKey: ['user-profile-watchlist', routeUsername],
        queryFn: async () => {
            const { data: prof } = await supabase
                .from('profiles').select('id').eq('username', routeUsername).single()
            if (!prof) return []
            const { data } = await supabase
                .from('watchlists').select('*').eq('user_id', prof.id).order('created_at', { ascending: false })
            return (data || []).map((w: any) => ({ id: w.film_id, title: w.film_title, poster_path: w.poster_path || null, year: w.year || null }))
        },
        enabled: !isOwnProfile && !!routeUsername,
        staleTime: 1000 * 60 * 5,
    })

    // Fetch other user's programmes
    const { data: otherUserProgrammes = [] } = useQuery({
        queryKey: ['user-profile-programmes', routeUsername],
        queryFn: async () => {
            const { data: prof } = await supabase
                .from('profiles').select('id').eq('username', routeUsername).single()
            if (!prof) return []
            const { data } = await supabase
                .from('programmes').select('*').eq('user_id', prof.id).eq('is_public', true).order('created_at', { ascending: false }).limit(20)
            if (!data) return []
            return data.map((p) => ({
                id: p.id, title: p.title, description: p.description,
                films: p.films || [], isPublic: p.is_public, createdAt: p.created_at,
            }))
        },
        enabled: !isOwnProfile && !!routeUsername,
        staleTime: 1000 * 60 * 5,
    })

    const loadMoreRef = useRef(null)
    const [viewLog, setViewLog] = useState<any>(null)

    // Pull pagination tools from store
    const logsHasMore = useFilmStore(state => state.logsHasMore)
    const fetchLogs = useFilmStore(state => state.fetchLogs)
    const listsHasMore = useFilmStore(state => state.listsHasMore)
    const fetchLists = useFilmStore(state => state.fetchLists)


    const [followLoading, setFollowLoading] = useState(false)
    const [socialModal, setSocialModal] = useState<any>(null)
    const [socialLoading, setSocialLoading] = useState(false)

    // Progressive log rendering: reset on filter change, load more on scroll
    useEffect(() => { setVisibleLogCount(40) }, [sieve])
    useEffect(() => { setArchiveVisibleCount(40) }, [archiveSieve])
    useEffect(() => {
        const el = loadMoreRef.current
        if (!el) return
        const obs = new IntersectionObserver(([e]) => {
            if (e.isIntersecting) {
                setVisibleLogCount(c => c + 40)
                if (logsHasMore && !isFetchingLogs) {
                    fetchNextLogs()
                }
            }
        }, { rootMargin: '400px' })
        obs.observe(el)
        return () => obs.disconnect()
    }, [logsHasMore, isFetchingLogs, fetchNextLogs])

    const openSocialModal = async (type: string) => {
        if (isPrivacyBlocked) return
        setSocialLoading(true)
        setSocialModal({ title: type === 'followers' ? 'Followers' : 'Following', list: [] })
        try {
            const pUser: any = profileUser
            if (type === 'followers') {
                // Step 1: get IDs of people who follow this profile
                const { data: rows } = await supabase
                    .from('interactions')
                    .select('user_id')
                    .eq('target_user_id', pUser.id)
                    .eq('type', 'follow')
                    .limit(100)
                const ids = (rows || []).map((r: any) => r.user_id)
                if (ids.length > 0) {
                    const { data: profiles } = await supabase
                        .from('profiles')
                        .select('username, avatar_url, followers_count')
                        .in('id', ids)
                    setSocialModal({ title: 'Followers', list: profiles || [] })
                } else {
                    setSocialModal({ title: 'Followers', list: [] })
                }
            } else {
                // Step 1: get IDs of people this profile follows
                const { data: rows } = await supabase
                    .from('interactions')
                    .select('target_user_id')
                    .eq('user_id', pUser.id)
                    .eq('type', 'follow')
                    .limit(100)
                const ids = (rows || []).map((r: any) => r.target_user_id)
                if (ids.length > 0) {
                    const { data: profiles } = await supabase
                        .from('profiles')
                        .select('username, avatar_url, followers_count')
                        .in('id', ids)
                    setSocialModal({ title: 'Following', list: profiles || [] })
                } else {
                    setSocialModal({ title: 'Following', list: [] })
                }
            }
        } catch { setSocialModal((prev: any) => prev ? { ...prev, list: [] } : null) }
        finally { setSocialLoading(false) }
    }

    const handleFollow = async () => {
        if (!currentUser) { navigate('/join'); return }
        if (followLoading || isOwnProfile) return
        setFollowLoading(true)
        const pUser: any = profileUser
        try {
            if (isFollowing || isRequested) {
                await unfollowUser(pUser.username)
                queryClient.setQueryData(['profile-by-username', routeUsername], (old: any) =>
                    old ? { ...old, followersCount: Math.max(0, (old.followersCount || 1) - (isFollowing ? 1 : 0)) } : old
                )
                reelToast.success(isRequested ? `Cancelled request to @${pUser.username}` : `Unfollowed @${pUser.username}`)
            } else {
                await followUser(pUser.username)
                if (!fetchedProfile?.isSocialPrivate) {
                    queryClient.setQueryData(['profile-by-username', routeUsername], (old: any) =>
                        old ? { ...old, followersCount: (old.followersCount || 0) + 1 } : old
                    )
                }
                reelToast.success(fetchedProfile?.isSocialPrivate ? `Requested to follow @${pUser.username}` : `Now following @${pUser.username} ✨`)
            }
        } finally {
            setFollowLoading(false)
        }
    }

    const renderAvatar = (avatarValue: any, size = 90) => {
        if (!avatarValue || typeof avatarValue !== 'string') return <Buster size={size} mood="smiling" />
        if (avatarValue.startsWith('http') || avatarValue.startsWith('data:image/') || avatarValue.startsWith('blob:')) {
            return <img src={avatarValue} alt="User avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        }
        return <Buster size={size} mood={avatarValue} />
    }

    // profileLogs is already defined above from infinite query
    const profileStubs = isOwnProfile ? currentStubs : []
    const profileLists = isOwnProfile ? currentLists : otherUserLists
    const profileWatchlist = isOwnProfile ? currentWatchlist : otherUserWatchlist
    const profileProgrammes = isOwnProfile ? currentProgrammes : otherUserProgrammes
    const finalMetrics = profileMetrics || { total_logs: profileLogs.length, avg_rating: 0 }
    const cineStats = {
        count: finalMetrics.total_logs,
        level: finalMetrics.total_logs > 50 ? 'THE ORACLE' : finalMetrics.total_logs > 20 ? 'MIDNIGHT DEVOTEE' : finalMetrics.total_logs > 5 ? 'THE REGULAR' : 'FIRST REEL',
        color: finalMetrics.total_logs > 50 ? 'var(--sepia)' : finalMetrics.total_logs > 20 ? 'var(--blood-reel)' : 'var(--flicker)',
        progress: (finalMetrics.total_logs % 20) * 5,
    }
    const stats = isOwnProfile && getCinephileStats ? getCinephileStats(finalMetrics.total_logs) : cineStats



    // ── Daily Streak — consecutive days with ≥1 log ──
    const streak = useMemo(() => {
        const dates = new Set<string>()
        for (const log of profileLogs as any[]) {
            const d = log.watchedDate || log.createdAt
            if (d) dates.add(new Date(d).toISOString().slice(0, 10))
        }
        let count = 0
        const now = new Date()
        for (let i = 0; i < 365; i++) {
            const check = new Date(now)
            check.setDate(check.getDate() - i)
            const key = check.toISOString().slice(0, 10)
            if (dates.has(key)) count++
            else if (i === 0) continue // today doesn't break streak — allow logging later
            else break
        }
        return count
    }, [profileLogs])

    // Show a loading state while fetching another user's profile
    if (!isOwnProfile && profileLoading) return (
        <div style={{ paddingTop: 120, textAlign: 'center', padding: '6rem 1.5rem' }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.3em', color: 'var(--sepia)', animation: 'pulse 1.8s ease-in-out infinite' }}>✦ RETRIEVING DOSSIER ✦</div>
        </div>
    )

    if (!profileUser) return (
        <div style={{ paddingTop: 120, textAlign: 'center', padding: '6rem 1.5rem' }}>
            <Buster size={120} mood="crying" message="This member doesn't exist yet, or it's been removed." />
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--parchment)', marginTop: '1.5rem' }}>Member Not Found</h2>
            <Link to="/" className="btn btn-ghost" style={{ marginTop: '2rem' }}>Return to Lobby</Link>
        </div>
    )

    if (!isAuthenticated && isOwnProfile) return (
        <div style={{ paddingTop: 120, textAlign: 'center', padding: '6rem 1.5rem' }}>
            <Buster size={120} mood="peeking" message="Who goes there? Sign in to see your profile." />
            <div style={{ marginTop: '2rem' }}><button className="btn btn-primary" onClick={() => navigate('/join')}>Enter The House</button></div>
        </div>
    )

    const renderPrivacyGate = () => (
        <div style={{ paddingTop: 60, textAlign: 'center', padding: '4rem 1.5rem', maxWidth: 500, margin: '0 auto' }}>
            <Lock size={48} color="var(--sepia)" style={{ marginBottom: '1rem', opacity: 0.6 }} />
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--parchment)', marginBottom: '0.75rem' }}>
                This account is private.
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--bone)', opacity: 0.7, lineHeight: 1.6, marginBottom: '1.5rem' }}>
                Follow to see their logs, lists, and watchlists.
            </div>
        </div>
    )


    // Ledger: only logs with a rating or review (detailed entries), filtered by stars
    const filteredLogs = profileLogs.filter(log => {
        const hasPoster = (typeof log.poster === 'string' && log.poster.length > 5) || (typeof log.altPoster === 'string' && log.altPoster.length > 5)
        if (!hasPoster) return false
        // Ledger only shows rated/reviewed logs
        if (log.rating === 0 && (!log.review || log.review.length === 0)) return false
        if (sieve === 'all') return true
        if (sieve === '1') return Math.round(log.rating) === 1
        if (sieve === '2') return Math.round(log.rating) === 2
        if (sieve === '3') return Math.round(log.rating) === 3
        if (sieve === '4') return Math.round(log.rating) === 4
        if (sieve === '5') return Math.round(log.rating) === 5
        return true
    })

    // Archive: ALL logs regardless of rating, filtered by status
    const archiveFilteredLogs = profileLogs.filter(log => {
        const hasPoster = (typeof log.poster === 'string' && log.poster.length > 5) || (typeof log.altPoster === 'string' && log.altPoster.length > 5)
        if (!hasPoster) return false
        if (archiveSieve === 'all') return true
        if (archiveSieve === 'watched') return log.status === 'watched'
        if (archiveSieve === 'rewatched') return log.status === 'rewatched'
        if (archiveSieve === 'abandoned') return log.status === 'abandoned'
        return true
    })


    const isPremium = currentUser?.role === 'archivist' || currentUser?.role === 'auteur'
    const isArchivistPlus = ['archivist', 'auteur'].includes((profileUser as any)?.role || '')

    const TABS = [
        { id: 'diary', label: 'The Ledger', count: finalMetrics.total_logs },
        { id: 'passport', label: 'Passport', count: null },
        { id: 'projector', label: 'Projector Room', count: null },
        { id: 'lists', label: 'Lists', count: profileLists.length },
        { id: 'watchlist', label: 'Watchlist', count: profileWatchlist.length },
        { id: 'physical', label: isArchivistPlus ? 'Physical Archive' : <><Lock size={10} style={{ display: "inline-block", verticalAlign: "middle" }} /> Physical Archive</>, count: isArchivistPlus ? (physicalArchive.length > 0 ? physicalArchive.length : null) : 'LOCKED' },
        { id: 'archive', label: 'The Archive', count: finalMetrics.total_logs > 0 ? finalMetrics.total_logs : null },
        ...(isOwnProfile ? [{ id: 'calendar', label: isPremium ? '✦ The Calendar' : <><Lock size={10} style={{ display: "inline-block", verticalAlign: "middle" }} /> The Calendar</>, count: null }] : []),
    ]

    return (
        <div className={`page-top ${stats.count > 50 ? 'level-obsessed' : stats.count > 10 ? 'level-degrade' : ''}`} style={{ minHeight: '100dvh' }}>
            {/* Header */}
            <ProfileHeader
                profileUser={profileUser}
                currentUser={currentUser}
                isOwnProfile={isOwnProfile}
                activeTab={activeTab}
                stats={stats}
                ownCounts={ownCounts}
                profileLogs={profileLogs}
                profileWatchlist={profileWatchlist}
                isArchivistPlus={isArchivistPlus}
                isFollowing={isFollowing}
                isRequested={isRequested}
                isSocialPrivate={fetchedProfile?.isSocialPrivate}
                isPrivacyBlocked={isPrivacyBlocked}
                followLoading={followLoading}
                handleFollow={handleFollow}
                openSocialModal={openSocialModal}
            />

            {isPrivacyBlocked ? renderPrivacyGate() : (
                <>
                    {!activeTab && (
                        <ProfileTabs
                            profileUser={profileUser}
                            profileLogs={profileLogs}
                            profileWatchlist={profileWatchlist}
                            profileLists={profileLists}
                            physicalArchive={physicalArchive}
                            isArchivistPlus={isArchivistPlus}
                        />
                    )}

                    {/* Tab Content */}
                    {activeTab && (
                        <ProfileContent
                            activeTab={activeTab}
                            profileUser={profileUser}
                            profileLogs={profileLogs}
                            profileWatchlist={profileWatchlist}
                            profileLists={profileLists}
                            physicalArchive={physicalArchive}
                            profileProgrammes={profileProgrammes}
                            isOwnProfile={isOwnProfile}
                            isPremium={isPremium}
                            finalMetrics={finalMetrics}
                            cineStats={cineStats}
                            logsHasMore={logsHasMore}
                            listsHasMore={listsHasMore}
                            archiveSieve={archiveSieve}
                            archiveVisibleCount={archiveVisibleCount}
                            archiveFilteredLogs={archiveFilteredLogs}
                            currentLogs={currentLogs}
                            currentWatchlist={currentWatchlist}
                            setViewLog={setViewLog}
                            fetchLogs={fetchLogs}
                            fetchLists={fetchLists}
                            setArchiveSieve={setArchiveSieve}
                            setArchiveVisibleCount={setArchiveVisibleCount}
                            setShowDNA={setShowDNA}
                        />
                    )}
                </>
            )}

            <SocialModal socialModal={socialModal} socialLoading={socialLoading} onClose={() => setSocialModal(null)} />

            <ShareCardOverlay log={shareLog} user={profileUser} onClose={() => setShareLog(null)} />
            {showDNA && <CinemaDNACard logs={profileLogs} user={profileUser} onClose={() => setShowDNA(false)} />}

            <ReviewModal
                viewLog={viewLog}
                profileUser={profileUser}
                isOwnProfile={isOwnProfile}
                routeUsername={routeUsername || ''}
                onClose={() => setViewLog(null)}
                onEdit={(log: any) => {
                    setViewLog(null)
                    openLogModal({ id: log.filmId, title: log.title, poster_path: log.poster, release_date: log.year + '-01-01' }, log.id)
                }}
                onDelete={(logId: string) => {
                    setViewLog(null)
                    useFilmStore.getState().removeLog(logId)
                }}
            />
        </div>
    )
}

