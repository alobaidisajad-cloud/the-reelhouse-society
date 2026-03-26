import { useState, useRef, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { Link, useParams } from 'react-router-dom'
import { Star, Lock, Camera, Settings, Globe, Download, Share2, Film, LogOut } from 'lucide-react'
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
import PageSEO from '../components/PageSEO'
import Poster from '../components/film/Poster'

const IS_TOUCH = typeof window !== 'undefined' && window.matchMedia('(any-pointer: coarse)').matches



// ── MAIN PAGE ──
export default function UserProfilePage() {
    const { username: routeUsername } = useParams()
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
                .limit(100)
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
    const [activeTab, setActiveTab] = useState('diary')
    const [shareLog, setShareLog] = useState(null)
    const [showDNA, setShowDNA] = useState(false)
    const [sieve, setSieve] = useState('all')
    const [visibleLogCount, setVisibleLogCount] = useState(40)
    const loadMoreRef = useRef(null)
    const [isEditing, setIsEditing] = useState(false)
    const [editBio, setEditBio] = useState(profileUser?.bio || '')
    const [editUsername, setEditUsername] = useState(profileUser?.username || '')
    const [editAvatar, setEditAvatar] = useState(profileUser?.avatar || 'smiling')
    const [editIsSocialPrivate, setEditIsSocialPrivate] = useState(profileUser?.isSocialPrivate || false)
    const [viewLog, setViewLog] = useState<any>(null)

    useEffect(() => {
        if (profileUser) { setEditAvatar(profileUser.avatar || 'smiling'); setEditIsSocialPrivate(profileUser.isSocialPrivate || false) }
    }, [profileUser])

    const handleSaveProfile = () => {
        updateUser({ bio: editBio, username: editUsername, avatar: editAvatar, isSocialPrivate: editIsSocialPrivate })
        setIsEditing(false)
        toast.success("Identity updated.")
    }

    const handleFileChange = async (e: any) => {
        const file = e.target.files[0]
        if (!file) return
        if (!file.type.startsWith('image/')) return toast.error("Only archival image formats supported.")
        if (file.size > 5 * 1024 * 1024) return toast.error("Frame too large. Max 5MB.")
        try {
            const userId = currentUser?.id
            if (!userId) return toast.error("Must be signed in.")

            // Client-side compression: resize to 400x400 max, convert to WebP
            const compressed = await new Promise<Blob>((resolve, reject) => {
                const img = new Image()
                img.onload = () => {
                    const MAX = 400
                    let { width, height } = img
                    if (width > MAX || height > MAX) {
                        const scale = Math.min(MAX / width, MAX / height)
                        width = Math.round(width * scale)
                        height = Math.round(height * scale)
                    }
                    const canvas = document.createElement('canvas')
                    canvas.width = width
                    canvas.height = height
                    const ctx = canvas.getContext('2d')
                    ctx?.drawImage(img, 0, 0, width, height)
                    canvas.toBlob(
                        (blob) => blob ? resolve(blob) : reject(new Error('Compression failed')),
                        'image/webp', 0.8
                    )
                }
                img.onerror = reject
                img.src = URL.createObjectURL(file)
            })

            const filePath = `${userId}/avatar.webp`
            const { supabase } = await import('../supabaseClient')
            const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, compressed, { upsert: true, contentType: 'image/webp' })
            if (uploadError) return toast.error("Upload failed. Try again.")
            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath)
            setEditAvatar(publicUrl)
            toast.success("Frame captured & optimized.")
        } catch { toast.error("Upload failed.") }
    }

    const MOODS = ['smiling', 'neutral', 'dead', 'peeking', 'surprised', 'crying']
    const isFollowing = currentUser?.following?.includes(profileUser?.username)
    const [followLoading, setFollowLoading] = useState(false)
    const [socialModal, setSocialModal] = useState<any>(null)
    const [socialLoading, setSocialLoading] = useState(false)

    // Progressive log rendering: reset on filter change, load more on scroll
    useEffect(() => { setVisibleLogCount(40) }, [sieve])
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


    const filteredLogs = profileLogs.filter(log => {
        if (sieve === 'all') return true
        if (sieve === 'masterpieces') return log.rating === 5
        if (sieve === 'rewatched') return log.status === 'rewatched'
        if (sieve === 'abandoned') return log.status === 'abandoned'
        if (sieve === 'companion') return !!log.watchedWith
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
        ...(isOwnProfile ? [{ id: 'calendar', label: isPremium ? '✦ The Calendar' : '🔒 The Calendar', count: null }] : []),
    ]

    return (
        <div className={`page-top ${stats.count > 50 ? 'level-obsessed' : stats.count > 10 ? 'level-degrade' : ''}`} style={{ minHeight: '100dvh' }}>
            {/* Header */}
            <div style={{ borderBottom: '1px solid var(--ash)', background: 'linear-gradient(180deg, var(--soot) 0%, var(--ink) 100%)', padding: IS_TOUCH ? '1.5rem 0 1rem' : '3rem 0 2rem', position: 'relative', overflow: 'hidden' }}>
                {profileUser?.role === 'auteur' ? <ProfileBackdrop logs={profileLogs as any[]} /> : <div style={{ position: 'absolute', inset: 0, zIndex: 0, background: 'linear-gradient(180deg, rgba(20,15,10,0.4) 0%, var(--ink) 100%)', pointerEvents: 'none' }} />}
                <div className="container" style={{ position: 'relative', zIndex: 1 }}>
                    <div className="profile-hero" style={{ display: 'flex', gap: IS_TOUCH ? '1.25rem' : '3rem', alignItems: IS_TOUCH ? 'center' : 'flex-end', flexWrap: 'wrap', flexDirection: IS_TOUCH ? 'column' : 'row' }}>
                        {/* Avatar */}
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                            <div className="profile-avatar-ring" style={{ width: IS_TOUCH ? 110 : 140, height: IS_TOUCH ? 110 : 140, borderRadius: '50%', background: 'var(--ink)', border: `2px solid ${stats.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', boxShadow: `0 0 40px ${stats.color}20`, overflow: 'hidden' }}>
                                {renderAvatar(isEditing ? editAvatar : (profileUser?.avatar || 'smiling'), 90)}
                                {isEditing && (
                                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', padding: '0.5rem' }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' }}>
                                            {MOODS.map(m => (
                                                <div key={m} onClick={() => setEditAvatar(m)} style={{ cursor: 'pointer', padding: '2px', border: `2px solid ${editAvatar === m ? 'var(--sepia)' : 'transparent'}`, borderRadius: '50%', background: editAvatar === m ? 'rgba(139,105,20,0.2)' : 'none', transition: 'all 0.2s' }}>
                                                    <Buster size={20} mood={m} />
                                                </div>
                                            ))}
                                        </div>
                                        <input type="file" ref={fileRef as any} onChange={handleFileChange} accept="image/*" capture="user" style={{ display: 'none' }} />
                                        <button className="btn btn-ghost" style={{ fontSize: '0.45rem', padding: '0.3rem 0.6rem', border: '1px solid var(--sepia)', width: 'auto' }} onClick={() => (fileRef.current as any)?.click()}><Camera size={10} style={{ marginRight: '0.2rem' }} /> UPLOAD PHOTO</button>
                                        <span style={{ fontSize: '0.35rem', color: 'var(--fog)', fontFamily: 'var(--font-ui)', textAlign: 'center' }}>CHOOSE A PERSONA OR UPLOAD A NEW FRAME</span>
                                    </div>
                                )}
                            </div>
                            <div style={{ position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)', background: 'var(--ink)', border: `1px solid ${stats.color}`, padding: '0.2rem 0.6rem', borderRadius: '2px', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: stats.color, whiteSpace: 'nowrap', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', zIndex: 2 }}>✦ {stats.level}</div>
                        </div>

                        {/* Identity */}
                        <div className="profile-identity" style={{ flex: 1, minWidth: IS_TOUCH ? 0 : 300 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: IS_TOUCH ? '0.5rem' : '1rem', marginBottom: '0.5rem', flexWrap: 'wrap', justifyContent: IS_TOUCH ? 'center' : undefined }}>
                                {isEditing ? (
                                    <input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} style={{ background: 'var(--ink)', border: '1px solid var(--sepia)', color: 'var(--parchment)', fontFamily: 'var(--font-display)', fontSize: '1.8rem', padding: '0.2rem 0.5rem', width: 'auto' }} />
                                ) : (
                                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? 'clamp(1.6rem, 6vw, 2.2rem)' : '2.5rem', color: 'var(--parchment)', lineHeight: 1.1, display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: IS_TOUCH ? 'center' : undefined, flexWrap: 'wrap', textAlign: IS_TOUCH ? 'center' as const : undefined }}>
                                        @{profileUser.username.toUpperCase()}
                                        {profileUser?.role === 'auteur' && <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--ink)', background: 'var(--blood-reel)', padding: '0.2rem 0.5rem', borderRadius: '2px', display: 'flex', alignItems: 'center', gap: '0.2rem', verticalAlign: 'middle', height: 'fit-content' }}><Star size={10} fill="currentColor" /> AUTEUR</span>}
                                    </h1>
                                )}
                                {isOwnProfile ? (
                                    <>
                                        <button onClick={() => isEditing ? handleSaveProfile() : setIsEditing(true)} className="btn btn-ghost" style={{ fontSize: '0.65rem', padding: '0.3rem 0.6rem', height: 'fit-content' }}>{isEditing ? 'SAVE DOSSIER' : 'EDIT PROFILE'}</button>
                                        {!isEditing && (
                                            <button
                                                onClick={() => exportLogsCSV(profileLogs, profileUser.username)}
                                                className="btn btn-ghost"
                                                style={{ fontSize: '0.55rem', padding: '0.3rem 0.6rem', height: 'fit-content', display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--sepia)', borderColor: 'var(--sepia)' }}
                                                title="Export your complete film archive as CSV"
                                            >
                                                <Download size={10} /> EXPORT ARCHIVE
                                            </button>
                                        )}
                                        {!isEditing && profileLogs.length >= 10 && (
                                            <Link
                                                to="/year-in-cinema"
                                                className="btn btn-ghost"
                                                style={{ fontSize: '0.55rem', padding: '0.3rem 0.6rem', height: 'fit-content', display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--flicker)', borderColor: 'var(--sepia)', textDecoration: 'none' }}
                                            >
                                                <Film size={10} /> YEAR IN CINEMA
                                            </Link>
                                        )}
                                    </>
                                ) : (
                                    <button
                                        onClick={handleFollow}
                                        disabled={followLoading}
                                        className={`btn ${isFollowing ? 'btn-ghost' : 'btn-primary'}`}
                                        style={{ fontSize: '0.65rem', padding: '0.3rem 1.2rem', height: 'fit-content', opacity: followLoading ? 0.6 : 1 }}
                                    >
                                        {followLoading ? '...' : isFollowing ? 'UNFOLLOW' : '+ FOLLOW'}
                                    </button>
                                )}
                            </div>

                            <div style={{ marginBottom: IS_TOUCH ? '1rem' : '1.5rem' }}>
                                {isEditing ? (
                                    <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} placeholder="Add your cinematic manifesto..." style={{ background: 'var(--ink)', border: '1px solid var(--ash)', color: 'var(--bone)', fontFamily: 'var(--font-body)', fontSize: '0.9rem', width: '100%', height: '80px', padding: '0.75rem', borderRadius: '4px', resize: 'none' }} />
                                ) : (
                                    <p style={{ fontFamily: 'var(--font-body)', fontSize: IS_TOUCH ? '0.9rem' : '1rem', color: 'var(--bone)', fontStyle: 'italic', maxWidth: 600, lineHeight: 1.5, opacity: profileUser.bio ? 1 : 0.5, textAlign: IS_TOUCH ? 'center' as const : undefined, margin: IS_TOUCH ? '0 auto' : undefined }}>
                                        {profileUser.bio || (isOwnProfile ? "No bio yet. Tell the society who you are." : "No bio on file.")}
                                    </p>
                                )}
                            </div>

                            {isEditing && (
                                <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: editIsSocialPrivate ? 'var(--sepia)' : 'var(--fog)', padding: '0.4rem 0.8rem', border: `1px solid ${editIsSocialPrivate ? 'var(--sepia)' : 'var(--ash)'}`, borderRadius: '2px', transition: 'all 0.2s' }}>
                                        <input type="checkbox" checked={editIsSocialPrivate} onChange={(e) => setEditIsSocialPrivate(e.target.checked)} style={{ accentColor: 'var(--sepia)' }} />
                                        {editIsSocialPrivate ? 'PRIVATE SOCIAL ARCHIVE' : 'PUBLIC SOCIAL ARCHIVE'}
                                        {editIsSocialPrivate ? <Lock size={10} /> : <Globe size={10} />}
                                    </label>
                                    <span style={{ fontSize: '0.5rem', color: 'var(--ash)', fontStyle: 'italic' }}>When private, only you can see your followers/following lists.</span>
                                </div>
                            )}

                            {/* Stats bar */}
                            <div className="profile-stats-row" style={{ display: IS_TOUCH ? 'grid' : 'flex', gridTemplateColumns: IS_TOUCH ? 'repeat(3, 1fr)' : undefined, gap: IS_TOUCH ? '1rem' : '2.5rem', borderTop: '1px solid rgba(139,105,20,0.1)', paddingTop: IS_TOUCH ? '1rem' : '1.5rem', justifyContent: IS_TOUCH ? 'center' : undefined, justifyItems: IS_TOUCH ? 'center' as const : undefined, textAlign: IS_TOUCH ? 'center' as const : undefined }}>
                                {[
                                    { value: profileLogs.length, label: 'ACTIVITY', onClick: null, icon: null },
                                    { value: isOwnProfile ? (ownCounts?.followersCount ?? (currentUser as any)?.followers_count ?? 0) : ((profileUser as any)?.followersCount || 0), label: 'FOLLOWERS', onClick: () => openSocialModal('followers'), icon: null },
                                    { value: isOwnProfile ? (ownCounts?.followingCount ?? (currentUser as any)?.following_count ?? 0) : ((profileUser as any)?.followingCount || 0), label: 'FOLLOWING', onClick: () => openSocialModal('following'), icon: null },
                                    { value: profileStubs.length, label: 'STUBS', onClick: null, icon: null },
                                    ...(streak > 0 ? [{ value: streak, label: streak >= 30 ? '🔥 OBSESSED' : streak >= 7 ? '🔥 POSSESSED' : streak >= 3 ? '🔥 DEDICATED' : '🔥 STREAK', onClick: null, icon: null }] : []),
                                ].map(({ value, label, onClick }) => (
                                    <div key={label} onClick={onClick as any} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', cursor: onClick ? 'pointer' : 'default', alignItems: IS_TOUCH ? 'center' : undefined }}>
                                        <div style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? '1.4rem' : '1.6rem', color: 'var(--sepia)' }}>{value}</div>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: IS_TOUCH ? '0.5rem' : '0.6rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>{label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Log button */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: IS_TOUCH ? '0.5rem' : '1rem', alignSelf: 'center', width: IS_TOUCH ? '100%' : undefined }}>
                            <button className="btn btn-primary" style={{ padding: IS_TOUCH ? '0.75rem 1.5rem' : '1rem 2rem', fontSize: IS_TOUCH ? '0.65rem' : '0.75rem', boxShadow: `0 0 20px ${stats.color}30`, width: IS_TOUCH ? '100%' : undefined, justifyContent: IS_TOUCH ? 'center' : undefined }} onClick={() => openLogModal()}>+ RECORD NEW LOG</button>
                            {isOwnProfile && (
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button className="btn btn-ghost" style={{ flex: 1, padding: '0.6rem', fontSize: '0.6rem' }} onClick={() => { window.location.href = '/settings' }}><Settings size={12} style={{ marginRight: '0.4rem' }} /> SETTINGS</button>
                                    <button
                                        className="btn btn-ghost"
                                        onClick={() => { useAuthStore.getState().logout(); }}
                                        style={{ padding: '0.6rem', fontSize: '0.6rem', color: 'var(--fog)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                    >
                                        <LogOut size={12} /> SIGN OUT
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ borderBottom: '1px solid var(--ash)', background: 'var(--ink)', position: 'sticky', top: 64, zIndex: 100 }}>
                <div className="container">
                    <div className="profile-tabs" style={{ display: 'flex', gap: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
                        {TABS.map((tab) => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '0.9rem 1rem', background: 'none', border: 'none', whiteSpace: 'nowrap', color: activeTab === tab.id ? 'var(--flicker)' : 'var(--fog)', borderBottom: `2px solid ${activeTab === tab.id ? 'var(--sepia)' : 'transparent'}`, transition: 'color 0.2s', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                {tab.label}
                                {tab.count !== null && <span style={{ background: activeTab === tab.id ? 'var(--sepia)' : 'var(--ash)', color: activeTab === tab.id ? 'var(--ink)' : 'var(--fog)', padding: '0.1em 0.4em', borderRadius: '2px', fontSize: '0.45rem' }}>{tab.count}</span>}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Tab Content */}
            <main style={{ padding: '2.5rem 0 5rem' }}>
                <div className="container layout-sidebar reversed">
                    <div>
                        {activeTab === 'diary' && (
                            <div>
                                <SectionHeader label="CHRONOLOGICAL" title="The Ledger" />
                                {profileLogs.length > 0 && (
                                    <div className="profile-sieve-strip" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.5rem', borderBottom: '1px solid var(--ash)' }}>
                                        {[{ id: 'all', label: 'All Logs' }, { id: 'masterpieces', label: '✦✦✦✦✦ Masterpieces' }, { id: 'rewatched', label: '↩ Rewatched' }, { id: 'abandoned', label: '✕ Abandoned' }, { id: 'companion', label: '♡ Companions' }].map(s => (
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
                                    return (
                                        <>
                                        <div className="profile-log-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gridAutoRows: 'minmax(210px, auto)', gap: '1rem' }}>
                                            {shown.map((log: any, index: number) => {
                                                let gridColumnSpan = 'span 1', gridRowSpan = 'span 1'
                                                if (sieve === 'all' && index === 0) { gridColumnSpan = 'span 2'; gridRowSpan = 'span 2' }
                                                else if (sieve === 'all' && (index === 1 || index === 2)) { gridColumnSpan = 'span 2'; gridRowSpan = 'span 1' }
                                                const hl: any = halfLifeMap[log.filmId]
                                                return (
                                                    <div
                                                        key={log.id}
                                                        onClick={() => setViewLog(log)}
                                                        style={{ gridColumn: gridColumnSpan, gridRow: gridRowSpan, position: 'relative', cursor: 'pointer' }}
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
                                        {visibleLogCount < filteredLogs.length && (
                                            <div ref={loadMoreRef} style={{ textAlign: 'center', padding: '2rem', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>
                                                LOADING MORE REELS...
                                            </div>
                                        )}
                                        </>
                                    )
                                })()}
                            </div>
                        )}

                        {activeTab === 'tickets' && (
                            <div><SectionHeader label="ADMISSION HISTORY" title="Ticket Stubs" /><TicketBooth stubs={profileStubs} /></div>
                        )}

                        {activeTab === 'projector' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                <SectionHeader label="DEVOTEE ANALYTICS" title="Projector Room" />
                                <ProfileProjectorTab profileLogs={profileLogs} profileWatchlist={profileWatchlist} profileLists={profileLists} />
                                <ProjectorRoom stats={stats} user={profileUser} />
                                {/* Nightly Programmes — merged into Projector Room */}
                                {isOwnProfile && (
                                    <>
                                        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, var(--ash), transparent)', margin: '2rem 0' }} />
                                        <SectionHeader label="CURATED FILM PAIRINGS" title="Nightly Programmes" />
                                        <ProgrammesSection {...{ programmes: currentProgrammes, user: profileUser } as any} />
                                    </>
                                )}
                            </div>
                        )}

                        {activeTab === 'passport' && (
                            <div><SectionHeader label="CINEMATIC ACHIEVEMENTS" title="The Passport" /><NoirPassport logs={profileLogs} /></div>
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
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem' }}>
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
                                <SectionHeader label="PHYSICAL MEDIA COLLECTION" title="The Archive" />
                                <PhysicalArchiveTab isOwnProfile={isOwnProfile} archive={physicalArchive} userId={profileUser?.id} />
                            </div>
                        )}

                        {activeTab === 'calendar' && (
                            <div>
                                <SectionHeader label="ARCHIVIST · VIEWING HISTORY" title="The Projectionist's Calendar" />
                                <ProjectionistCalendar {...{ logs: profileLogs, isPremium } as any} />
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

