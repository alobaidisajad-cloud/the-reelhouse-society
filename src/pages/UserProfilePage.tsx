import { useState, useRef, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Star, Lock, Camera, Settings, Globe, Download, Share2, Film, LogOut, RotateCcw, X, ChevronRight, ChevronLeft, Archive, Bookmark, LayoutList, Ticket, LineChart, BookOpen } from 'lucide-react'
import { useAuthStore, useFilmStore, useUIStore, useProgrammeStore } from '../store'
import { ReelRating, SectionHeader, FilmCard } from '../components/UI'
import Buster from '../components/Buster'
import { tmdb } from '../tmdb'
import toast from 'react-hot-toast'

import { ShareCardOverlay } from '../components/profile/ShareCardOverlay'
import { CinemaDNACard } from '../components/profile/CinemaDNACard'
import { WatchlistRoulette } from '../components/profile/WatchlistRoulette'
import { TasteDNA } from '../components/profile/TasteDNA'
import { NoirPassport } from '../components/profile/NoirPassport'
import { ProjectorRoom } from '../components/profile/ProjectorRoom'
import { TicketBooth } from '../components/profile/TicketBooth'
import { ProgrammesSection } from '../components/profile/ProgrammesSection'
import { ProjectionistCalendar } from '../components/profile/ProjectionistCalendar'
import { ProfileBackdrop, FilmLogRow, LazyLogRow, VaultSection, ListsSection } from '../components/profile/LedgerHelpers'
import exportLogsCSV from '../components/profile/exportLogsCSV'
import SocialModal from '../components/profile/SocialModal'
import ReviewModal from '../components/profile/ReviewModal'
import Achievements from '../components/profile/Achievements'
import TasteMatch from '../components/profile/TasteMatch'
import FilmRecommendations from '../components/profile/FilmRecommendations'
import CinematicInsights from '../components/profile/CinematicInsights'
import PhysicalArchiveTab from '../components/profile/PhysicalArchiveTab'
import { VaultLedgerTab } from '../components/profile/VaultLedgerTab'
import { VaultArchiveTab, VaultWatchlistTab } from '../components/profile/VaultArchiveTab'
import { ProfileProjectorTab } from '../components/profile/ProfileProjectorTab'
import { ProfileTriptych } from '../components/profile/ProfileTriptych'
import PageSEO from '../components/PageSEO'
import Poster from '../components/film/Poster'

import { useViewport } from '../hooks/useViewport'



// ── MAIN PAGE ──
export default function UserProfilePage() {
    const { isTouch: IS_TOUCH } = useViewport()
    const navigate = useNavigate()
    const { username: routeUsername, tab } = useParams()
    const queryClient = useQueryClient()
    const { user: currentUser, isAuthenticated, updateUser } = useAuthStore()
    const { logs: currentLogs, watchlist: currentWatchlist, lists: currentLists, stubs: currentStubs, physicalArchive, getCinephileStats } = useFilmStore()
    const { programmes: currentProgrammes } = useProgrammeStore()
    const { openSignupModal, openLogModal } = useUIStore()
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

    // ── Privacy Enforcement ──
    const currentFollowing = currentUser?.following || []
    const profileVisibility = (fetchedProfile as any)?.socialVisibility || 'public'
    const isFollower = profileUser?.username ? currentFollowing.includes(profileUser.username) : false
    const isPrivacyBlocked = !isOwnProfile && (
        (profileVisibility === 'followers' && !isFollower) ||
        (profileVisibility === 'private')
    )

    const { data: profileMetrics } = useQuery({
        queryKey: ['profile-metrics', profileUser?.id],
        queryFn: async () => {
             const { data, error } = await supabase.rpc('get_profile_metrics', { uid: profileUser?.id })
             if (error) throw error
             return data
        },
        enabled: !!profileUser?.id,
        staleTime: 1000 * 60 * 5,
    })

    const activeTab = tab || null
    const [shareLog, setShareLog] = useState(null)
    const [showDNA, setShowDNA] = useState(false)
    const [sieve, setSieve] = useState('all')
    const [archiveSieve, setArchiveSieve] = useState('all')
    const [visibleLogCount, setVisibleLogCount] = useState(40)
    const [archiveVisibleCount, setArchiveVisibleCount] = useState(40)

    // Fetch other user's public logs from Supabase with Server-Side Pagination & Filtering
    const { data: otherUserLogs = [] } = useQuery({
        queryKey: ['user-profile-logs', routeUsername, activeTab, sieve, archiveSieve, visibleLogCount, archiveVisibleCount],
        queryFn: async () => {
            const { data: prof } = await supabase
                .from('profiles').select('id').eq('username', routeUsername).single()
            if (!prof) return []
            
            let q = supabase
                .from('logs')
                .select('id, film_id, film_title, poster_path, year, rating, review, status, watched_date, watched_with, created_at, pull_quote, is_autopsied, autopsy, alt_poster, physical_media')
                .eq('user_id', prof.id)
                .order('created_at', { ascending: false })

            if (activeTab === 'diary' && sieve !== 'all') q = q.gte('rating', Number(sieve) - 0.5).lte('rating', Number(sieve) + 0.49)
            if (activeTab === 'archive' && archiveSieve !== 'all') q = q.eq('status', archiveSieve)
            
            q = q.limit(activeTab === 'archive' ? archiveVisibleCount : visibleLogCount)
            
            const { data } = await q
            return (data || []).map((l: any) => ({
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
        enabled: !isOwnProfile && !!routeUsername,
        staleTime: 1000 * 60 * 5, // Keep cached so tabs switch instantly
    })
// REMOVED IN FAVOR OF LINE 121 REPLACEMENT
    const loadMoreRef = useRef(null)
    const [viewLog, setViewLog] = useState<any>(null)

    const isFollowing = currentUser?.following?.includes(profileUser?.username)
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
            if (e.isIntersecting) setVisibleLogCount(c => c + 40)
        }, { rootMargin: '400px' })
        obs.observe(el)
        return () => obs.disconnect()
    }, [visibleLogCount])

    const openSocialModal = async (type: string) => {
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
        if (!currentUser) { openSignupModal(); return }
        if (followLoading || isOwnProfile) return
        setFollowLoading(true)
        const pUser: any = profileUser
        try {
            if (isFollowing) {
                // Update local state FIRST so UI responds immediately
                updateUser({ following: (currentUser.following || []).filter(u => u !== pUser.username) })
                queryClient.setQueryData(['profile-by-username', routeUsername], (old: any) =>
                    old ? { ...old, followersCount: Math.max(0, (old.followersCount || 1) - 1) } : old
                )
                toast.success(`Unfollowed @${pUser.username}`)
                // DB: remove follow interaction (trigger handles count update)
                await supabase.from('interactions').delete()
                    .eq('user_id', currentUser.id)
                    .eq('target_user_id', pUser.id)
                    .eq('type', 'follow')
            } else {
                // Update local state FIRST so UI responds immediately
                updateUser({ following: [...(currentUser.following || []), pUser.username] })
                queryClient.setQueryData(['profile-by-username', routeUsername], (old: any) =>
                    old ? { ...old, followersCount: (old.followersCount || 0) + 1 } : old
                )
                toast.success(`Now following @${pUser.username} ✦`)
                // DB: insert follow interaction (trigger handles count update)
                await supabase.from('interactions').insert({
                    user_id: currentUser.id,
                    target_user_id: pUser.id,
                    type: 'follow'
                })
                // DB Trigger automatically dispatches the follow notification globally.
            }
        } catch {
            toast.error('Something went wrong.')
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

    const profileLogs = isOwnProfile ? currentLogs : otherUserLogs
    const profileStubs = isOwnProfile ? currentStubs : []
    const profileLists = isOwnProfile ? currentLists : []
    const profileWatchlist = isOwnProfile ? currentWatchlist : []
    
    // Fallback if RPC hasn't loaded:
    const finalMetrics = profileMetrics || { total_logs: profileLogs.length, avg_rating: 0 }
    const cineStats = {
        count: finalMetrics.total_logs,
        level: finalMetrics.total_logs > 50 ? 'THE ORACLE' : finalMetrics.total_logs > 20 ? 'MIDNIGHT DEVOTEE' : finalMetrics.total_logs > 5 ? 'THE REGULAR' : 'FIRST REEL',
        color: finalMetrics.total_logs > 50 ? 'var(--sepia)' : finalMetrics.total_logs > 20 ? 'var(--blood-reel)' : 'var(--flicker)',
        progress: (finalMetrics.total_logs % 20) * 5,
    }
    const stats = isOwnProfile && getCinephileStats ? getCinephileStats() : cineStats



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
            <div style={{ marginTop: '2rem' }}><button className="btn btn-primary" onClick={() => openSignupModal()}>Enter The House</button></div>
        </div>
    )

    // ── Privacy Gate — block non-followers if profile is restricted ──
    if (isPrivacyBlocked && profileUser) return (
        <div style={{ paddingTop: 120, textAlign: 'center', padding: '6rem 1.5rem', maxWidth: 500, margin: '0 auto' }}>
            <Lock size={48} color="var(--sepia)" style={{ marginBottom: '1rem', opacity: 0.6 }} />
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--parchment)', marginBottom: '0.75rem' }}>
                @{profileUser.username?.toUpperCase()}
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--bone)', opacity: 0.7, lineHeight: 1.6, marginBottom: '1.5rem' }}>
                {profileVisibility === 'private'
                    ? 'This profile is private. Only the owner can view their activity.'
                    : 'This profile is visible to followers only. Follow to see their activity.'}
            </div>
            {profileVisibility === 'followers' && isAuthenticated && (
                <button
                    className="btn btn-primary"
                    onClick={handleFollow}
                    style={{ padding: '0.75rem 2rem', fontSize: '0.7rem', letterSpacing: '0.15em' }}
                >
                    FOLLOW TO VIEW
                </button>
            )}
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

    const TABS = [
        { id: 'diary', label: 'The Ledger', count: isOwnProfile ? filteredLogs.length : profileLogs.filter((l: any) => l.rating > 0 || (l.review && l.review.length > 0)).length },
        { id: 'passport', label: 'Passport', count: null },
        { id: 'projector', label: 'Projector Room', count: null },
        { id: 'lists', label: 'Lists', count: profileLists.length },
        { id: 'watchlist', label: 'Watchlist', count: profileWatchlist.length },
        { id: 'tickets', label: 'Ticket Stubs', count: profileStubs.length > 0 ? profileStubs.length : null },
        { id: 'archive', label: 'The Archive', count: physicalArchive.length > 0 ? physicalArchive.length : null },
        ...(isOwnProfile ? [{ id: 'calendar', label: isPremium ? '✦ The Calendar' : <><Lock size={10} style={{ display: "inline-block", verticalAlign: "middle" }} /> The Calendar</>, count: null }] : []),
    ]

    return (
        <div className={`page-top ${stats.count > 50 ? 'level-obsessed' : stats.count > 10 ? 'level-degrade' : ''}`} style={{ minHeight: '100dvh' }}>
            {/* Header */}
            {!activeTab ? (
                <div style={{ borderBottom: '1px solid rgba(139,105,20,0.15)', background: 'linear-gradient(180deg, rgba(15,10,5,1) 0%, var(--ink) 100%)', padding: IS_TOUCH ? '2rem 0 1.5rem' : '4.5rem 0 3rem', position: 'relative', overflow: 'hidden' }}>
                
                {/* Atmospheric projector spotlight */}
                <div style={{ position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)', width: '80%', height: '120%', background: 'radial-gradient(ellipse at top, rgba(139,105,20,0.18) 0%, rgba(139,105,20,0.05) 35%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />
                
                {/* Film grain texture */}
                <div style={{ position: 'absolute', inset: 0, opacity: 0.03, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")', backgroundSize: '128px 128px', pointerEvents: 'none', zIndex: 0 }} />
                
                {/* Bottom gold edge */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent 10%, rgba(139,105,20,0.35) 50%, transparent 90%)', pointerEvents: 'none', zIndex: 0 }} />
                
                {/* Auteur backdrop or dark base */}
                {profileUser?.role === 'auteur' ? <ProfileBackdrop logs={profileLogs as any[]} /> : <div style={{ position: 'absolute', inset: 0, zIndex: 0, background: 'linear-gradient(180deg, rgba(20,15,10,0.3) 0%, var(--ink) 100%)', pointerEvents: 'none' }} />}
                
                <div className="container" style={{ position: 'relative', zIndex: 1, maxWidth: 900, textAlign: 'center' }}>
                    {/* ── Avatar — Centered with dramatic glow ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <div style={{ position: 'relative' }}>
                            <div className="profile-avatar-ring profile-avatar-breathe" style={{ 
                                width: IS_TOUCH ? 120 : 160, height: IS_TOUCH ? 120 : 160, 
                                borderRadius: '50%', background: 'var(--ink)', 
                                border: `2px solid ${stats.color}`, 
                                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                position: 'relative', 
                                boxShadow: `0 0 60px ${stats.color}50, 0 0 120px ${stats.color}20, inset 0 0 30px rgba(0,0,0,0.6)`, 
                                overflow: 'hidden',
                            }}>
                                {renderAvatar(((profileUser as any)?.avatar_url || (profileUser as any)?.avatar || 'smiling'), IS_TOUCH ? 75 : 100)}
                            </div>
                            <div style={{ 
                                position: 'absolute', bottom: -12, left: '50%', transform: 'translateX(-50%)', 
                                background: 'linear-gradient(135deg, rgba(15,10,5,0.95), rgba(25,18,10,0.95))', 
                                border: `1px solid ${stats.color}`, 
                                padding: '0.25rem 0.75rem', borderRadius: '3px', 
                                fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em',
                                color: stats.color, whiteSpace: 'nowrap', 
                                boxShadow: `0 4px 15px rgba(0,0,0,0.6), 0 0 10px ${stats.color}20`, 
                                zIndex: 2 
                            }}>✦ {stats.level}</div>
                        </div>
                    </div>

                    {/* ── Username ── */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? 'clamp(1.8rem, 7vw, 2.5rem)' : '3rem', color: 'var(--parchment)', lineHeight: 1.1, textShadow: '0 2px 20px rgba(0,0,0,0.5)' }}>
                            @{profileUser.username.toUpperCase()}
                        </h1>
                        {profileUser?.role === 'auteur' && <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--ink)', background: 'var(--blood-reel)', padding: '0.2rem 0.5rem', borderRadius: '2px', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}><Star size={9} fill="currentColor" /> AUTEUR</span>}
                    </div>

                    {/* ── Follow / Settings ── */}
                    <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        {isOwnProfile ? (
                            <>
                                <button onClick={() => navigate('/edit-profile')} className="btn btn-ghost" style={{ padding: '0.4rem 1rem', border: '1px solid rgba(139,105,20,0.25)', color: 'var(--sepia)', fontSize: '0.6rem', letterSpacing: '0.15em', gap: '0.4rem' }}>
                                    EDIT PROFILE
                                </button>
                                <button onClick={() => navigate('/settings')} className="btn btn-ghost" style={{ padding: '0.4rem 0.6rem', border: '1px solid rgba(139,105,20,0.15)', color: 'var(--fog)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Settings">
                                    <Settings size={14} />
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={handleFollow}
                                disabled={followLoading}
                                className={`btn ${isFollowing ? 'btn-ghost' : 'btn-primary'}`}
                                style={{ fontSize: '0.65rem', padding: '0.5rem 2rem', opacity: followLoading ? 0.6 : 1, letterSpacing: '0.15em' }}
                            >
                                {followLoading ? '...' : isFollowing ? 'UNFOLLOW' : '+ FOLLOW'}
                            </button>
                        )}
                    </div>

                    {/* ── Bio ── */}
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: IS_TOUCH ? '0.95rem' : '1.05rem', color: 'var(--bone)', fontStyle: 'italic', maxWidth: 500, margin: '0 auto 1rem', lineHeight: 1.6, opacity: profileUser.bio ? 0.8 : 0.4 }}>
                        {profileUser.bio || (isOwnProfile ? "No bio yet. Tell the society who you are." : "No bio on file.")}
                    </p>

                    {/* ── Social Links ── */}
                    {(() => {
                        const raw = (profileUser as any).socialLinks || (isOwnProfile ? (currentUser as any)?.social_links : null) || []
                        // Support both array format [{title, url}] and legacy {platform: url}
                        let linkItems: { title: string; url: string }[] = []
                        if (Array.isArray(raw)) {
                            linkItems = raw.filter((l: any) => l.url && l.url.trim())
                        } else if (typeof raw === 'object') {
                            linkItems = Object.entries(raw)
                                .filter(([, v]: any) => v && (v as string).trim())
                                .map(([k, v]: any) => ({ title: k.charAt(0).toUpperCase() + k.slice(1), url: v }))
                        }
                        if (linkItems.length === 0) return null
                        return (
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                                {linkItems.map((link, i) => (
                                    <a key={i} href={link.url.startsWith('http') ? link.url : `https://${link.url}`} target="_blank" rel="noopener noreferrer" style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                        fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.12em',
                                        color: 'var(--fog)', textDecoration: 'none',
                                        padding: '0.3rem 0.6rem', border: '1px solid rgba(139,105,20,0.12)',
                                        borderRadius: '3px', transition: 'all 0.2s',
                                    }}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(139,105,20,0.3)'; e.currentTarget.style.color = 'var(--sepia)' }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(139,105,20,0.12)'; e.currentTarget.style.color = 'var(--fog)' }}
                                    >
                                        <span>🔗</span>
                                        {link.title.toUpperCase()}
                                    </a>
                                ))}
                            </div>
                        )
                    })()}

                    {/* ── Stats as museum placards ── */}
                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: IS_TOUCH ? 'repeat(4, 1fr)' : 'repeat(4, auto)',
                        justifyContent: IS_TOUCH ? 'stretch' : 'center',
                        gap: IS_TOUCH ? '0.5rem' : '3.5rem', 
                        marginBottom: IS_TOUCH ? '2rem' : '3rem',
                        maxWidth: IS_TOUCH ? '100%' : 'none',
                    }}>
                        {[
                            { value: profileLogs.length, label: 'FILMS', onClick: null },
                            { value: isOwnProfile ? (ownCounts?.followersCount ?? (currentUser as any)?.followers_count ?? 0) : ((profileUser as any)?.followersCount || 0), label: 'FOLLOWERS', onClick: () => openSocialModal('followers') },
                            { value: isOwnProfile ? (ownCounts?.followingCount ?? (currentUser as any)?.following_count ?? 0) : ((profileUser as any)?.followingCount || 0), label: 'FOLLOWING', onClick: () => openSocialModal('following') },
                            { value: profileWatchlist.length, label: 'WATCHLIST', onClick: null },
                        ].map(({ value, label, onClick }) => (
                            <div key={label} onClick={onClick as any} style={{ 
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem',
                                cursor: onClick ? 'pointer' : 'default',
                                padding: '0.5rem 0',
                                borderTop: '1px solid rgba(139,105,20,0.15)',
                            }}>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? '1.4rem' : '2.2rem', color: 'var(--parchment)', lineHeight: 1, textShadow: '0 0 20px rgba(139,105,20,0.15)' }}>{value}</div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: IS_TOUCH ? '0.4rem' : '0.5rem', letterSpacing: '0.15em', color: 'var(--fog)', opacity: 0.7 }}>{label}</div>
                            </div>
                        ))}
                    </div>

                    {/* ── Favorite Films Triptych — Centered & Prominent ── */}
                    <div style={{ maxWidth: IS_TOUCH ? '100%' : 450, margin: '0 auto' }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.35em', color: 'var(--sepia)', textAlign: 'center', marginBottom: '0.75rem', textShadow: '0 0 15px rgba(139,105,20,0.3)' }}>✦ FAVORITE FILMS ✦</div>
                        <ProfileTriptych user={profileUser} isOwnProfile={isOwnProfile} />
                    </div>
                </div>
                

                {/* Recently Watched — 3 latest film logs */}
                {(() => {
                    const recentLogs = profileLogs
                        .filter((l: any) => l.poster && l.poster.length > 5)
                        .slice(0, 3)
                    if (recentLogs.length === 0) return null

                    const timeAgo = (dateStr: string) => {
                        if (!dateStr) return ''
                        const diff = Date.now() - new Date(dateStr).getTime()
                        const mins = Math.floor(diff / 60000)
                        if (mins < 60) return `${mins}m ago`
                        const hrs = Math.floor(mins / 60)
                        if (hrs < 24) return `${hrs}h ago`
                        const days = Math.floor(hrs / 24)
                        if (days < 7) return `${days}d ago`
                        if (days < 30) return `${Math.floor(days / 7)}w ago`
                        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    }

                    return (
                        <div className="container" style={{ maxWidth: 1600, padding: IS_TOUCH ? '1.5rem 1rem 0' : '2rem 1rem 0' }}>
                            <div style={{ maxWidth: IS_TOUCH ? 'none' : 600, margin: '0 auto' }}>
                                <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(139,105,20,0.2), transparent)', marginBottom: '1.25rem' }} />
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.3em', color: 'var(--sepia)', textAlign: 'center', marginBottom: '0.8rem', textShadow: '0 0 15px rgba(139,105,20,0.3)' }}>✦ RECENTLY WATCHED ✦</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: IS_TOUCH ? '0.6rem' : '1rem' }}>
                                {recentLogs.map((log: any) => (
                                    <Link
                                        key={log.id || log.filmId}
                                        to={`/film/${log.filmId}`}
                                        style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}
                                    >
                                        <div style={{
                                            position: 'relative',
                                            aspectRatio: '2/3',
                                            borderRadius: '4px',
                                            overflow: 'hidden',
                                            border: '1px solid rgba(139,105,20,0.2)',
                                            boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
                                            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                                        }}
                                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.6), 0 0 15px rgba(139,105,20,0.15)' }}
                                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)' }}
                                        >
                                            <img
                                                src={`https://image.tmdb.org/t/p/w185${log.altPoster || log.poster}`}
                                                alt={log.title}
                                                loading="lazy"
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            />
                                            {/* Warm gradient overlay at bottom */}
                                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)', pointerEvents: 'none' }} />
                                            {/* Rating at bottom-left */}
                                            {log.rating > 0 && (
                                                <div style={{ position: 'absolute', bottom: '0.4rem', left: '0.4rem', zIndex: 1 }}>
                                                    <ReelRating value={log.rating} size="sm" />
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                                            <div style={{ fontFamily: 'var(--font-sub)', fontSize: IS_TOUCH ? '0.7rem' : '0.75rem', color: 'var(--parchment)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.title}</div>
                                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--fog)', opacity: 0.7 }}>{timeAgo(log.watchedDate || log.createdAt)}</div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                            </div>
                    )
                })()}

                </div>
            ) : (
                <div style={{ background: 'linear-gradient(180deg, var(--soot) 0%, var(--ink) 100%)', borderBottom: '1px solid rgba(139,105,20,0.1)' }}>
                    <div className="container" style={{ padding: '1.5rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button onClick={() => navigate(`/user/${profileUser.username}`)} className="btn btn-ghost" style={{ padding: '0.4rem', background: 'rgba(139,105,20,0.05)', borderRadius: '50%' }}>
                            <ChevronLeft size={20} color="var(--sepia)" />
                        </button>
                        <div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--fog)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                                @{profileUser.username}
                            </div>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)', textTransform: 'uppercase', lineHeight: 1 }}>
                                {activeTab === 'diary' ? 'The Ledger' : activeTab === 'lists' ? 'The Stacks' : activeTab === 'archive' ? 'Archive' : activeTab === 'watchlist' ? 'Watchlist' : activeTab === 'projector' || activeTab === 'stats' ? 'Global Analytics' : activeTab}
                            </h1>
                        </div>
                    </div>
                </div>
            )}

            {!activeTab && (
                <div className="container" style={{ padding: IS_TOUCH ? '0 1rem' : '0 1rem', maxWidth: 900, margin: '0 auto', paddingBottom: '3rem' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.35em', color: 'var(--sepia)', textAlign: 'center', marginBottom: '1rem', marginTop: '2rem', textShadow: '0 0 15px rgba(139,105,20,0.3)' }}>✦ THE COLLECTION ✦</div>
                    <div style={{ display: 'grid', gridTemplateColumns: IS_TOUCH ? 'repeat(3, 1fr)' : 'repeat(6, 1fr)', gap: IS_TOUCH ? '0.5rem' : '0.75rem' }}>
                        {[
                            { id: 'archive', label: 'Archive', count: profileLogs.length, icon: Archive, active: activeTab === 'archive', desc: 'Watched' },
                            { id: 'diary', label: 'The Ledger', count: profileLogs.filter((l: any) => l.rating > 0 || (l.review && l.review.length > 0)).length, icon: BookOpen, active: activeTab === 'diary', desc: 'Diary' },
                            { id: 'watchlist', label: 'Watchlist', count: profileWatchlist.length, icon: Bookmark, active: activeTab === 'watchlist', desc: 'To See' },
                            { id: 'lists', label: 'Stacks', count: profileLists.length, icon: LayoutList, active: activeTab === 'lists', desc: 'Lists' },
                            { id: 'tickets', label: 'Stubs', count: 'SOON', icon: Ticket, active: activeTab === 'tickets', disabled: true, desc: 'Box Office' },
                            { id: 'projector', label: 'Analytics', count: 'LIFETIME', icon: LineChart, active: activeTab === 'projector', highlight: true, desc: 'Projector' },
                        ].map(item => (
                            <button
                                key={item.id}
                                disabled={item.disabled}
                                onClick={() => {
                                    if (!item.disabled) navigate(`/user/${profileUser.username}/${item.id}`)
                                }}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    textAlign: 'center',
                                    gap: '0.75rem',
                                    padding: '1.25rem 0.5rem',
                                    background: 'linear-gradient(135deg, rgba(20,15,10,0.8) 0%, rgba(10,5,0,0.9) 100%)',
                                    border: '1px solid rgba(139,105,20,0.15)',
                                    borderRadius: '2px',
                                    cursor: item.disabled ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                                    ...(item.disabled ? { opacity: 0.3 } : {})
                                }}
                                onMouseEnter={e => {
                                    if (!item.disabled) {
                                        e.currentTarget.style.border = '1px solid rgba(139,105,20,0.5)'
                                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(30,22,15,0.9) 0%, rgba(15,10,5,0.95) 100%)'
                                        e.currentTarget.style.transform = 'translateY(-2px)'
                                        e.currentTarget.style.boxShadow = '0 8px 30px rgba(139,105,20,0.1)'
                                    }
                                }}
                                onMouseLeave={e => {
                                    if (!item.disabled) {
                                        e.currentTarget.style.border = '1px solid rgba(139,105,20,0.15)'
                                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(20,15,10,0.8) 0%, rgba(10,5,0,0.9) 100%)'
                                        e.currentTarget.style.transform = 'translateY(0)'
                                        e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)'
                                    }
                                }}
                            >
                                <div style={{
                                    width: 36, height: 36, borderRadius: '50%',
                                    background: item.highlight ? 'rgba(139,105,20,0.1)' : 'rgba(255,255,255,0.03)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    color: item.highlight ? 'var(--sepia)' : 'var(--bone)',
                                }}>
                                    <item.icon size={16} strokeWidth={1.5} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: item.highlight ? 'var(--sepia)' : 'var(--parchment)', letterSpacing: '0.04em', lineHeight: 1.1, marginBottom: '0.3rem' }}>
                                        {item.label}
                                    </span>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem' }}>
                                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--fog)', textTransform: 'uppercase' }}>
                                            {item.desc}
                                        </span>
                                        {item.count !== '' && (
                                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: item.highlight ? 'var(--sepia)' : 'var(--parchment)', textTransform: 'uppercase' }}>
                                                {item.count}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Tab Content */}
            {activeTab && (
                <main style={{ padding: '2.5rem 0 5rem' }}>
                <div className="container layout-sidebar reversed">
                    <div>
                        {activeTab === 'diary' && (
                            <VaultLedgerTab profileLogs={profileLogs} isOwnProfile={isOwnProfile} setViewLog={setViewLog} userRole={profileUser?.role} />
                        )}

                        {activeTab === 'tickets' && (
                            <div><SectionHeader label="ADMISSION HISTORY" title="Ticket Stubs" /><TicketBooth stubs={profileStubs} /></div>
                        )}

                        {activeTab === 'projector' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem', paddingBottom: '3rem', animation: 'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                                {/* Section 1: The Projector Room — Ranking + Viewing Habits */}
                                <div>
                                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>GLOBAL ANALYTICS</div>
                                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? '2rem' : '2.5rem', color: 'var(--parchment)', lineHeight: 1.1 }}>The Projector Room</h2>
                                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--fog)', fontStyle: 'italic', marginTop: '0.5rem' }}>Lifetime cinematic data & achievements.</p>
                                    </div>

                                    <ProjectorRoom stats={cineStats} user={profileUser} />
                                    
                                    <div style={{ marginTop: '2rem' }}>
                                        <ProfileProjectorTab profileLogs={profileLogs} profileWatchlist={profileWatchlist} profileLists={profileLists} />
                                    </div>
                                </div>

                                {/* Section 2: Taste DNA */}
                                <div>
                                    <TasteDNA stats={finalMetrics} />
                                    {finalMetrics.total_logs >= 5 && isOwnProfile && (
                                        <button
                                            className="btn btn-ghost"
                                            onClick={() => setShowDNA(true)}
                                            style={{ width: '100%', justifyContent: 'center', fontSize: '0.6rem', letterSpacing: '0.15em', gap: '0.4rem', marginTop: '1rem' }}
                                        >
                                            <Share2 size={12} /> SHARE CINEMA DNA
                                        </button>
                                    )}
                                </div>

                                {/* Section 3: Cinematic Insights — Real Actor/Director/Genre Stats */}
                                <div>
                                    <SectionHeader label="REAL ANALYTICS" title="Cinematic Insights" />
                                    <CinematicInsights logs={profileLogs} userId={profileUser?.id} />
                                </div>

                                {/* Section 4: Society Honors */}
                                <div>
                                    <SectionHeader label="UNLOCKABLE BADGES" title="Society Honors" />
                                    <Achievements logs={profileLogs} />
                                </div>

                                {/* Section 5: Your Favourites */}
                                {profileLogs.filter((l: any) => l.rating >= 4).length > 0 && (
                                    <div>
                                        <SectionHeader label="HIGHEST RATED" title="Your Favourites" />
                                        <div className="card" style={{ padding: '1.25rem' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {profileLogs.filter((l: any) => l.rating >= 4).slice(0, 6).map((log: any) => (
                                                    <Link key={log.id} to={`/film/${log.filmId}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
                                                        {log.poster && (
                                                            <div style={{ width: 28, height: 42, flexShrink: 0, borderRadius: '2px', overflow: 'hidden', filter: 'sepia(0.3)' }}>
                                                                <Poster path={log.poster} title={log.title} sizeHint="sm" />
                                                            </div>
                                                        )}
                                                        <div>
                                                            <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.75rem', color: 'var(--parchment)', lineHeight: 1.2, marginBottom: '0.2rem' }}>{log.title}</div>
                                                            <div style={{ display: 'block', width: '100%', flexShrink: 0 }}>
                                                                <ReelRating value={log.rating} size="sm" />
                                                            </div>
                                                        </div>
                                                    </Link>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Section 6: Cinematic Passport */}
                                <div>
                                    <SectionHeader label="CINEMATIC ACHIEVEMENTS" title="The Passport" />
                                    <NoirPassport logs={profileLogs} />
                                </div>

                                {/* Section 7: Projectionist's Calendar */}
                                <div>
                                    <SectionHeader label="VIEWING HISTORY" title="The Projectionist's Calendar" />
                                    <ProjectionistCalendar {...{ logs: profileLogs, isPremium } as any} />
                                </div>

                                {isOwnProfile && currentProgrammes?.length > 0 && (
                                    <>
                                        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, var(--ash), transparent)' }} />
                                        <div>
                                            <SectionHeader label="CURATED FILM PAIRINGS" title="Nightly Programmes" />
                                            <ProgrammesSection {...{ programmes: currentProgrammes, user: profileUser } as any} />
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {activeTab === 'lists' && (
                            <div><SectionHeader label="YOUR COLLECTIONS" title="The Stacks" /><ListsSection lists={profileLists} user={profileUser} /></div>
                        )}

                        {activeTab === 'watchlist' && (
                            <VaultWatchlistTab profileWatchlist={profileWatchlist} isOwnProfile={isOwnProfile} />
                        )}

                        {activeTab === 'archive' && (
                            <VaultArchiveTab 
                                profileLogs={profileLogs} 
                                isOwnProfile={isOwnProfile} 
                                setViewLog={setViewLog}
                                archiveSieve={archiveSieve} 
                                setArchiveSieve={setArchiveSieve} 
                                archiveVisibleCount={archiveVisibleCount} 
                                setArchiveVisibleCount={setArchiveVisibleCount} 
                                archiveFilteredLogs={archiveFilteredLogs} 
                            />
                        )}
                    </div>

                    {/* Sidebar */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <VaultSection {...{ vault: isOwnProfile ? currentWatchlist : [], user: profileUser, logs: profileLogs } as any} />

                        {/* Taste Match (other users only) */}
                        {!isOwnProfile && currentLogs.length >= 5 && (
                            <TasteMatch myLogs={currentLogs} theirLogs={profileLogs} theirUsername={profileUser?.username || ''} />
                        )}

                        {/* Film Recommendations (own profile only) */}
                        {isOwnProfile && <FilmRecommendations />}
                    </div>
                </div>
            </main>
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
            />
        </div>
    )
}

