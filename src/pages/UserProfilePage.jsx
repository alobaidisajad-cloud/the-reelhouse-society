import { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { Link, useParams } from 'react-router-dom'
import { Film, BookOpen, Star, Lock, Edit2, Camera, User, Settings, Globe, Download } from 'lucide-react'
import { useAuthStore, useFilmStore, useUIStore, useProgrammeStore } from '../store'
import { ReelRating, SectionHeader, StatCard, PersonaStamp, FilmCard, RadarChart } from '../components/UI'
import Buster from '../components/Buster'
import { tmdb } from '../tmdb'
import toast from 'react-hot-toast'

import { ShareCardOverlay } from '../components/profile/ShareCardOverlay'
import { WatchlistRoulette } from '../components/profile/WatchlistRoulette'
import { TasteDNA } from '../components/profile/TasteDNA'
import { NoirPassport } from '../components/profile/NoirPassport'
import { ProjectorRoom } from '../components/profile/ProjectorRoom'
import { TicketBooth } from '../components/profile/TicketBooth'
import { ProgrammesSection } from '../components/profile/ProgrammesSection'
import { ProjectionistCalendar } from '../components/profile/ProjectionistCalendar'

// ── CSV EXPORT ──
function exportLogsCSV(logs, username) {
    const headers = ['Title', 'Year', 'Rating', 'Status', 'Date Watched', 'Review', 'Physical Media', 'Watched With', 'Pull Quote']
    const rows = logs.map(l => [
        `"${(l.title || '').replace(/"/g, '""')}"`,
        l.year || '',
        l.rating || '',
        l.status || 'watched',
        l.watchedDate || l.createdAt?.slice(0, 10) || '',
        `"${(l.review || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
        l.physicalMedia || '',
        `"${(l.watchedWith || '').replace(/"/g, '""')}"`,
        `"${(l.pullQuote || '').replace(/"/g, '""')}"`,
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reelhouse_${username}_archive_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
}

// ── PROFILE BACKDROP ──
function ProfileBackdrop({ logs }) {
    const posters = logs.filter(l => l.poster).slice(0, 12).map(l => tmdb.poster(l.poster, 'w185'))
    if (posters.length < 4) return null
    return (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 2, overflow: 'hidden' }}>
                {posters.map((src, i) => (
                    <img key={i} src={src} alt="" decoding="async" loading="lazy"
                        style={{ flex: '1 0 auto', height: '100%', objectFit: 'cover', filter: 'sepia(0.8) brightness(0.15) contrast(1.2)', transform: `rotate(${(i % 3 - 1) * 0.5}deg) scale(1.04)` }} />
                ))}
            </div>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,7,3,0.5) 0%, rgba(10,7,3,0.85) 60%, var(--ink) 100%)' }} />
        </div>
    )
}

// ── FILM LOG ROW ──
function FilmLogRow({ log, onShare }) {
    const isAbandoned = log.status === 'abandoned'
    return (
        <div className={`card ${isAbandoned ? 'log-abandoned' : ''}`} style={{ padding: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <div style={{ width: 44, height: 66, flexShrink: 0, borderRadius: 'var(--radius-card)', overflow: 'hidden', background: 'var(--ash)' }}>
                {(log.altPoster || log.poster) ? (
                    <img src={tmdb.poster(log.altPoster || log.poster, 'w92')} alt={log.title} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.3)' }} />
                ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fog)' }}><Film size={16} /></div>
                )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div>
                        <Link to={`/film/${log.filmId}`} style={{ fontFamily: 'var(--font-sub)', fontSize: '0.85rem', color: 'var(--parchment)', textDecoration: 'none' }}>{log.title}</Link>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--fog)', marginTop: '0.15rem' }}>
                            {log.year} · {new Date(log.watchedDate || log.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                    </div>
                    <div style={{ flexShrink: 0 }}><ReelRating value={log.rating} size="sm" /></div>
                </div>
                <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className={`tag ${log.status === 'rewatched' ? 'tag-vibe' : ''}`} style={{ fontSize: '0.5rem' }}>
                            {log.status === 'watched' ? '✓ WATCHED' : log.status === 'rewatched' ? '↩ REWATCHED' : `✕ ABANDONED${log.abandonedReason ? ` — ${log.abandonedReason}` : ''}`}
                        </span>
                        {log.watchedWith && <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.08em', color: 'var(--fog)' }}>♡ with {log.watchedWith}</span>}
                        {log.physicalMedia && <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--sepia)', border: '1px solid var(--sepia)', background: 'rgba(139,105,20,0.1)', padding: '0.1rem 0.3rem', borderRadius: '2px', display: 'flex', alignItems: 'center', gap: '0.2rem' }}><BookOpen size={8} /> {log.physicalMedia}</span>}
                    </div>
                    {onShare && <button onClick={() => onShare(log)} className="btn btn-ghost" style={{ fontSize: '0.5rem', padding: '0.1rem 0.4rem' }}>SHARE</button>}
                </div>
                {log.pullQuote && <div style={{ marginTop: '0.75rem', marginBottom: '0.75rem', paddingLeft: '0.75rem', borderLeft: '3px solid var(--sepia)', fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--sepia)', fontStyle: 'italic', lineHeight: 1.2 }}>"{log.pullQuote}"</div>}
                {log.review && <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--fog)', fontStyle: 'italic', marginTop: '0.4rem', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{log.review}</p>}
                {log.isAutopsied && log.autopsy && <div style={{ display: 'flex', justifyContent: 'flex-start' }}><RadarChart autopsy={log.autopsy} size={140} /></div>}
                {log.privateNotes && (
                    <div style={{ marginTop: '0.75rem', padding: '0.5rem', background: 'rgba(212, 185, 117, 0.05)', borderRadius: '2px', borderLeft: '2px solid var(--sepia)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--sepia)', marginBottom: '0.2rem' }}><Lock size={10} /> THE CUTTING ROOM FLOOR (PRIVATE)</div>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)', margin: 0, fontStyle: 'italic' }}>{log.privateNotes}</p>
                    </div>
                )}
            </div>
        </div>
    )
}

function LazyLogRow({ log, onShare }) {
    const ref = useRef(null)
    const [visible, setVisible] = useState(false)
    useEffect(() => {
        const el = ref.current
        if (!el) return
        const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } }, { rootMargin: '200px' })
        observer.observe(el)
        return () => observer.disconnect()
    }, [])
    return <div ref={ref} style={{ minHeight: visible ? 'auto' : 88 }}>{visible && <FilmLogRow log={log} onShare={onShare} />}</div>
}

// ── VAULT SECTION ──
function VaultSection({ vault, user }) {
    const isPremiumVault = user?.role === 'archivist' || user?.role === 'auteur'
    return (
        <div className="vault-box" style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--parchment)', marginTop: '0.5rem' }}>THE VAULT</div>
                <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.75rem', color: 'var(--fog)', marginTop: '0.25rem' }}>{vault.length} TITLES WITHIN</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--fog)', marginTop: '0.5rem', fontStyle: 'italic' }}>Private. Mysterious. Yours alone.</div>
            </div>
        </div>
    )
}

// ── LISTS SECTION ──
function ListsSection({ lists, user }) {
    const [posterMode, setPosterMode] = useState(null)
    const { isAuthenticated } = useAuthStore()
    if (!isAuthenticated) return <div style={{ textAlign: 'center', padding: '2rem', border: '1px dashed var(--ash)', borderRadius: 'var(--radius-card)' }}><p style={{ fontFamily: 'var(--font-sub)', color: 'var(--fog)', fontSize: '0.85rem' }}>Sign in to create and manage your lists</p></div>
    if (posterMode) {
        return (
            <div className="poster-export-view" style={{ position: 'fixed', inset: 0, zIndex: 100005, background: 'var(--ink)', padding: '4rem', display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto' }}>
                <button onClick={() => setPosterMode(null)} className="btn btn-ghost" style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 100006 }}>✕ CLOSE POSTER</button>
                <div className="card" style={{ width: '100%', maxWidth: '800px', padding: '4rem', border: '4px double var(--sepia)', background: 'var(--soot)', display: 'flex', flexDirection: 'column', gap: '3rem' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8rem', letterSpacing: '0.5em', color: 'var(--sepia)', marginBottom: '1rem' }}>REELHOUSE ARCHIVE NO. {posterMode.id.toString().slice(0, 6)}</div>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '3.5rem', color: 'var(--parchment)', marginBottom: '1rem' }}>{posterMode.title.toUpperCase()}</h1>
                        <div style={{ fontFamily: 'var(--font-sub)', fontSize: '1rem', color: 'var(--fog)', letterSpacing: '0.2em' }}>CURATED BY @{user.username}</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
                        {posterMode.films.map(film => (
                            <div key={film.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <img src={tmdb.poster(film.poster_path, 'w185')} style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', border: '1px solid var(--ash)' }} />
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{film.title.toUpperCase()}</div>
                            </div>
                        ))}
                    </div>
                    <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid var(--ash)', paddingTop: '2rem' }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--sepia)', opacity: 0.5 }}>REELHOUSE</div>
                        <div style={{ textAlign: 'right', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>GENERATED {new Date().toLocaleDateString()}<br />{posterMode.films.length} TITLES IN SEQUENCE</div>
                    </div>
                </div>
            </div>
        )
    }
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {lists.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--fog)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>No lists yet. The stacks are empty.</div>
            ) : lists.map((list) => (
                <motion.div key={list.id} className="card" style={{ padding: 0, overflow: 'hidden' }} whileHover={{ y: -2, transition: { type: 'spring', damping: 14 } }}>
                    <div style={{ display: 'flex', gap: 2, height: 64, overflow: 'hidden' }}>
                        {list.films.length > 0 ? list.films.slice(0, 4).map((f, i) => (
                            <div key={i} style={{ flex: 1, overflow: 'hidden' }}>
                                {f.poster ? <img src={tmdb.poster(f.poster, 'w92')} alt="" decoding="async" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.4) brightness(0.7)' }} /> : <div style={{ width: '100%', height: '100%', background: 'var(--ash)' }} />}
                            </div>
                        )) : <div style={{ flex: 1, background: 'linear-gradient(135deg, var(--soot), var(--ash))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.2em' }}>EMPTY REEL</span></div>}
                    </div>
                    <div style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--parchment)' }}>{list.title}</div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--fog)', marginTop: '0.2rem' }}>{list.films.length} FILMS · {list.isPrivate ? '⊠ PRIVATE' : '◎ PUBLIC'}</div>
                            </div>
                            <button onClick={() => setPosterMode(list)} className="btn btn-ghost" style={{ fontSize: '0.5rem', padding: '0.3rem 0.6rem' }}>POSTER</button>
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    )
}

// ── MAIN PAGE ──
export default function UserProfilePage() {
    const { username: routeUsername } = useParams()
    const queryClient = useQueryClient()
    const { user: currentUser, isAuthenticated, updateUser, community } = useAuthStore()
    const { logs: currentLogs, watchlist: currentWatchlist, lists: currentLists, stubs: currentStubs, getCinephileStats } = useFilmStore()
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
                .select('id, username, role, bio, avatar_url, followers_count, following_count, is_social_private, created_at, tier')
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
                createdAt: data.created_at,
            }
        },
        enabled: !isOwnProfile && !!routeUsername,
        staleTime: 1000 * 60 * 5,
    })

    const profileUser = isOwnProfile ? currentUser : fetchedProfile

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
            return (data || []).map(l => ({
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
                // private_notes intentionally excluded — never visible to other users
            }))
        },
        enabled: !isOwnProfile && !!routeUsername,
        staleTime: 1000 * 60 * 5,
    })
    const [activeTab, setActiveTab] = useState('diary')
    const [shareLog, setShareLog] = useState(null)
    const [sieve, setSieve] = useState('all')
    const [isEditing, setIsEditing] = useState(false)
    const [editBio, setEditBio] = useState(profileUser?.bio || '')
    const [editUsername, setEditUsername] = useState(profileUser?.username || '')
    const [editAvatar, setEditAvatar] = useState(profileUser?.avatar || 'smiling')
    const [editIsSocialPrivate, setEditIsSocialPrivate] = useState(profileUser?.isSocialPrivate || false)

    useEffect(() => {
        if (profileUser) { setEditAvatar(profileUser.avatar || 'smiling'); setEditIsSocialPrivate(profileUser.isSocialPrivate || false) }
    }, [profileUser])

    const handleSaveProfile = () => {
        updateUser({ bio: editBio, username: editUsername, avatar: editAvatar, isSocialPrivate: editIsSocialPrivate })
        setIsEditing(false)
        toast.success("Identity updated.")
    }

    const handleFileChange = async (e) => {
        const file = e.target.files[0]
        if (!file) return
        if (!file.type.startsWith('image/')) return toast.error("Only archival image formats supported.")
        if (file.size > 2 * 1024 * 1024) return toast.error("Frame too large. Max 2MB.")
        try {
            const userId = currentUser?.id
            if (!userId) return toast.error("Must be signed in.")
            const ext = file.name.split('.').pop()
            const filePath = `${userId}/avatar.${ext}`
            const { supabase } = await import('../supabaseClient')
            const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true })
            if (uploadError) return toast.error("Upload failed. Try again.")
            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath)
            setEditAvatar(publicUrl)
            toast.success("Frame captured.")
        } catch { toast.error("Upload failed.") }
    }

    const MOODS = ['smiling', 'neutral', 'dead', 'peeking', 'surprised', 'crying']
    const isFollowing = currentUser?.following?.includes(profileUser?.username)
    const [followLoading, setFollowLoading] = useState(false)
    const [socialModal, setSocialModal] = useState(null)
    const [socialLoading, setSocialLoading] = useState(false)

    const openSocialModal = async (type) => {
        setSocialLoading(true)
        setSocialModal({ title: type === 'followers' ? 'Followers' : 'Following', list: [] })
        try {
            if (type === 'followers') {
                // Step 1: get IDs of people who follow this profile
                const { data: rows } = await supabase
                    .from('interactions')
                    .select('user_id')
                    .eq('target_user_id', profileUser.id)
                    .eq('type', 'follow')
                    .limit(100)
                const ids = (rows || []).map(r => r.user_id)
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
                    .eq('user_id', profileUser.id)
                    .eq('type', 'follow')
                    .limit(100)
                const ids = (rows || []).map(r => r.target_user_id)
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
        } catch { setSocialModal(prev => prev ? { ...prev, list: [] } : null) }
        finally { setSocialLoading(false) }
    }

    const handleFollow = async () => {
        if (!currentUser) { openSignupModal(); return }
        if (followLoading || isOwnProfile) return
        setFollowLoading(true)
        try {
            if (isFollowing) {
                // Update local state FIRST so UI responds immediately
                updateUser({ following: (currentUser.following || []).filter(u => u !== profileUser.username) })
                queryClient.setQueryData(['profile-by-username', routeUsername], (old) =>
                    old ? { ...old, followersCount: Math.max(0, (old.followersCount || 1) - 1) } : old
                )
                toast.success(`Unfollowed @${profileUser.username}`)
                // Then fire DB ops in background
                supabase.from('interactions').delete()
                    .eq('user_id', currentUser.id)
                    .eq('target_user_id', profileUser.id)
                    .eq('type', 'follow').catch(() => {})
                supabase.rpc('decrement_follow_counts', {
                    follower_id: currentUser.id,
                    followed_id: profileUser.id
                }).catch(() => {})
            } else {
                // Update local state FIRST so UI responds immediately
                updateUser({ following: [...(currentUser.following || []), profileUser.username] })
                queryClient.setQueryData(['profile-by-username', routeUsername], (old) =>
                    old ? { ...old, followersCount: (old.followersCount || 0) + 1 } : old
                )
                toast.success(`Now following @${profileUser.username} ✦`)
                // Then fire DB ops in background
                supabase.from('interactions').insert({
                    user_id: currentUser.id,
                    target_user_id: profileUser.id,
                    type: 'follow'
                }).catch(() => {})
                supabase.rpc('increment_follow_counts', {
                    follower_id: currentUser.id,
                    followed_id: profileUser.id
                }).catch(() => {})
                supabase.from('notifications').insert({
                    user_id: profileUser.id,
                    type: 'follow',
                    from_username: currentUser.username,
                    message: `@${currentUser.username} is now following you.`,
                }).catch(() => {})
            }
        } catch (err) {
            console.error('Follow error:', err)
            toast.error('Something went wrong.')
        } finally {
            setFollowLoading(false)
        }
    }

    const renderAvatar = (avatarValue, size = 90) => {
        if (!avatarValue) return <Buster size={size} mood="smiling" />
        if (avatarValue.startsWith('data:image/') || avatarValue.startsWith('http')) return <img src={avatarValue} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
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
        const byFilm = {}
        for (const log of profileLogs) {
            if (!log.filmId || !log.rating) continue
            if (!byFilm[log.filmId]) byFilm[log.filmId] = []
            byFilm[log.filmId].push({ rating: log.rating, date: log.createdAt || log.watchedDate })
        }
        const result = {}
        for (const [filmId, entries] of Object.entries(byFilm)) {
            if (entries.length < 2) continue
            const sorted = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date))
            const first = sorted[0].rating, last = sorted[sorted.length - 1].rating
            result[filmId] = { count: entries.length, trajectory: last > first ? 'ASCENDING' : last < first ? 'DECAYING' : 'ETERNAL', delta: last - first }
        }
        return result
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
        ...(isOwnProfile && currentProgrammes.length >= 0 ? [{ id: 'programmes', label: 'Nightly Programmes', count: currentProgrammes.length > 0 ? currentProgrammes.length : null }] : []),
        ...(isOwnProfile ? [{ id: 'calendar', label: isPremium ? '✦ The Calendar' : '🔒 The Calendar', count: null }] : []),
    ]

    return (
        <div className={`page-top ${stats.count > 50 ? 'level-obsessed' : stats.count > 10 ? 'level-degrade' : ''}`} style={{ minHeight: '100vh' }}>
            {/* Header */}
            <div style={{ borderBottom: '1px solid var(--ash)', background: 'linear-gradient(180deg, var(--soot) 0%, var(--ink) 100%)', padding: '3rem 0 2rem', position: 'relative', overflow: 'hidden' }}>
                {profileUser?.role === 'auteur' ? <ProfileBackdrop logs={profileLogs} /> : <div style={{ position: 'absolute', inset: 0, zIndex: 0, background: 'linear-gradient(180deg, rgba(20,15,10,0.4) 0%, var(--ink) 100%)', pointerEvents: 'none' }} />}
                <div className="container" style={{ position: 'relative', zIndex: 1 }}>
                    <div className="profile-hero" style={{ display: 'flex', gap: '3rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        {/* Avatar */}
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                            <div style={{ width: 140, height: 140, borderRadius: '50%', background: 'var(--ink)', border: `2px solid ${stats.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', boxShadow: `0 0 40px ${stats.color}20`, overflow: 'hidden' }}>
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
                                        <input type="file" ref={fileRef} onChange={handleFileChange} accept="image/*" capture="user" style={{ display: 'none' }} />
                                        <button className="btn btn-ghost" style={{ fontSize: '0.45rem', padding: '0.3rem 0.6rem', border: '1px solid var(--sepia)', width: 'auto' }} onClick={() => fileRef.current?.click()}><Camera size={10} style={{ marginRight: '0.2rem' }} /> UPLOAD PHOTO</button>
                                        <span style={{ fontSize: '0.35rem', color: 'var(--fog)', fontFamily: 'var(--font-ui)', textAlign: 'center' }}>CHOOSE A PERSONA OR UPLOAD A NEW FRAME</span>
                                    </div>
                                )}
                            </div>
                            <div style={{ position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)', background: 'var(--ink)', border: `1px solid ${stats.color}`, padding: '0.2rem 0.6rem', borderRadius: '2px', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: stats.color, whiteSpace: 'nowrap', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', zIndex: 2 }}>✦ {stats.level}</div>
                        </div>

                        {/* Identity */}
                        <div style={{ flex: 1, minWidth: 300 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                                {isEditing ? (
                                    <input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} style={{ background: 'var(--ink)', border: '1px solid var(--sepia)', color: 'var(--parchment)', fontFamily: 'var(--font-display)', fontSize: '1.8rem', padding: '0.2rem 0.5rem', width: 'auto' }} />
                                ) : (
                                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', color: 'var(--parchment)', lineHeight: 1, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        @{profileUser.username.toUpperCase()}
                                        {profileUser?.role === 'auteur' && <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--ink)', background: 'var(--blood-reel)', padding: '0.2rem 0.5rem', borderRadius: '2px', display: 'flex', alignItems: 'center', gap: '0.2rem', verticalAlign: 'middle', height: 'fit-content' }}><Star size={10} fill="currentColor" /> AUTEUR</span>}
                                    </h1>
                                )}
                                {isOwnProfile ? (
                                    <>
                                        <button onClick={() => isEditing ? handleSaveProfile() : setIsEditing(true)} className="btn btn-ghost" style={{ fontSize: '0.65rem', padding: '0.3rem 0.6rem', height: 'fit-content' }}>{isEditing ? 'SAVE DOSSIER' : 'EDIT PROFILE'}</button>
                                        {!isEditing && isPremium && (
                                            <button
                                                onClick={() => exportLogsCSV(profileLogs, profileUser.username)}
                                                className="btn btn-ghost"
                                                style={{ fontSize: '0.55rem', padding: '0.3rem 0.6rem', height: 'fit-content', display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--sepia)', borderColor: 'var(--sepia)' }}
                                                title="Export your complete film archive as CSV"
                                            >
                                                <Download size={10} /> EXPORT ARCHIVE
                                            </button>
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

                            <div style={{ marginBottom: '1.5rem' }}>
                                {isEditing ? (
                                    <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} placeholder="Add your cinematic manifesto..." style={{ background: 'var(--ink)', border: '1px solid var(--ash)', color: 'var(--bone)', fontFamily: 'var(--font-body)', fontSize: '0.9rem', width: '100%', height: '80px', padding: '0.75rem', borderRadius: '4px', resize: 'none' }} />
                                ) : (
                                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '1rem', color: 'var(--bone)', fontStyle: 'italic', maxWidth: 600, lineHeight: 1.5, opacity: profileUser.bio ? 1 : 0.5 }}>
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
                            <div className="profile-stats-row" style={{ display: 'flex', gap: '2.5rem', borderTop: '1px solid rgba(139,105,20,0.1)', paddingTop: '1.5rem' }}>
                                {[
                                    { value: profileLogs.length, label: 'ACTIVITY', onClick: null },
                                    { value: isOwnProfile ? (currentUser?.followers_count || 0) : (profileUser?.followersCount || 0), label: 'FOLLOWERS', onClick: () => openSocialModal('followers') },
                                    { value: isOwnProfile ? (currentUser?.following_count || 0) : (profileUser?.followingCount || 0), label: 'FOLLOWING', onClick: () => openSocialModal('following') },
                                    { value: profileStubs.length, label: 'STUBS', onClick: null },
                                ].map(({ value, label, onClick }) => (
                                    <div key={label} onClick={onClick} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', cursor: onClick ? 'pointer' : 'default' }}>
                                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', color: 'var(--sepia)' }}>{value}</div>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>{label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Log button */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignSelf: 'center' }}>
                            <button className="btn btn-primary" style={{ padding: '1rem 2rem', fontSize: '0.75rem', boxShadow: `0 0 20px ${stats.color}30` }} onClick={() => openLogModal()}>+ RECORD NEW LOG</button>
                            {isOwnProfile && (
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button className="btn btn-ghost" style={{ flex: 1, padding: '0.6rem', fontSize: '0.6rem' }}><Settings size={12} style={{ marginRight: '0.4rem' }} /> SETTINGS</button>
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
                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.5rem', borderBottom: '1px solid var(--ash)' }}>
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
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gridAutoRows: 'minmax(210px, auto)', gap: '1rem' }}>
                                        {filteredLogs.map((log, index) => {
                                            let gridColumnSpan = 'span 1', gridRowSpan = 'span 1'
                                            if (sieve === 'all' && index === 0) { gridColumnSpan = 'span 2'; gridRowSpan = 'span 2' }
                                            else if (sieve === 'all' && (index === 1 || index === 2)) { gridColumnSpan = 'span 2'; gridRowSpan = 'span 1' }
                                            const hl = halfLifeMap[log.filmId]
                                            return (
                                                <div key={log.id} style={{ gridColumn: gridColumnSpan, gridRow: gridRowSpan, position: 'relative', height: '100%' }}>
                                                    <FilmCard film={{ id: log.filmId, title: log.title, poster_path: log.altPoster || log.poster, release_date: log.year + '-01-01', userRating: log.rating, status: log.status }}
                                                        onClick={() => {
                                                            if (isOwnProfile) {
                                                                if (currentUser?.role === 'archivist' || currentUser?.role === 'auteur') {
                                                                    useUIStore.getState().setLogModalFilm({ id: log.filmId, title: log.title, poster_path: log.poster, release_date: log.year + '-01-01' })
                                                                    useUIStore.getState().setLogModalEditLogId(log.id)
                                                                    useUIStore.getState().openLogModal()
                                                                } else { openSignupModal('archivist'); toast("The Splicer requires Archivist clearance.", { icon: '🔒', style: { background: 'var(--soot)', color: 'var(--sepia)', border: '1px solid var(--sepia)' } }) }
                                                            }
                                                        }}
                                                        disableHover={false} />
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
                                )}
                            </div>
                        )}

                        {activeTab === 'tickets' && (
                            <div><SectionHeader label="ADMISSION HISTORY" title="Ticket Stubs" /><TicketBooth stubs={profileStubs} /></div>
                        )}

                        {activeTab === 'projector' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                <SectionHeader label="DEVOTEE ANALYTICS" title="Projector Room" />
                                {profileLogs.length > 0 && (() => {
                                    const ratingBuckets = [1, 2, 3, 4, 5].map(r => ({ star: r, count: profileLogs.filter(l => Math.round(l.rating) === r).length }))
                                    const maxRatingCount = Math.max(...ratingBuckets.map(b => b.count), 1)
                                    const decadeBuckets = {}
                                    profileLogs.forEach(l => { if (!l.year) return; const decade = Math.floor(l.year / 10) * 10; decadeBuckets[decade] = (decadeBuckets[decade] || 0) + 1 })
                                    const decades = Object.entries(decadeBuckets).sort(([a], [b]) => +a - +b)
                                    const maxDecadeCount = Math.max(...Object.values(decadeBuckets), 1)
                                    const totalHours = Math.floor(profileLogs.length * 115 / 60)
                                    return (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                                            <div className="card" style={{ padding: '1.75rem' }}>
                                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1.25rem' }}>RATINGS REGISTER</div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                                    {ratingBuckets.reverse().map(({ star, count }) => (
                                                        <div key={star} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--flicker)', width: 28, flexShrink: 0, textAlign: 'right' }}>{'✦'.repeat(star)}</div>
                                                            <div style={{ flex: 1, height: 6, background: 'var(--ash)', borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 3, width: `${(count / maxRatingCount) * 100}%`, background: 'linear-gradient(90deg, var(--sepia), var(--flicker))', transition: 'width 0.6s ease' }} /></div>
                                                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', width: 20, textAlign: 'right', flexShrink: 0 }}>{count}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="card" style={{ padding: '1.75rem' }}>
                                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1.25rem' }}>ERA DISTRIBUTION</div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                                    {decades.map(([decade, count]) => (
                                                        <div key={decade} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', width: 38, flexShrink: 0 }}>{decade}s</div>
                                                            <div style={{ flex: 1, height: 6, background: 'var(--ash)', borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 3, width: `${(count / maxDecadeCount) * 100}%`, background: 'linear-gradient(90deg, var(--blood-reel), var(--sepia))', transition: 'width 0.6s ease' }} /></div>
                                                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', width: 20, textAlign: 'right', flexShrink: 0 }}>{count}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="card" style={{ padding: '1.75rem' }}>
                                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1.25rem' }}>CATALOG METRICS</div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                                                    {[{ label: 'ESTIMATED RUNTIME', value: `${totalHours.toLocaleString()} hrs` }, { label: 'TOTAL FILMS LOGGED', value: profileLogs.length }, { label: 'WATCHLIST QUEUED', value: profileWatchlist.length }, { label: 'LISTS CURATED', value: profileLists.length }, { label: 'RATED 5 REELS', value: profileLogs.filter(l => l.rating === 5).length }, { label: 'WRITTEN REVIEWS', value: profileLogs.filter(l => l.review?.length > 10).length }].map(({ label, value }) => (
                                                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.5rem' }}>
                                                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>{label}</span>
                                                            <span style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--bone)' }}>{value}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })()}
                                <ProjectorRoom stats={stats} user={profileUser} />
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
                                        <WatchlistRoulette watchlist={profileWatchlist} />
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem' }}>
                                            {profileWatchlist.map((film) => (
                                                <Link key={film.id} to={`/film/${film.id}`}>
                                                    <motion.div whileHover={{ y: -3, transition: { type: 'spring', damping: 12 } }}><FilmCard film={film} /></motion.div>
                                                </Link>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {activeTab === 'programmes' && (
                            <div><SectionHeader label="CURATED FILM PAIRINGS" title="Nightly Programmes" /><ProgrammesSection programmes={currentProgrammes} user={profileUser} /></div>
                        )}

                        {activeTab === 'calendar' && (
                            <div>
                                <SectionHeader label="ARCHIVIST · VIEWING HISTORY" title="The Projectionist's Calendar" />
                                <ProjectionistCalendar logs={profileLogs} isPremium={isPremium} />
                            </div>
                        )}
                    </div>

                    {/* Sidebar */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <TasteDNA logs={profileLogs} />
                        <VaultSection vault={isOwnProfile ? currentWatchlist : []} user={profileUser} logs={profileLogs} />
                        {profileLogs.filter(l => l.rating >= 4).length > 0 && (
                            <div className="card">
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.75rem' }}>YOUR FAVOURITES</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {profileLogs.filter(l => l.rating >= 4).slice(0, 4).map((log) => (
                                        <Link key={log.id} to={`/film/${log.filmId}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
                                            {log.poster && <img src={tmdb.poster(log.poster, 'w92')} alt={log.title} style={{ width: 28, height: 42, objectFit: 'cover', borderRadius: '2px', filter: 'sepia(0.3)', flexShrink: 0 }} />}
                                            <div>
                                                <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.75rem', color: 'var(--parchment)', lineHeight: 1.2 }}>{log.title}</div>
                                                <ReelRating value={log.rating} size="sm" />
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Social Modal — fetches from interactions table */}
            {socialModal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1000000, background: 'rgba(10,7,3,0.98)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', backdropFilter: 'blur(10px)' }} onClick={() => setSocialModal(null)}>
                    <div className="card" style={{ maxWidth: 440, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--sepia)', padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--ash)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--parchment)' }}>{socialModal.title.toUpperCase()}</h3>
                            <button className="btn btn-ghost" onClick={() => setSocialModal(null)}>✕</button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                            {socialLoading ? (
                                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em' }}>✦ LOADING ✦</div>
                            ) : socialModal.list.length === 0 ? (
                                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--fog)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>This archive is empty.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {socialModal.list.map(member => (
                                        <Link key={member.username} to={`/user/${member.username}`} onClick={() => setSocialModal(null)} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', textDecoration: 'none', borderRadius: '4px' }}>
                                            <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--ash)', background: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {member.avatar_url?.startsWith('http') ? <img src={member.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Buster size={20} mood={member.avatar_url || 'smiling'} />}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', color: 'var(--parchment)', lineHeight: 1 }}>@{member.username.toUpperCase()}</div>
                                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--sepia)', letterSpacing: '0.1em', marginTop: '0.2rem' }}>{member.followers_count || 0} FOLLOWERS</div>
                                            </div>
                                            <div style={{ color: 'var(--fog)' }}>→</div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <ShareCardOverlay log={shareLog} user={profileUser} onClose={() => setShareLog(null)} />
        </div>
    )
}

