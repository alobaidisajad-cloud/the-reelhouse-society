import { useState, useRef, useEffect } from 'react'

interface LazyImageProps {
    src: string | null | undefined
    alt: string
    style?: React.CSSProperties
    className?: string
    /** Called when the image fails to load */
    fallback?: React.ReactNode
    /** fetchPriority for above-the-fold images */
    priority?: boolean
}

/**
 * LazyImage — loads images only when they enter the viewport.
 * Shows a shimmer placeholder until loaded, then fades in.
 * Uses IntersectionObserver for efficient scroll-based triggering.
 */
export default function LazyImage({ src, alt, style, className, fallback, priority }: LazyImageProps) {
    const [isVisible, setIsVisible] = useState(false)
    const [isLoaded, setIsLoaded] = useState(false)
    const [hasError, setHasError] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (priority) { setIsVisible(true); return }
        const el = ref.current
        if (!el) return

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true)
                    observer.disconnect()
                }
            },
            { rootMargin: '200px' } // Pre-load 200px before viewport
        )

        observer.observe(el)
        return () => observer.disconnect()
    }, [priority])

    if (hasError && fallback) return <>{fallback}</>

    return (
        <div ref={ref} className={className} style={{ position: 'relative', overflow: 'hidden', ...style }}>
            {/* Shimmer placeholder */}
            {!isLoaded && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(110deg, var(--soot) 30%, rgba(139,105,20,0.06) 50%, var(--soot) 70%)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 1.5s infinite linear',
                    }}
                />
            )}

            {/* Actual image — only rendered once visible */}
            {isVisible && src && (
                <img
                    src={src}
                    alt={alt}
                    loading={priority ? 'eager' : 'lazy'}
                    decoding="async"
                    onLoad={() => setIsLoaded(true)}
                    onError={() => setHasError(true)}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        opacity: isLoaded ? 1 : 0,
                        transition: 'opacity 0.3s ease-in',
                        ...style,
                    }}
                />
            )}
        </div>
    )
}
