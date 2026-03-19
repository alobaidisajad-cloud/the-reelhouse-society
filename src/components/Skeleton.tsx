import { memo } from 'react'

/**
 * Nitrate Noir skeleton loader — dark shimmer on soot background.
 * Pure CSS animation, zero JavaScript overhead.
 * 
 * Usage:
 *   <Skeleton width="100%" height="20px" />
 *   <Skeleton variant="poster" />    — film poster placeholder
 *   <Skeleton variant="text" />      — single line of text
 *   <Skeleton variant="card" />      — full card block
 */
interface SkeletonProps {
    width?: string
    height?: string
    variant?: 'text' | 'title' | 'poster' | 'card' | 'avatar' | 'button'
    style?: React.CSSProperties
    count?: number
}

const Skeleton = memo(({ width, height, variant, style, count = 1 }: SkeletonProps) => {
    const variants = {
        text: { width: '100%', height: '14px', borderRadius: '2px' },
        title: { width: '60%', height: '22px', borderRadius: '2px' },
        poster: { width: '120px', height: '180px', borderRadius: 'var(--radius-card)' },
        card: { width: '100%', height: '140px', borderRadius: 'var(--radius-card)' },
        avatar: { width: '64px', height: '64px', borderRadius: '50%' },
        button: { width: '100px', height: '36px', borderRadius: '4px' },
    }

    const base = variant ? variants[variant] || {} : {}

    const skeletonStyle = {
        display: 'block',
        background: 'linear-gradient(90deg, var(--soot) 25%, var(--ash) 50%, var(--soot) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s ease-in-out infinite',
        ...base,
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
        ...style,
    }

    if (count > 1) {
        return Array.from({ length: count }, (_, i) => (
            <div key={i} style={{ ...skeletonStyle, marginBottom: '8px' }} />
        ))
    }

    return <div style={skeletonStyle} />
})

Skeleton.displayName = 'Skeleton'

export default Skeleton
