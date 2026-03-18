import Skeleton from './Skeleton'
import Buster from './Buster'
import { useUIStore } from '../store'

/**
 * Themed empty states for when user has no content.
 * Each variant matches the Nitrate Noir aesthetic with Buster mascot.
 */
const emptyStateStyles = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem 1.5rem',
        textAlign: 'center',
        gap: '1rem',
    },
    title: {
        fontFamily: 'var(--font-display)',
        fontSize: '1.1rem',
        color: 'var(--sepia)',
        letterSpacing: '0.05em',
    },
    subtitle: {
        fontFamily: 'var(--font-body)',
        fontSize: '0.85rem',
        color: 'var(--fog)',
        maxWidth: '320px',
        lineHeight: '1.6',
    },
    cta: {
        marginTop: '0.5rem',
        fontFamily: 'var(--font-sub)',
        fontSize: '0.75rem',
        color: 'var(--bone)',
        letterSpacing: '0.08em',
        padding: '8px 20px',
        border: '1px solid var(--ash)',
        background: 'transparent',
        cursor: 'pointer',
        transition: 'border-color 0.2s',
    }
}

export function EmptyLogs() {
    const openLogModal = useUIStore((s) => s.openLogModal)
    return (
        <div style={emptyStateStyles.container}>
            <Buster size={80} mood="peeking" />
            <p style={emptyStateStyles.title}>THE REEL IS BLANK</p>
            <p style={emptyStateStyles.subtitle}>
                No films logged yet. Begin your archive by recording your first viewing.
            </p>
            <button style={emptyStateStyles.cta} onClick={() => openLogModal()}>
                Log Your First Film ✦
            </button>
        </div>
    )
}

export function EmptyWatchlist() {
    return (
        <div style={emptyStateStyles.container}>
            <Buster size={70} mood="neutral" />
            <p style={emptyStateStyles.title}>NOTHING QUEUED</p>
            <p style={emptyStateStyles.subtitle}>
                Your watchlist awaits. Discover films and save them for later.
            </p>
        </div>
    )
}

export function EmptyVault() {
    return (
        <div style={emptyStateStyles.container}>
            <Buster size={70} mood="peeking" />
            <p style={emptyStateStyles.title}>THE VAULT IS SEALED</p>
            <p style={emptyStateStyles.subtitle}>
                Your physical media collection starts here. Add films from your shelf.
            </p>
        </div>
    )
}

export function EmptyLists() {
    return (
        <div style={emptyStateStyles.container}>
            <Buster size={70} mood="smiling" />
            <p style={emptyStateStyles.title}>NO PROGRAMMES YET</p>
            <p style={emptyStateStyles.subtitle}>
                Curate your first list — themed marathons, top picks, or hidden gems.
            </p>
        </div>
    )
}

/**
 * Profile skeleton — shows while user data is loading.
 */
export function ProfileSkeleton() {
    return (
        <div style={{ padding: '2rem', maxWidth: '700px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem' }}>
                <Skeleton variant="avatar" />
                <div style={{ flex: 1 }}>
                    <Skeleton variant="title" />
                    <div style={{ height: '8px' }} />
                    <Skeleton width="40%" height="14px" />
                </div>
            </div>
            <Skeleton variant="card" />
            <div style={{ height: '12px' }} />
            <Skeleton variant="text" count={3} />
        </div>
    )
}

/**
 * Feed/film grid skeleton — shows while films are loading.
 */
export function FilmGridSkeleton({ count = 6 }) {
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
            gap: '1rem',
            padding: '1rem 0'
        }}>
            {Array.from({ length: count }, (_, i) => (
                <div key={i}>
                    <Skeleton variant="poster" style={{ width: '100%' }} />
                    <div style={{ height: '6px' }} />
                    <Skeleton width="80%" height="12px" />
                </div>
            ))}
        </div>
    )
}
