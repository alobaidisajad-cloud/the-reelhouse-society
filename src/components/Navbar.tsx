import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Film, BookOpen, Compass, User, Users, Menu, X, LogIn, Star, Crown, FileText, MapPin, Loader, UserPlus, UserCheck } from 'lucide-react'
import { useAuthStore, useUIStore } from '../store'
import { supabase, isSupabaseConfigured } from '../supabaseClient'
import { tmdb } from '../tmdb'
import Buster from './Buster'
import NotificationBell from './NotificationBell'
import toast from 'react-hot-toast'

// Route prefetch map — loads chunks on hover for instant navigation
const prefetchRoute = (path: string) => {
    const routes = {
        '/': () => import('../pages/HomePage'),
        '/discover': () => import('../pages/DiscoverPage'),
        '/feed': () => import('../pages/FeedPage'),
        '/profile': () => import('../pages/UserProfilePage'),
        '/membership': () => import('../pages/MembershipPage'),
        '/dispatch': () => import('../pages/DispatchPage'),
        '/lists': () => import('../pages/ListsPage'),
        '/cinemas': () => import('../pages/CinemasPage'),
        '/patronage': () => import('../pages/MembershipPage'),
    }
    ;(routes as Record<string, (() => Promise<any>) | undefined>)[path]?.()
}

const NAV_LINKS = [
    { path: '/', label: 'The Lobby', icon: Film },
    { path: '/discover', label: 'The Darkroom', icon: Compass },
    { path: '/feed', label: 'The Reel', icon: BookOpen },
    { path: '/dispatch', label: 'The Dispatch', icon: FileText },
    { path: '/lists', label: 'The Stacks', icon: Star },
    { path: '/cinemas', label: 'The Cinemas', icon: MapPin },
    { path: '/society', label: 'The Society', icon: Crown },
]

export default function Navbar() {
    const location = useLocation()
    const navigate = useNavigate()

    // Enterprise Fix: strict selectors prevent arbitrary re-renders
    const user = useAuthStore(state => state.user)
    const isAuthenticated = useAuthStore(state => state.isAuthenticated)
    const logout = useAuthStore(state => state.logout)

    const openLogModal = useUIStore(state => state.openLogModal)
    const openSignupModal = useUIStore(state => state.openSignupModal)

    const [mobileOpen, setMobileOpen] = useState(false)
    const [searchOpen, setSearchOpen] = useState(false)
    const [peopleSearchOpen, setPeopleSearchOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [peopleQuery, setPeopleQuery] = useState('')
    const [suggestions, setSuggestions] = useState<any[]>([])
    const [peopleSuggestions, setPeopleSuggestions] = useState<any[]>([])
    const [scrolled, setScrolled] = useState(false)
    const [hidden, setHidden] = useState(false)
    const [searching, setSearching] = useState(false)
    const [searchingPeople, setSearchingPeople] = useState(false)
    const [followingLoading, setFollowingLoading] = useState<Record<string, boolean>>({})
    const lastScrollY = useRef(0)

    useEffect(() => {
        let rafId: number | null = null
        const onScroll = () => {
            if (rafId) return
            rafId = requestAnimationFrame(() => {
                const currentScrollY = window.scrollY
                setScrolled(currentScrollY > 40)
                // Navbar always stays visible — no hide-on-scroll
                lastScrollY.current = currentScrollY
                rafId = null
            })
        }
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => {
            window.removeEventListener('scroll', onScroll)
            if (rafId) cancelAnimationFrame(rafId)
        }
    }, [])

    useEffect(() => {
        setMobileOpen(false)
        setSearchOpen(false)
    }, [location.pathname])

    // ── MAIN SEARCH: TMDB multi-search for movies, actors, directors ──
    useEffect(() => {
        if (!query.trim()) {
            setSuggestions([])
            setSearching(false)
            return
        }
        setSearching(true)
        const timer = setTimeout(async () => {
            try {
                const results = await tmdb.searchMulti(query)
                setSuggestions(results || [])
            } catch (e) {
                console.error('Search error:', e)
            } finally {
                setSearching(false)
            }
        }, 250)
        return () => clearTimeout(timer)
    }, [query])

    // ── PEOPLE SEARCH: Supabase profiles for members ──
    useEffect(() => {
        if (!peopleQuery.trim()) {
            setPeopleSuggestions([])
            setSearchingPeople(false)
            return
        }
        setSearchingPeople(true)
        const timer = setTimeout(async () => {
            try {
                if (!isSupabaseConfigured) { setSearchingPeople(false); return }
                const { data, error } = await supabase
                    .from('profiles')
                    .select('id, username, role, bio, avatar_url')
                    .or(`username.ilike.%${peopleQuery}%,bio.ilike.%${peopleQuery}%`)
                    .order('username', { ascending: true })
                    .limit(8)
                if (!error && data) setPeopleSuggestions(data)
            } catch (e) {
                console.error('People search error:', e)
            } finally {
                setSearchingPeople(false)
            }
        }, 250)
        return () => clearTimeout(timer)
    }, [peopleQuery])

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        if (query.trim() && suggestions.length > 0) {
            const match = suggestions[0]
            if (match.media_type === 'person') {
                // Navigate to discover with person filter (closest match)
                navigate(`/discover?person=${match.id}`)
            } else {
                navigate(`/film/${match.id}`)
            }
            setQuery(''); setSearchOpen(false); setSuggestions([])
        }
    }

    const handlePeopleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        if (peopleQuery.trim() && peopleSuggestions.length > 0) {
            navigate(`/user/${peopleSuggestions[0].username}`)
            setPeopleQuery(''); setPeopleSearchOpen(false); setPeopleSuggestions([])
        }
    }

    return (
        <>
            {/* Skip-to-content for keyboard users — WCAG 2.1 Level A */}
            <a href="#main-content" className="skip-to-content" style={{
                position: 'absolute', left: '-9999px', top: 'auto', width: '1px', height: '1px', overflow: 'hidden',
                zIndex: 100010, background: 'var(--ink)', color: 'var(--sepia)', padding: '0.75rem 1.5rem',
                fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.15em', textDecoration: 'none',
                border: '1px solid var(--sepia)',
            }} onFocus={(e) => { e.currentTarget.style.left = '1rem'; e.currentTarget.style.top = '1rem'; e.currentTarget.style.width = 'auto'; e.currentTarget.style.height = 'auto' }}
               onBlur={(e) => { e.currentTarget.style.left = '-9999px'; e.currentTarget.style.width = '1px'; e.currentTarget.style.height = '1px' }}>
                SKIP TO CONTENT
            </a>
            {/* Navbar styles are defined in index.css — .navbar, .navbar-inner, .nav-link, etc. */}
            <nav className={`navbar ${scrolled ? 'scrolled' : ''}`} style={{
                transform: hidden ? 'translateY(-100%)' : 'translateY(0)',
                transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.3s ease, padding 0.3s ease',
            }}>
                <div className="navbar-inner" style={{ position: 'relative' }}>
                    {/* Logo */}
                    <Link to="/" className="nav-logo">
                        <img src="/reelhouse-logo.svg" alt="ReelHouse Logo" width="28" height="28" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }} />
                        <span className="nav-logo-text">The ReelHouse Society</span>
                        <div className="nav-logo-buster">
                            <Buster size={40} mood="peeking" />
                        </div>
                    </Link>

                    {/* Desktop Nav */}
                    <ul className="nav-links hide-mobile">
                        {NAV_LINKS.map(({ path, label }) => {
                            const ALIASES = { '/society': ['/patronage', '/membership'] }
                            const isActive = (p: string) => {
                                if (location.pathname === p) return true
                                const al = (ALIASES as Record<string, string[]>)[p] || []
                                if (al.includes(location.pathname)) return true
                                if (p !== '/' && location.pathname.startsWith(p + '/')) return true
                                return false
                            }
                            return (
                                <li key={path}>
                                    <Link
                                        to={path}
                                        className={`nav-link ${isActive(path) ? 'active' : ''}`}
                                        onMouseEnter={() => prefetchRoute(path)}
                                    >
                                        {label}
                                    </Link>
                                </li>
                            )
                        })}
                    </ul>

                    {/* Actions */}
                    <div className="nav-actions">
                        <button
                            className="nav-icon-btn"
                            onClick={() => { setSearchOpen((v) => !v); setPeopleSearchOpen(false) }}
                            title="Search films, actors, directors"
                            aria-label="Search films"
                        >
                            <Search size={18} />
                        </button>

                        {/* People Search Button */}
                        {isAuthenticated && (
                            <button
                                className="nav-icon-btn nav-people-search-btn"
                                onClick={() => { setPeopleSearchOpen((v) => !v); setSearchOpen(false) }}
                                title="Search members"
                                aria-label="Search members"
                            >
                                <span className="nav-people-icon">
                                    <Buster size={18} mood="peeking" />
                                    <span className="nav-people-plus">+</span>
                                </span>
                            </button>
                        )}

                        {isAuthenticated ? (
                            <>
                                <button
                                    className="btn btn-primary nav-log-btn"
                                    onClick={() => openLogModal()}
                                >
                                    + <span className="hide-mobile">LOG FILM</span>
                                </button>
                                <NotificationBell />
                                {user?.role === 'venue_owner' && (
                                    <Link
                                        to="/venue-dashboard"
                                        className="user-badge hide-mobile"
                                        style={{ borderColor: 'var(--flicker)', color: 'var(--flicker)' }}
                                    >
                                        <Film size={12} />
                                        My Venue
                                    </Link>
                                )}
                                <Link
                                    to={`/user/${user?.username || 'me'}`}
                                    className="user-badge hide-mobile"
                                    style={{
                                        color: user?.role === 'auteur' ? 'var(--sepia)' : user?.role === 'archivist' ? 'var(--parchment)' : 'var(--bone)',
                                        borderColor: user?.role === 'auteur' ? 'var(--sepia)' : 'var(--ash)',
                                    }}
                                >
                                    {(user?.role === 'auteur' || user?.role === 'archivist') ? <span style={{ fontSize: '0.6rem' }}>✦</span> : <User size={12} />}
                                    {user?.username || 'Profile'}
                                </Link>

                            </>
                        ) : (
                            <>
                                <button
                                    className="btn btn-ghost"
                                    style={{ fontSize: '0.65rem', padding: '0.35em 0.9em' }}
                                    onClick={() => openSignupModal('cinephile')}
                                >
                                    <LogIn size={12} /> <span className="hide-mobile">Enter</span>
                                </button>
                            </>
                        )}

                        {/* Handbook Toggle (Always Visible) */}
                        <button
                            className="nav-icon-btn hide-mobile"
                            onClick={() => useUIStore.getState().openHandbook()}
                            title="Society Handbook"
                            style={{ marginLeft: '0.5rem', color: 'var(--sepia)' }}
                        >
                            <BookOpen size={18} />
                        </button>

                        {/* Command Palette hint — desktop only */}
                        <button
                            className="nav-icon-btn hide-mobile"
                            onClick={() => { const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true }); window.dispatchEvent(e) }}
                            title="Command Palette (⌘K)"
                            style={{ fontSize: '0.5rem', fontFamily: 'var(--font-ui)', letterSpacing: '0.08em', color: 'var(--fog)', padding: '0.25em 0.5em', border: '1px solid var(--ash)', borderRadius: '4px', opacity: 0.6 }}
                        >
                            ⌘K
                        </button>

                        {/* Mobile toggle */}
                        <button
                            className="nav-icon-btn nav-mobile-toggle"
                            onClick={() => setMobileOpen((v) => !v)}
                            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                            aria-expanded={mobileOpen}
                        >
                            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
                        </button>
                    </div>

                    {/* Main Search Bar — TMDB Films, Actors, Directors */}
                    <AnimatePresence>
                        {searchOpen && (
                            <motion.div
                                className="search-bar"
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                                style={{ flexDirection: 'column', gap: 0 }}
                            >
                                <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
                                    <Search size={16} style={{ color: 'var(--sepia)', alignSelf: 'center', flexShrink: 0 }} />
                                    <input
                                        className="input"
                                        placeholder="Search films, actors, directors..."
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        autoFocus
                                    />
                                    <button className="btn btn-primary" type="submit">Search</button>
                                    <button type="button" className="nav-icon-btn" onClick={() => { setSearchOpen(false); setSuggestions([]) }}>
                                        <X size={16} />
                                    </button>
                                </form>

                                {/* TMDB Results Dropdown */}
                                <AnimatePresence>
                                    {(searching || suggestions.length > 0 || (query.trim() && !searching)) && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="glass-panel"
                                            style={{ marginTop: '0.5rem', borderTop: '1px solid var(--sepia)', maxHeight: '400px', overflowY: 'auto', borderRadius: 'var(--radius-card)', width: '100%' }}
                                        >
                                            {searching && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem 1.25rem', color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em' }}>
                                                    <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
                                                    SCANNING ARCHIVES...
                                                </div>
                                            )}
                                            {!searching && suggestions.length === 0 && query.trim() && (
                                                <div style={{ padding: '1rem 1.25rem', color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em' }}>
                                                    NO RESULTS FOUND IN THE ARCHIVE
                                                </div>
                                            )}
                                            {!searching && suggestions.map((item: any) => {
                                                const isPerson = item.media_type === 'person'
                                                const title = item.title || item.name || ''
                                                const year = item.release_date?.slice(0, 4)
                                                const imgPath = isPerson ? item.profile_path : item.poster_path
                                                const imgUrl = imgPath ? `https://image.tmdb.org/t/p/w92${imgPath}` : null
                                                const dept = isPerson ? (item.known_for_department || 'Acting').toUpperCase() : null

                                                return (
                                                    <Link
                                                        key={`${item.media_type}-${item.id}`}
                                                        to={isPerson ? `/discover?person=${item.id}` : `/film/${item.id}`}
                                                        onClick={() => { setQuery(''); setSearchOpen(false); setSuggestions([]) }}
                                                        style={{ display: 'flex', alignItems: 'center', padding: '0.65rem 1.5rem', gap: '1rem', textDecoration: 'none', borderBottom: '1px solid rgba(139,105,20,0.08)', transition: 'background 0.2s' }}
                                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(242,232,160,0.03)'}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                    >
                                                        {/* Poster / Photo */}
                                                        <div style={{ width: isPerson ? 44 : 48, height: isPerson ? 44 : 68, borderRadius: isPerson ? '50%' : '3px', overflow: 'hidden', background: 'var(--ash)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: isPerson ? '2px solid rgba(139,105,20,0.4)' : '1px solid rgba(139,105,20,0.15)' }}>
                                                            {imgUrl ? (
                                                                <img src={imgUrl} alt={title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                            ) : (
                                                                isPerson ? <User size={20} color="var(--fog)" /> : <Film size={20} color="var(--fog)" />
                                                            )}
                                                        </div>
                                                        {/* Info */}
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.95rem', color: 'var(--parchment)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {title}
                                                            </div>
                                                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.12em', color: 'var(--sepia)', marginTop: '0.25rem' }}>
                                                                {isPerson ? `🎭 ${dept}` : `🎬 ${year || 'FILM'}`}
                                                            </div>
                                                        </div>
                                                    </Link>
                                                )
                                            })}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* People Search Bar — Members */}
                    <AnimatePresence>
                        {peopleSearchOpen && (
                            <motion.div
                                className="search-bar"
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                                style={{ flexDirection: 'column', gap: 0 }}
                            >
                                <form onSubmit={handlePeopleSearch} style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
                                    <Users size={16} style={{ color: 'var(--sepia)', alignSelf: 'center', flexShrink: 0 }} />
                                    <input
                                        className="input"
                                        placeholder="Search members of The Society..."
                                        value={peopleQuery}
                                        onChange={(e) => setPeopleQuery(e.target.value)}
                                        autoFocus
                                    />
                                    <button type="button" className="nav-icon-btn" onClick={() => { setPeopleSearchOpen(false); setPeopleSuggestions([]) }}>
                                        <X size={16} />
                                    </button>
                                </form>

                                {/* People Results */}
                                <AnimatePresence>
                                    {(searchingPeople || peopleSuggestions.length > 0 || (peopleQuery.trim() && !searchingPeople)) && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="glass-panel"
                                            style={{ marginTop: '0.5rem', borderTop: '1px solid var(--sepia)', maxHeight: '300px', overflowY: 'auto', borderRadius: 'var(--radius-card)', width: '100%' }}
                                        >
                                            {searchingPeople && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem 1.25rem', color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em' }}>
                                                    <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
                                                    SEARCHING MEMBERS...
                                                </div>
                                            )}
                                            {!searchingPeople && peopleSuggestions.length === 0 && peopleQuery.trim() && (
                                                <div style={{ padding: '1rem 1.25rem', color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em' }}>
                                                    NO MEMBERS FOUND
                                                </div>
                                            )}
                                            {!searchingPeople && peopleSuggestions.map((member: any) => (
                                                <Link
                                                    key={member.username}
                                                    to={`/user/${member.username}`}
                                                    onClick={() => { setPeopleQuery(''); setPeopleSearchOpen(false); setPeopleSuggestions([]) }}
                                                    style={{ display: 'flex', alignItems: 'center', padding: '0.9rem 1.25rem', gap: '1.25rem', textDecoration: 'none', borderBottom: '1px solid rgba(139,105,20,0.1)', transition: 'background 0.2s' }}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(242,232,160,0.03)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <div style={{ width: 46, height: 46, borderRadius: '50%', overflow: 'hidden', background: 'var(--ink)', border: '2px solid rgba(139,105,20,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                        <Buster size={32} mood="smiling" />
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--parchment)', lineHeight: 1 }}>@{member.username.toUpperCase()}</div>
                                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--sepia)', letterSpacing: '0.15em', marginTop: '0.35rem' }}>{(member.role || 'cinephile').toUpperCase()}</div>
                                                        {member.bio && <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--fog)', fontStyle: 'italic', marginTop: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '400px' }}>"{member.bio}"</div>}
                                                    </div>
                                                    {/* Quick Follow Button */}
                                                    {user && member.username !== user.username && (
                                                        <button
                                                            className={`btn ${(user.following || []).includes(member.username) ? 'btn-ghost' : 'btn-primary'}`}
                                                            onClick={async (e) => {
                                                                e.preventDefault()
                                                                e.stopPropagation()
                                                                if (followingLoading[member.username]) return
                                                                setFollowingLoading(prev => ({ ...prev, [member.username]: true }))
                                                                const alreadyFollowing = (user.following || []).includes(member.username)
                                                                try {
                                                                    if (alreadyFollowing) {
                                                                        useAuthStore.getState().updateUser({ following: (user.following || []).filter((u: string) => u !== member.username) })
                                                                        toast.success(`Unfollowed @${member.username}`)
                                                                        await supabase.from('interactions').delete()
                                                                            .eq('user_id', user.id)
                                                                            .eq('target_user_id', member.id)
                                                                            .eq('type', 'follow')
                                                                    } else {
                                                                        useAuthStore.getState().updateUser({ following: [...(user.following || []), member.username] })
                                                                        toast.success(`Now following @${member.username} ✦`)
                                                                        await supabase.from('interactions').insert({
                                                                            user_id: user.id,
                                                                            target_user_id: member.id,
                                                                            type: 'follow'
                                                                        })
                                                                        void supabase.from('notifications').insert({
                                                                            user_id: member.id,
                                                                            type: 'follow',
                                                                            from_username: user.username,
                                                                            message: `@${user.username} is now following you.`,
                                                                        })
                                                                    }
                                                                } catch { toast.error('Something went wrong.') }
                                                                finally { setFollowingLoading(prev => ({ ...prev, [member.username]: false })) }
                                                            }}
                                                            style={{ flexShrink: 0, fontSize: '0.5rem', padding: '0.35rem 0.7rem', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.3rem', minWidth: 'auto' }}
                                                            disabled={followingLoading[member.username]}
                                                        >
                                                            {followingLoading[member.username] ? '...' : (user.following || []).includes(member.username) ? <><UserCheck size={11} /> FOLLOWING</> : <><UserPlus size={11} /> FOLLOW</>}
                                                        </button>
                                                    )}
                                                </Link>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </nav>

            {/* Mobile Menu */}
            <AnimatePresence>
                {mobileOpen && (
                    <motion.div
                        className="mobile-menu"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <button
                            className="nav-icon-btn"
                            onClick={() => setMobileOpen(false)}
                            style={{ position: 'absolute', top: '1.5rem', right: '1.5rem' }}
                        >
                            <X size={24} />
                        </button>
                        <Buster size={80} mood="smiling" />

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' }}>
                            {NAV_LINKS.map(({ path, label }) => (
                                <Link key={path} to={path} className="mobile-nav-link" onClick={() => setMobileOpen(false)}>
                                    {label}
                                </Link>
                            ))}

                            {isAuthenticated ? (
                                <>
                                    <div style={{ width: '40px', height: '1px', background: 'var(--ash)', margin: '0.5rem 0' }} />
                                    <Link to={`/user/${user?.username}`} className="mobile-nav-link" onClick={() => setMobileOpen(false)} style={{ fontSize: '1.2rem', color: 'var(--bone)' }}>
                                        My Profile
                                    </Link>
                                    <button className="btn btn-primary" onClick={() => { openLogModal(); setMobileOpen(false) }}>
                                        + Log a Film
                                    </button>

                                </>
                            ) : (
                                <button
                                    className="btn btn-primary"
                                    onClick={() => { openSignupModal('cinephile'); setMobileOpen(false) }}
                                    style={{ marginTop: '1rem' }}
                                >
                                    Enter The House
                                </button>
                            )}

                            {/* Mobile Handbook Link */}
                            <div style={{ width: '40px', height: '1px', background: 'var(--ash)', margin: '0.5rem 0' }} />
                            <button
                                className="mobile-nav-link"
                                onClick={() => { useUIStore.getState().openHandbook(); setMobileOpen(false) }}
                                style={{ color: 'var(--sepia)', background: 'none', border: 'none', padding: 0, fontFamily: 'var(--font-ui)', letterSpacing: '0.15em' }}
                            >
                                SOCIETY HANDBOOK
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    )
}

