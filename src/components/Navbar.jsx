import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Film, BookOpen, Compass, User, Menu, X, LogIn, Star, Crown, FileText, MapPin } from 'lucide-react'
import { useAuthStore, useUIStore } from '../store'
import Buster from './Buster'
import NotificationBell from './NotificationBell'

// Route prefetch map — loads chunks on hover for instant navigation
const prefetchRoute = (path) => {
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
    routes[path]?.()
}

const NAV_LINKS = [
    { path: '/', label: 'The Lobby', icon: Film },
    { path: '/discover', label: 'Dark Room', icon: Compass },
    { path: '/feed', label: 'The Reel', icon: BookOpen },
    { path: '/dispatch', label: 'The Dispatch', icon: FileText },
    { path: '/lists', label: 'The Stacks', icon: Star },
    { path: '/cinemas', label: 'Cinemas', icon: MapPin },
    { path: '/patronage', label: 'The Society', icon: Crown },
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
    const [query, setQuery] = useState('')
    const [suggestions, setSuggestions] = useState([])
    const [scrolled, setScrolled] = useState(false)
    const [hidden, setHidden] = useState(false)
    const [searching, setSearching] = useState(false)
    const lastScrollY = useRef(0)

    useEffect(() => {
        let rafId = null
        const onScroll = () => {
            if (rafId) return
            rafId = requestAnimationFrame(() => {
                const currentScrollY = window.scrollY
                setScrolled(currentScrollY > 40)

                // Only hide if we scroll down past 150px overhead
                if (currentScrollY > 150 && currentScrollY > lastScrollY.current) {
                    setHidden(true)
                } else if (currentScrollY < lastScrollY.current) {
                    setHidden(false) // Show immediately on scroll up
                }

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

    // Debounced search — 150ms delay prevents firing on every keystroke
    useEffect(() => {
        if (!query.trim()) {
            setSuggestions([])
            return
        }

        const timer = setTimeout(() => {
            const authState = useAuthStore.getState()
            const community = authState.community || []
            const currentUser = authState.user

            const allUsers = [...community]
            if (currentUser && !community.find(u => u.username === currentUser.username)) {
                allUsers.push(currentUser)
            }

            const filtered = allUsers.filter(u =>
                u.username.toLowerCase().includes(query.toLowerCase()) ||
                (u.bio && u.bio.toLowerCase().includes(query.toLowerCase()))
            ).slice(0, 8)

            setSuggestions(filtered)
            setSearching(false)
        }, 150)

        return () => clearTimeout(timer)
    }, [query])

    const handleSearch = (e) => {
        e.preventDefault()
        if (query.trim()) {
            const match = suggestions[0]
            if (match) {
                navigate(`/user/${match.username}`)
                setQuery('')
                setSearchOpen(false)
                setSuggestions([])
            }
        }
    }

    return (
        <>
            {/* Navbar styles are defined in index.css — .navbar, .navbar-inner, .nav-link, etc. */}
            <nav className={`navbar ${scrolled ? 'scrolled' : ''}`} style={{
                transform: hidden ? 'translateY(-100%)' : 'translateY(0)',
                transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.3s ease, padding 0.3s ease',
            }}>
                <div className="navbar-inner" style={{ position: 'relative' }}>
                    {/* Logo */}
                    <Link to="/" className="nav-logo">
                        <ReelIcon />
                        <span className="nav-logo-text">The ReelHouse Society</span>
                        <div className="nav-logo-buster">
                            <Buster size={40} mood="peeking" />
                        </div>
                    </Link>

                    {/* Desktop Nav */}
                    <ul className="nav-links hide-mobile">
                        {NAV_LINKS.map(({ path, label }) => (
                            <li key={path}>
                                <Link
                                    to={path}
                                    className={`nav-link ${location.pathname === path ? 'active' : ''}`}
                                    onMouseEnter={() => prefetchRoute(path)}
                                >
                                    {label}
                                </Link>
                            </li>
                        ))}
                    </ul>

                    {/* Actions */}
                    <div className="nav-actions">
                        <button
                            className="nav-icon-btn"
                            onClick={() => setSearchOpen((v) => !v)}
                            title="Search films"
                        >
                            <Search size={18} />
                        </button>

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
                                <button
                                    className="nav-icon-btn hide-mobile"
                                    onClick={logout}
                                    title="Sign out"
                                    style={{ fontSize: '0.6rem', fontFamily: 'var(--font-ui)', letterSpacing: '0.1em', color: 'var(--fog)' }}
                                >
                                    EXIT
                                </button>
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
                        >
                            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
                        </button>
                    </div>

                    {/* Search Bar */}
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
                                    <Search size={16} style={{ color: 'var(--fog)', alignSelf: 'center', flexShrink: 0 }} />
                                    <input
                                        className="input"
                                        placeholder="Search members, curators, archives..."
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        autoFocus
                                    />
                                    <button className="btn btn-primary" type="submit">
                                        Search
                                    </button>
                                    <button
                                        type="button"
                                        className="nav-icon-btn"
                                        onClick={() => { setSearchOpen(false); setSuggestions([]) }}
                                    >
                                        <X size={16} />
                                    </button>
                                </form>

                                {/* Suggestions Dropdown */}
                                <AnimatePresence>
                                    {suggestions.length > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="glass-panel"
                                            style={{
                                                marginTop: '0.5rem',
                                                borderTop: '1px solid var(--sepia)',
                                                maxHeight: '300px',
                                                overflowY: 'auto',
                                                borderRadius: 'var(--radius-card)',
                                                transformOrigin: 'top center',
                                            }}
                                        >
                                            {suggestions.map((member) => (
                                                <Link
                                                    key={member.username}
                                                    to={`/user/${member.username}`}
                                                    onClick={() => { setQuery(''); setSearchOpen(false); setSuggestions([]) }}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        padding: '0.9rem 1.25rem',
                                                        gap: '1.25rem',
                                                        textDecoration: 'none',
                                                        borderBottom: '1px solid rgba(139,105,20,0.1)',
                                                        transition: 'background 0.2s',
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(242,232,160,0.03)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <div style={{
                                                        width: 40, height: 40, borderRadius: '50%', overflow: 'hidden',
                                                        background: 'var(--ink)', border: '1px solid var(--sepia)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                    }}>
                                                        {member.avatar?.startsWith('data:image/') ? (
                                                            <img src={member.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        ) : (
                                                            <Buster size={28} mood={member.avatar || 'smiling'} />
                                                        )}
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--parchment)', lineHeight: 1 }}>
                                                            @{member.username.toUpperCase()}
                                                        </div>
                                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--sepia)', letterSpacing: '0.15em', marginTop: '0.3rem' }}>
                                                            {member.followers?.length || 0} FOLLOWERS · CINEPHILE
                                                        </div>
                                                        {member.bio && (
                                                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)', fontStyle: 'italic', marginTop: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>
                                                                "{member.bio}"
                                                            </div>
                                                        )}
                                                    </div>
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
                                    <button
                                        className="btn btn-ghost"
                                        onClick={() => { logout(); setMobileOpen(false) }}
                                        style={{ fontSize: '0.7rem' }}
                                    >
                                        EXIT HOUSE
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

function ReelIcon() {
    return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="14" cy="14" r="12" stroke="#8B6914" strokeWidth="1.5" fill="#0A0703" />
            <circle cx="14" cy="14" r="5" stroke="#8B6914" strokeWidth="1.5" fill="#1C1710" />
            <circle cx="14" cy="14" r="2" fill="#F2E8A0" />
            <circle cx="14" cy="6" r="2.5" fill="#3A3228" stroke="#8B6914" strokeWidth="0.8" />
            <circle cx="14" cy="22" r="2.5" fill="#3A3228" stroke="#8B6914" strokeWidth="0.8" />
            <circle cx="6" cy="14" r="2.5" fill="#3A3228" stroke="#8B6914" strokeWidth="0.8" />
            <circle cx="22" cy="14" r="2.5" fill="#3A3228" stroke="#8B6914" strokeWidth="0.8" />
        </svg>
    )
}
