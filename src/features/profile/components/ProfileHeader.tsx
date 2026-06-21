import { Link, useNavigate } from 'react-router-dom'
import { Star, Lock, Settings, ChevronLeft } from 'lucide-react'
import Buster from '../../../components/Buster'
import { ProfileBackdrop } from '../../../components/profile/LedgerHelpers'
import { ProfileTriptych } from '../../../components/profile/ProfileTriptych'
import { ReelRating } from '../../../components/UI'
import { useViewport } from '../../../hooks/useViewport'

interface ProfileHeaderProps {
    profileUser: any
    currentUser: any
    isOwnProfile: boolean
    activeTab: string | null
    stats: { count: number; level: string; color: string; progress: number }
    ownCounts?: { followersCount: number; followingCount: number }
    profileLogs: any[]
    profileWatchlist: any[]
    isArchivistPlus: boolean
    isFollowing: boolean
    isRequested?: boolean
    isSocialPrivate?: boolean
    isPrivacyBlocked?: boolean
    followLoading: boolean
    handleFollow: () => void
    openSocialModal: (type: string) => void
}

export function ProfileHeader({
    profileUser,
    currentUser,
    isOwnProfile,
    activeTab,
    stats,
    ownCounts,
    profileLogs,
    profileWatchlist,
    isArchivistPlus,
    isFollowing,
    isRequested,
    isSocialPrivate,
    isPrivacyBlocked,
    followLoading,
    handleFollow,
    openSocialModal
}: ProfileHeaderProps) {
    const { isTouch: IS_TOUCH } = useViewport()
    const navigate = useNavigate()

    const renderAvatar = (avatarValue: any, size = 90) => {
        if (!avatarValue || typeof avatarValue !== 'string') return <Buster size={size} mood="smiling" />
        if (avatarValue.startsWith('http') || avatarValue.startsWith('data:image/') || avatarValue.startsWith('blob:')) {
            return <img src={avatarValue} alt="User avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        }
        return <Buster size={size} mood={avatarValue} />
    }

    if (!activeTab) {
        return (
            <div style={{ borderBottom: '1px solid rgba(139,105,20,0.15)', background: 'linear-gradient(180deg, rgba(15,10,5,1) 0%, var(--ink) 100%)', padding: IS_TOUCH ? '2rem 0 1.5rem' : '4.5rem 0 3rem', position: 'relative', overflow: 'hidden' }}>
                {/* Atmospheric projector spotlight */}
                <div style={{ position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)', width: '80%', height: '120%', background: 'radial-gradient(ellipse at top, rgba(139,105,20,0.18) 0%, rgba(139,105,20,0.05) 35%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />
                
                {/* Film grain texture */}
                <div style={{ position: 'absolute', inset: 0, opacity: 0.03, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")', backgroundSize: '128px 128px', pointerEvents: 'none', zIndex: 0 }} />
                
                {/* Bottom gold edge */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent 10%, rgba(139,105,20,0.35) 50%, transparent 90%)', pointerEvents: 'none', zIndex: 0 }} />
                
                {/* Auteur backdrop or dark base */}
                {profileUser?.role === 'auteur' ? <ProfileBackdrop logs={profileLogs as any[]} user={profileUser} /> : <div style={{ position: 'absolute', inset: 0, zIndex: 0, background: 'linear-gradient(180deg, rgba(20,15,10,0.3) 0%, var(--ink) 100%)', pointerEvents: 'none' }} />}
                
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? 'clamp(1.3rem, 6vw, 2.2rem)' : '3rem', color: 'var(--parchment)', lineHeight: 1.1, textShadow: '0 2px 20px rgba(0,0,0,0.5)' }}>
                            @{profileUser.username.toUpperCase()}
                        </h1>
                        {profileUser?.role === 'auteur' && <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--ink)', background: 'var(--blood-reel)', padding: '0.2rem 0.5rem', borderRadius: '2px', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', whiteSpace: 'nowrap' }}><Star size={9} fill="currentColor" /> AUTEUR</span>}
                    </div>

                    {/* ── Follow / Settings ── */}
                    <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        {isOwnProfile ? (
                            <>
                                <button onClick={() => navigate('/edit-profile')} className="btn btn-ghost" style={{ padding: '0.4rem 1rem', border: '1px solid rgba(139,105,20,0.25)', background: 'rgba(15, 10, 5, 0.65)', backdropFilter: 'blur(12px)', color: 'var(--sepia)', fontSize: '0.6rem', letterSpacing: '0.15em', gap: '0.4rem' }}>
                                    EDIT PROFILE
                                </button>
                                <button onClick={() => navigate('/settings')} className="btn btn-ghost" style={{ padding: '0.4rem 0.6rem', border: '1px solid rgba(139,105,20,0.15)', background: 'rgba(15, 10, 5, 0.65)', backdropFilter: 'blur(12px)', color: 'var(--fog)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Settings">
                                    <Settings size={14} />
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={handleFollow}
                                disabled={followLoading || isRequested}
                                className={`btn ${isFollowing || isRequested ? 'btn-ghost' : 'btn-primary'}`}
                                style={{ fontSize: '0.65rem', padding: '0.5rem 2rem', opacity: followLoading ? 0.6 : 1, letterSpacing: '0.15em' }}
                            >
                                {followLoading ? '...' : isFollowing ? 'UNFOLLOW' : isRequested ? 'REQUESTED' : isSocialPrivate ? '+ REQUEST' : '+ FOLLOW'}
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
                        gridTemplateColumns: IS_TOUCH ? 'repeat(auto-fit, minmax(75px, 1fr))' : 'repeat(4, auto)',
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
                        <ProfileTriptych user={profileUser} isOwnProfile={isOwnProfile} userRole={profileUser?.role} />
                    </div>
                </div>
                

                {/* Recently Watched — 3 latest film logs */}
                {!isPrivacyBlocked && (() => {
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
                            <div style={{ maxWidth: 450, margin: '0 auto' }}>
                                <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(139,105,20,0.2), transparent)', marginBottom: '1.25rem' }} />
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.35em', color: 'var(--sepia)', textAlign: 'center', marginBottom: '0.75rem', textShadow: '0 0 15px rgba(139,105,20,0.3)' }}>✦ RECENTLY WATCHED ✦</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                                {recentLogs.map((log: any) => (
                                    <Link
                                        key={log.id || log.filmId}
                                        to={`/film/${log.filmId}`}
                                        style={{ textDecoration: 'none', display: 'block' }}
                                    >
                                        <div className={isArchivistPlus && profileUser?.role === 'archivist' ? 'archivist-card-glow' : isArchivistPlus && (profileUser?.role === 'auteur') ? 'auteur-card-glow' : ''} style={{
                                            position: 'relative',
                                            aspectRatio: '2/3',
                                            borderRadius: '6px',
                                            overflow: 'hidden',
                                            border: '1px solid rgba(139,105,20,0.2)',
                                            boxShadow: '0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(242,232,160,0.1)',
                                            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                                        }}
                                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 15px 40px rgba(0,0,0,0.7), 0 0 20px rgba(139,105,20,0.2)' }}
                                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(242,232,160,0.1)' }}
                                        >
                                            <img
                                                src={`https://image.tmdb.org/t/p/w185${log.altPoster || log.poster}`}
                                                alt={log.title}
                                                loading="lazy"
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9 }}
                                            />
                                            {/* Bottom gradient for overlaid text */}
                                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%', background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)', pointerEvents: 'none' }} />
                                            {/* Rating inside card */}
                                            {log.rating > 0 && (
                                                <div style={{ position: 'absolute', bottom: '0.4rem', left: '0.4rem', zIndex: 1 }}>
                                                    <ReelRating value={log.rating} size="sm" />
                                                </div>
                                            )}
                                            {/* Time ago inside card */}
                                            <div style={{ position: 'absolute', bottom: '0.4rem', right: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.4rem', letterSpacing: '0.1em', color: 'var(--fog)', opacity: 0.8, zIndex: 1 }}>
                                                {timeAgo(log.watchedDate || log.createdAt)}
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                            </div>
                    )
                })()}

                </div>
        )
    }

    return (
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
    )
}
