import { useCallback } from 'react'
import { Link } from 'react-router-dom'

/**
 * NavLink with route prefetch on hover.
 * When the user hovers a nav link, the target route's component
 * is preloaded so navigation feels instant.
 * 
 * Uses the Vite dynamic import to trigger chunk loading.
 */
const routeMap = {
    '/': () => import('../pages/HomePage'),
    '/discover': () => import('../pages/DiscoverPage'),
    '/feed': () => import('../pages/FeedPage'),
    '/profile': () => import('../pages/UserProfilePage'),
    '/membership': () => import('../pages/MembershipPage'),
    '/venue': () => import('../pages/VenuePage'),
}

export default function PrefetchLink({ to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: any }) {
    const handleHover = useCallback(() => {
        const loader = (routeMap as any)[to]
        if (loader) loader() // Triggers Vite to load the chunk
    }, [to])

    return (
        <Link
            to={to}
            onMouseEnter={handleHover}
            onTouchStart={handleHover}
            {...props}
        >
            {children}
        </Link>
    )
}
