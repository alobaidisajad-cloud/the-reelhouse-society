import { useLocation, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { Home, Compass, Plus, Newspaper, User } from 'lucide-react'
import { useAuthStore, useUIStore } from '../store'

const TABS = [
    { id: 'home', path: '/', icon: Home, label: 'Lobby' },
    { id: 'discover', path: '/discover', icon: Compass, label: 'Darkroom' },
    { id: 'log', path: null, icon: Plus, label: 'Log' },
    { id: 'feed', path: '/feed', icon: Newspaper, label: 'Reel' },
    { id: 'profile', path: '/profile', icon: User, label: 'Profile' },
]

export default function BottomNav() {
    const location = useLocation()
    const navigate = useNavigate()
    const user = useAuthStore(s => s.user)
    const isAuthenticated = useAuthStore(s => s.isAuthenticated)
    const openLogModal = useUIStore(s => s.openLogModal)
    const openSignupModal = useUIStore(s => s.openSignupModal)

    const handleTap = (tab: typeof TABS[0]) => {
        if (tab.id === 'log') {
            if (isAuthenticated) openLogModal()
            else openSignupModal()
            return
        }
        if (tab.id === 'profile') {
            if (isAuthenticated && user?.username) navigate(`/user/${user.username}`)
            else openSignupModal()
            return
        }
        if (tab.path) navigate(tab.path)
    }

    const isActive = (tab: typeof TABS[0]) => {
        if (tab.id === 'log') return false
        if (tab.id === 'profile') return location.pathname.startsWith('/user/')
        if (tab.id === 'home') return location.pathname === '/'
        return tab.path ? location.pathname.startsWith(tab.path) : false
    }

    return createPortal(
        <nav className="bottom-nav" aria-label="Main navigation">
            {TABS.map(tab => {
                const active = isActive(tab)
                const isLog = tab.id === 'log'
                const Icon = tab.icon
                return (
                    <button
                        key={tab.id}
                        className={`bottom-nav-tab ${active ? 'active' : ''} ${isLog ? 'bottom-nav-log' : ''}`}
                        onClick={() => handleTap(tab)}
                        aria-label={tab.label}
                        aria-current={active ? 'page' : undefined}
                    >
                        <Icon size={isLog ? 22 : 20} strokeWidth={active ? 2.4 : 1.6} />
                        {!isLog && <span className="bottom-nav-label">{tab.label}</span>}
                    </button>
                )
            })}
        </nav>,
        document.body
    )
}
