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
import PhysicalArchiveTab from '../components/profile/PhysicalArchiveTab'
import { ProfileProjectorTab } from '../components/profile/ProfileProjectorTab'
import { ProfileTriptych } from '../components/profile/ProfileTriptych'
import PageSEO from '../components/PageSEO'
import Poster from '../components/film/Poster'

const IS_TOUCH = typeof window !== 'undefined' && window.matchMedia('(any-pointer: coarse)').matches



// ── MAIN PAGE ──
export default function UserProfilePage() {
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
                .select('id, username, role, bio, avatar_url, followers_count, following_count, is_social_private, preferences, created_at, tier')
                .eq('username', routeUsername)
                .single()
            if (!data) return null
            return {
                id: data.id,
                username: data.username,
                role: data.role || 'cinephile',
                bio: data.bio || '',
                avatar: data.avatar_url || 'smiling',
                followersCount: data.followers_count || 0,
                followingCount: data.following_count || 0,
                isSocialPrivate: data.is_social_private || false,
                socialVisibility: (data as any).preferences?.social_visibility || (data.is_social_private ? 'private' : 'public'),
                privacyEndorsements: (data as any).preferences?.privacy_endorsements || 'everyone',
                privacyAnnotations: (data as any).preferences?.privacy_annotations || 'everyone',
                preferences: data.preferences || {},
                createdAt: data.created_at,
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

    // Fetch other user's public logs from Supabase (own logs come from Zustand)
    const { data: otherUserLogs = [] } = useQuery({
        queryKey: ['user-profile-logs', routeUsername],
        queryFn: async () => {
            const { data: prof } = await supabase
                .from('profiles').select('id').eq('username', routeUsername).single()
            if (!prof) return []
            const { data } = await supabase
                .from('logs')
                .select('id, film_id, film_title, poster_path, year, rating, review, status, watched_date, watched_with, created_at, pull_quote, is_autopsied, autopsy, alt_poster, physical_media')
                .eq('user_id', prof.id)
                .order('created_at', { ascending: false })
                .limit(100000)
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
                // private_notes intentionally excluded — never visible to other users
            }))
        },
        enabled: !isOwnProfile && !!routeUsername,
        staleTime: 1000 * 60 * 5,
    })
    const activeTab = tab || null
    const [shareLog, setShareLog] = useState(null)
    const [showDNA, setShowDNA] = useState(false)
    const [sieve, setSieve] = useState('all')
    const [archiveSieve, setArchiveSieve] = useState('all')
    const [visibleLogCount, setVisibleLogCount] = useState(40)
    const [archiveVisibleCount, setArchiveVisibleCount] = useState(40)
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
        if (!avatarValue) return <Buster size={size} mood="smiling" />
        if (avatarValue.startsWith('data:image/') || avatarValue.startsWith('http')) return <img src={avatarValue} alt="User avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
        return <Buster size={size} mood={avatarValue} />
    }

    const profileLogs = isOwnProfile ? currentLogs : otherUserLogs
    const profileStubs = isOwnProfile ? currentStubs : []
    const profileLists = isOwnProfile ? currentLists : []
    const profileWatchlist = isOwnProfile ? currentWatchlist : []
    const stats = getCinephileStats ? (isOwnProfile ? getCinephileStats() : {
        count: profileLogs.length,
        level: profileLogs.length > 50 ? 'THE ORACLE' : profileLogs.length > 20 ? 'MIDNIGHT DEVOTEE' : profileLogs.length > 5 ? 'THE REGULAR' : 'FIRST REEL',
        color: profileLogs.length > 50 ? 'var(--sepia)' : profileLogs.length > 20 ? 'var(--blood-reel)' : 'var(--flicker)',
        progress: (profileLogs.length % 20) * 5,
    }) : { count: 0, level: 'FIRST REEL', color: 'var(--fog)', progress: 0 }

    // useMemo must be called unconditionally (before any early returns) — rules of hooks
    const halfLifeMap = useMemo(() => {
        const byFilm: any = {}
        for (const log of profileLogs as any[]) {
            if (!log.filmId || !log.rating) continue
            if (!byFilm[log.filmId]) byFilm[log.filmId] = []
            byFilm[log.filmId].push({ rating: log.rating, date: log.createdAt || log.watchedDate })
        }
        const result: any = {}
        for (const [filmId, entries] of Object.entries(byFilm)) {
            if ((entries as any[]).length < 2) continue
            const sorted = [...(entries as any[])].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
            const first = sorted[0].rating, last = sorted[sorted.length - 1].rating
            result[filmId] = { count: sorted.length, trajectory: last > first ? 'ASCENDING' : last < first ? 'DECAYING' : 'ETERNAL', delta: last - first }
        }
        return result
    }, [profileLogs])

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
        { id: 'diary', label: 'The Ledger', count: filteredLogs.length },
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
                <div style={{ borderBottom: '1px solid var(--ash)', background: 'linear-gradient(180deg, var(--soot) 0%, var(--ink) 100%)', padding: IS_TOUCH ? '1.5rem 0 1rem' : '3rem 0 2rem', position: 'relative', overflow: 'hidden' }}>
                {profileUser?.role === 'auteur' ? <ProfileBackdrop logs={profileLogs as any[]} /> : <div style={{ position: 'absolute', inset: 0, zIndex: 0, background: 'linear-gradient(180deg, rgba(20,15,10,0.4) 0%, var(--ink) 100%)', pointerEvents: 'none' }} />}
                <div className="container" style={{ position: 'relative', zIndex: 1 }}>
                    <div className="profile-hero" style={{ display: 'flex', gap: IS_TOUCH ? '1.25rem' : '3rem', alignItems: IS_TOUCH ? 'center' : 'flex-end', flexWrap: 'wrap', flexDirection: IS_TOUCH ? 'column' : 'row' }}>
                        {/* Avatar */}
                        <div style={{ position: 'relative', flexShrink: 0, marginBottom: IS_TOUCH ? '1rem' : 0 }}>
                            <div className="profile-avatar-ring" style={{ width: 140, height: 140, borderRadius: '50%', background: 'var(--ink)', border: `2px solid ${stats.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', boxShadow: `0 0 40px ${stats.color}20`, overflow: 'hidden', margin: '0 auto' }}>
                                {renderAvatar((profileUser?.avatar || 'smiling'), 90)}
                            </div>
                            <div style={{ position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)', background: 'var(--ink)', border: `1px solid ${stats.color}`, padding: '0.2rem 0.6rem', borderRadius: '4px', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: stats.color, whiteSpace: 'nowrap', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', zIndex: 2 }}>✦ {stats.level}</div>
                        </div>

                        {/* Identity */}
                        <div className="profile-identity" style={{ flex: 1, minWidth: IS_TOUCH ? 0 : 300, display: 'flex', flexDirection: 'column', alignItems: IS_TOUCH ? 'center' : 'flex-start', textAlign: IS_TOUCH ? 'center' : 'left' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem', flexWrap: 'wrap', justifyContent: IS_TOUCH ? 'center' : 'flex-start' }}>
                                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? 'clamp(1.6rem, 6vw, 2.2rem)' : '2.5rem', color: 'var(--parchment)', lineHeight: 1.1, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    @{profileUser.username.toUpperCase()}
                                    {profileUser?.role === 'auteur' && <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--ink)', background: 'var(--blood-reel)', padding: '0.2rem 0.5rem', borderRadius: '2px', display: 'flex', alignItems: 'center', gap: '0.2rem' }}><Star size={10} fill="currentColor" /> AUTEUR</span>}
                                </h1>
                                {isOwnProfile ? (
                                    <button onClick={() => navigate('/settings')} className="btn btn-ghost" style={{ padding: '0.4rem', border: '1px solid rgba(139,105,20,0.3)', color: 'var(--sepia)' }} aria-label="Settings">
                                        <Settings size={14} />
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleFollow}
                                        disabled={followLoading}
                                        className={`btn ${isFollowing ? 'btn-ghost' : 'btn-primary'}`}
                                        style={{ fontSize: '0.65rem', padding: '0.4rem 1.2rem', opacity: followLoading ? 0.6 : 1 }}
                                    >
                                        {followLoading ? '...' : isFollowing ? 'UNFOLLOW' : '+ FOLLOW'}
                                    </button>
                                )}
                            </div>

                            <p style={{ fontFamily: 'var(--font-body)', fontSize: IS_TOUCH ? '0.9rem' : '1rem', color: 'var(--bone)', fontStyle: 'italic', maxWidth: 600, lineHeight: 1.5, opacity: profileUser.bio ? 1 : 0.5, marginBottom: '1.5rem' }}>
                                {profileUser.bio || (isOwnProfile ? "No bio yet. Tell the society who you are." : "No bio on file.")}
                            </p>

                            {/* Core Stats Row */}
                            <div className="profile-stats-row" style={{ display: 'flex', gap: IS_TOUCH ? '1.5rem' : '3rem', flexWrap: 'wrap', justifyContent: IS_TOUCH ? 'center' : 'flex-start' }}>
                                {[
                                    { value: profileLogs.length, label: 'ACTIVITY', onClick: null },
                                    { value: isOwnProfile ? (ownCounts?.followersCount ?? (currentUser as any)?.followers_count ?? 0) : ((profileUser as any)?.followersCount || 0), label: 'FOLLOWERS', onClick: () => openSocialModal('followers') },
                                    { value: isOwnProfile ? (ownCounts?.followingCount ?? (currentUser as any)?.following_count ?? 0) : ((profileUser as any)?.followingCount || 0), label: 'FOLLOWING', onClick: () => openSocialModal('following') },
                                ].map(({ value, label, onClick }) => (
                                    <div key={label} onClick={onClick as any} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', cursor: onClick ? 'pointer' : 'default', alignItems: IS_TOUCH ? 'center' : 'flex-start' }}>
                                        <div style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? '1.4rem' : '1.8rem', color: 'var(--parchment)', lineHeight: 1 }}>{value}</div>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>{label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    {/* The Triptych Display */}
                    <ProfileTriptych user={profileUser} isOwnProfile={isOwnProfile} />
                </div>
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
                                {activeTab === 'diary' ? 'The Ledger' : activeTab === 'lists' ? 'The Stacks' : activeTab === 'archive' ? 'Archive' : activeTab === 'watchlist' ? 'Watchlist' : activeTab === 'stats' ? 'Global Analytics' : activeTab}
                            </h1>
                        </div>
                    </div>
                </div>
            )}

            {!activeTab && (
                <div className="container" style={{ padding: IS_TOUCH ? 0 : '0 1rem', maxWidth: 850, margin: '0 auto', paddingBottom: '3rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.75rem', padding: '1.5rem 0.5rem' }}>
                        {[
                            { id: 'archive', label: 'Archive', count: profileLogs.length, icon: Archive, active: activeTab === 'archive', desc: 'Watched' },
                            { id: 'diary', label: 'The Ledger', count: profileLogs.length, icon: BookOpen, active: activeTab === 'diary', desc: 'Diary' },
                            { id: 'watchlist', label: 'Watchlist', count: profileWatchlist.length, icon: Bookmark, active: activeTab === 'watchlist', desc: 'To See' },
                            { id: 'lists', label: 'Stacks', count: profileLists.length, icon: LayoutList, active: activeTab === 'lists', desc: 'Lists' },
                            { id: 'tickets', label: 'Stubs', count: 'SOON', icon: Ticket, active: activeTab === 'tickets', disabled: true, desc: 'Box Office' },
                            { id: 'stats', label: 'Analytics', count: 'LIFETIME', icon: LineChart, active: activeTab === 'stats', highlight: true, desc: 'Projector' },
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
                                    borderRadius: '12px',
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
                            <div>
                                <SectionHeader label="CHRONOLOGICAL" title="The Ledger" />
                                {profileLogs.length > 0 && (
                                    <div className="profile-sieve-strip" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.5rem', borderBottom: '1px solid var(--ash)' }}>
                                        {[{ id: 'all', label: 'All' }, { id: '5', label: '✦✦✦✦✦' }, { id: '4', label: '✦✦✦✦' }, { id: '3', label: '✦✦✦' }, { id: '2', label: '✦✦' }, { id: '1', label: '✦' }].map(s => (
                                            <button key={s.id} onClick={() => setSieve(s.id)} className={`btn ${sieve === s.id ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: '0.65rem', padding: '0.4rem 0.75rem', whiteSpace: 'nowrap' }}>{s.label}</button>
                                        ))}
                                    </div>
                                )}
                                {filteredLogs.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '4rem 2rem', border: '1px solid var(--ash)', borderRadius: 'var(--radius-card)', background: 'linear-gradient(180deg, var(--soot) 0%, var(--ink) 100%)' }}>
                                        <Buster size={80} mood="peeking" />
                                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)', marginTop: '1.5rem', marginBottom: '0.5rem' }}>The Archive is Empty</div>
                                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--fog)', maxWidth: 400, margin: '0 auto', lineHeight: 1.4 }}>
                                            {profileLogs.length === 0 ? (isOwnProfile ? "No films logged yet. Press Ctrl+K or tap + to log your first film." : "This member hasn't logged any films yet.") : "No logs match this filter."}
                                        </div>
                                    </div>
                                ) : (() => {
                                    const shown = filteredLogs.slice(0, visibleLogCount)
                                    // Group shown logs by month
                                    const grouped = shown.reduce((acc: any, log: any) => {
                                        const d = new Date(log.watchedDate || log.createdAt)
                                        const title = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()
                                        if (!acc[title]) acc[title] = []
                                        acc[title].push(log)
                                        return acc
                                    }, {})

                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
                                            {Object.keys(grouped).map(month => (
                                                <div key={month}>
                                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1rem', borderBottom: '1px solid rgba(139,105,20,0.1)', paddingBottom: '0.5rem' }}>
                                                        {month}
                                                    </div>
                                                    <div className="profile-log-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: IS_TOUCH ? '0.2rem' : '0.75rem' }}>
                                                        {grouped[month].map((log: any) => {
                                                            const hl: any = halfLifeMap[log.filmId]
                                                            return (
                                                                <div
                                                                    key={log.id}
                                                                    onClick={() => setViewLog(log)}
                                                                    style={{ position: 'relative', cursor: 'pointer' }}
                                                                >
                                                                    <FilmCard film={{ id: log.filmId, title: log.title, poster_path: log.altPoster || log.poster, release_date: log.year + '-01-01', userRating: log.rating, status: log.status } as any} />
                                                                    {hl && (
                                                                        <div style={{ position: 'absolute', bottom: 6, left: 4, right: 4, background: 'rgba(10,7,3,0.88)', backdropFilter: 'blur(4px)', border: '1px solid rgba(139,105,20,0.3)', borderRadius: '2px', padding: '0.25rem 0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.3rem', pointerEvents: 'none' }}>
                                                                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', whiteSpace: 'nowrap', color: hl.trajectory === 'ASCENDING' ? '#7cb87a' : hl.trajectory === 'DECAYING' ? 'var(--blood-reel)' : 'var(--sepia)' }}>{hl.trajectory === 'ASCENDING' ? '↑' : hl.trajectory === 'DECAYING' ? '↓' : '—'} {hl.trajectory}</span>
                                                                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.4rem', color: 'var(--fog)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>×{hl.count}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                            {visibleLogCount < filteredLogs.length && (
                                                <div ref={loadMoreRef} style={{ textAlign: 'center', padding: '2rem', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>
                                                    LOADING MORE REELS...
                                                </div>
                                            )}
                                        </div>
                                    )
                                })()}
                            </div>
                        )}

                        {activeTab === 'tickets' && (
                            <div><SectionHeader label="ADMISSION HISTORY" title="Ticket Stubs" /><TicketBooth stubs={profileStubs} /></div>
                        )}

                        {activeTab === 'stats' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem', paddingBottom: '3rem', animation: 'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                                {/* Section 1: The Projector Room — Ranking + Viewing Habits */}
                                <div>
                                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>GLOBAL ANALYTICS</div>
                                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? '2rem' : '2.5rem', color: 'var(--parchment)', lineHeight: 1.1 }}>The Projector Room</h2>
                                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--fog)', fontStyle: 'italic', marginTop: '0.5rem' }}>Lifetime cinematic data & achievements.</p>
                                    </div>

                                    <ProjectorRoom stats={stats} user={profileUser} />
                                    <div style={{ marginTop: '2rem' }}>
                                        <ProfileProjectorTab profileLogs={profileLogs} profileWatchlist={profileWatchlist} profileLists={profileLists} />
                                    </div>
                                </div>

                                {/* Section 2: Cinematic Passport */}
                                <div>
                                    <SectionHeader label="CINEMATIC ACHIEVEMENTS" title="The Passport" />
                                    <NoirPassport logs={profileLogs} />
                                </div>

                                {/* Section 3: Projectionist's Calendar */}
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
                            <div>
                                <SectionHeader label="FILMS TO SEE" title="Watchlist" />
                                {profileWatchlist.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--fog)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>{isOwnProfile ? "Your watchlist is empty. Start saving films." : "This member hasn't saved any films yet."}</div>
                                ) : (
                                    <>
                                        <WatchlistRoulette watchlist={profileWatchlist as any[]} />
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: IS_TOUCH ? '0.2rem' : '1rem' }}>
                                            {profileWatchlist.map((film: any) => (
                                                <Link key={film.id} to={`/film/${film.id}`}>
                                                    <motion.div whileHover={{ y: -3, transition: { type: 'spring', damping: 12 } }}><FilmCard film={film} /></motion.div>
                                                </Link>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}



                        {activeTab === 'archive' && (
                            <div>
                                <SectionHeader label="ALL WATCHED FILMS" title="The Archive" />
                                {profileLogs.length > 0 && (
                                    <div className="profile-sieve-strip" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.5rem', borderBottom: '1px solid var(--ash)' }}>
                                        {[{ id: 'all', label: 'All' }, { id: 'watched', label: 'Watched' }, { id: 'rewatched', label: 'Rewatched' }, { id: 'abandoned', label: 'Abandoned' }].map(s => (
                                            <button key={s.id} onClick={() => setArchiveSieve(s.id)} className={`btn ${archiveSieve === s.id ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: '0.65rem', padding: '0.4rem 0.75rem', whiteSpace: 'nowrap' }}>{s.label}</button>
                                        ))}
                                    </div>
                                )}
                                {archiveFilteredLogs.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '4rem 2rem', border: '1px solid var(--ash)', borderRadius: 'var(--radius-card)', background: 'linear-gradient(180deg, var(--soot) 0%, var(--ink) 100%)' }}>
                                        <Buster size={80} mood="peeking" />
                                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)', marginTop: '1.5rem', marginBottom: '0.5rem' }}>The Archive is Empty</div>
                                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--fog)', maxWidth: 400, margin: '0 auto', lineHeight: 1.4 }}>
                                            {profileLogs.length === 0 ? (isOwnProfile ? "No films watched yet. Mark a film as watched or log your first film." : "This member hasn't watched any films yet.") : "No films match this filter."}
                                        </div>
                                    </div>
                                ) : (() => {
                                    const shown = archiveFilteredLogs.slice(0, archiveVisibleCount)
                                    const grouped = shown.reduce((acc: any, log: any) => {
                                        const d = new Date(log.watchedDate || log.createdAt)
                                        const title = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()
                                        if (!acc[title]) acc[title] = []
                                        acc[title].push(log)
                                        return acc
                                    }, {})
                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
                                            {Object.keys(grouped).map(month => (
                                                <div key={month}>
                                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1rem', borderBottom: '1px solid rgba(139,105,20,0.1)', paddingBottom: '0.5rem' }}>
                                                        {month}
                                                    </div>
                                                    <div className="profile-log-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: IS_TOUCH ? '0.2rem' : '0.75rem' }}>
                                                        {grouped[month].map((log: any) => (
                                                            <div key={log.id} onClick={() => setViewLog(log)} style={{ position: 'relative', cursor: 'pointer' }}>
                                                                <FilmCard film={{ id: log.filmId, title: log.title, poster_path: log.altPoster || log.poster, release_date: log.year + '-01-01', userRating: log.rating, status: log.status } as any} />
                                                                {log.status === 'rewatched' && (
                                                                    <div style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(10,7,3,0.85)', backdropFilter: 'blur(4px)', border: '1px solid rgba(139,105,20,0.3)', borderRadius: '2px', padding: '0.15rem 0.35rem', pointerEvents: 'none' }}>
                                                                        <RotateCcw size={9} color="var(--sepia)" />
                                                                    </div>
                                                                )}
                                                                {log.status === 'abandoned' && (
                                                                    <div style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(10,7,3,0.85)', backdropFilter: 'blur(4px)', border: '1px solid rgba(139,30,30,0.3)', borderRadius: '2px', padding: '0.15rem 0.35rem', pointerEvents: 'none' }}>
                                                                        <X size={9} color="var(--blood-reel)" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                            {archiveVisibleCount < archiveFilteredLogs.length && (
                                                <div style={{ textAlign: 'center', padding: '2rem', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--fog)', cursor: 'pointer' }} onClick={() => setArchiveVisibleCount(c => c + 40)}>
                                                    LOAD MORE REELS...
                                                </div>
                                            )}
                                        </div>
                                    )
                                })()}
                            </div>
                        )}


                    </div>

                    {/* Sidebar */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <TasteDNA logs={profileLogs} />
                        {profileLogs.length >= 5 && isOwnProfile && (
                            <button
                                className="btn btn-ghost"
                                onClick={() => setShowDNA(true)}
                                style={{ width: '100%', justifyContent: 'center', fontSize: '0.6rem', letterSpacing: '0.15em', gap: '0.4rem', marginTop: '-0.75rem' }}
                            >
                                <Share2 size={12} /> SHARE CINEMA DNA
                            </button>
                        )}
                        <VaultSection {...{ vault: isOwnProfile ? currentWatchlist : [], user: profileUser, logs: profileLogs } as any} />

                        {/* E1: Achievement Badges */}
                        <Achievements logs={profileLogs} />

                        {/* E3: Taste Match (other users only) */}
                        {!isOwnProfile && currentLogs.length >= 5 && (
                            <TasteMatch myLogs={currentLogs} theirLogs={profileLogs} theirUsername={profileUser?.username || ''} />
                        )}

                        {/* E4: Film Recommendations (own profile only) */}
                        {isOwnProfile && <FilmRecommendations />}

                        {profileLogs.filter((l: any) => l.rating >= 4).length > 0 && (
                            <div className="card">
                                <div className="section-title" style={{ marginBottom: '0.75rem' }}>YOUR FAVOURITES</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {profileLogs.filter((l: any) => l.rating >= 4).slice(0, 4).map((log: any) => (
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
                        )}
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

