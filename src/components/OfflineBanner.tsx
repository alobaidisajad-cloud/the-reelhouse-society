import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { WifiOff } from 'lucide-react'

/**
 * OfflineBanner — fixed banner shown when the user loses internet connectivity.
 * Auto-dismisses when connection is restored.
 */
export default function OfflineBanner() {
    const isOnline = useOnlineStatus()

    if (isOnline) return null

    return (
        <div
            role="alert"
            aria-live="assertive"
            style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 100001,
                background: 'linear-gradient(135deg, rgba(92,26,11,0.95), rgba(60,15,5,0.98))',
                color: 'var(--parchment)',
                fontFamily: 'var(--font-ui)',
                fontSize: '0.65rem',
                letterSpacing: '0.15em',
                textAlign: 'center',
                padding: '0.75rem 1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                borderTop: '2px solid var(--blood-reel)',
                boxShadow: '0 -4px 20px rgba(0,0,0,0.6)',
            }}
        >
            <WifiOff size={14} />
            CONNECTION LOST — THE PROJECTION BOOTH HAS GONE DARK
        </div>
    )
}
