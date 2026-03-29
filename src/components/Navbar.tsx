import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Film, BookOpen, Compass, User, Users, Menu, X, LogIn, Star, Crown, FileText, MapPin, Loader, UserPlus, UserCheck } from 'lucide-react'
import { useAuthStore, useUIStore } from '../store'
import { supabase, isSupabaseConfigured } from '../supabaseClient'
import { tmdb } from '../tmdb'
import Buster from './Buster'
import MainSearchDropdown from './navbar/MainSearchDropdown'
import MemberSearchDropdown from './navbar/MemberSearchDropdown'
import MobileNavDrawer from './navbar/MobileNavDrawer'
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
        ; (routes as Record<string, (() => Promise<any>) | undefined>)[path]?.()
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
    const [notificationsOpen, setNotificationsOpen] = useState(false)
    const [scrolled, setScrolled] = useState(false);
    const [hidden, setHidden] = useState(false);

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
                        <img src="/reelhouse-logo.svg" alt="ReelHouse Logo" style={{ height: '38px', width: 'auto', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }} />
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
                                    className="btn btn-primary nav-log-btn hide-mobile"
                                    onClick={() => openLogModal()}
                                >
                                    + <span className="hide-mobile">LOG FILM</span>
                                </button>
                                <span>
                                    <NotificationBell
                                        isOpen={notificationsOpen}
                                        onOpenChange={setNotificationsOpen}
                                    />
                                </span>
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
                                    aria-label="Enter"
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
                    <MainSearchDropdown isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

                    {/* People Search Bar — Members */}
                    <MemberSearchDropdown isOpen={peopleSearchOpen} onClose={() => setPeopleSearchOpen(false)} />
                </div>
            </nav>

            {/* Mobile Menu */}
            <MobileNavDrawer
                isOpen={mobileOpen}
                onClose={() => setMobileOpen(false)}
                onOpenNotifications={() => setNotificationsOpen(true)}
            />

            {/* Mobile Notifications Panel — renders outside the desktop span when triggered from mobile menu */}
            {notificationsOpen && mobileOpen === false && typeof window !== 'undefined' && window.innerWidth <= 1024 && (
                <div className="mobile-only-notifications">
                    <NotificationBell
                        isOpen={notificationsOpen}
                        onOpenChange={setNotificationsOpen}
                        forceMount={true}
                    />
                </div>
            )}
        </>
    )
}
