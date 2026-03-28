import React, { useState } from 'react'
import { Film } from 'lucide-react'
import { tmdb } from '../../tmdb'

import { useViewport } from '../../hooks/useViewport'

interface PosterProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    path: string | null | undefined
    title: string
    aspectRatio?: 'poster' | 'backdrop' | 'square'
    sizeHint?: 'sm' | 'md' | 'lg' | 'hero'
}

export default function Poster({ path, title, aspectRatio = 'poster', sizeHint = 'md', className, style, ...props }: PosterProps) {
    const { isTouch: IS_TOUCH } = useViewport()
    const [error, setError] = useState(false)
    const [loaded, setLoaded] = useState(false)

    // Common container styles
    const containerStyle: React.CSSProperties = {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--ash)',
        overflow: 'hidden',
        width: '100%',
        height: 'auto',
        aspectRatio: aspectRatio === 'poster' ? '2/3' : aspectRatio === 'backdrop' ? '16/9' : '1/1',
        ...style
    }

    // Default missing artwork state
    if (!path || error) {
        return (
            <div className={`poster-fallback ${className || ''}`} style={{ ...containerStyle, background: '#0d0b09', border: '1px solid rgba(139,105,20,0.12)' }}>
                <img src="/reelhouse-logo.svg" alt="ReelHouse" style={{ width: '75%', height: 'auto', opacity: 0.9 }} />
            </div>
        )
    }

    // Determine srcSet and responsive sizes based on orientation and intent
    let srcData = { src: undefined as string | undefined, srcSet: undefined as string | undefined, sizes: undefined as string | undefined }
    
    if (sizeHint === 'sm') {
        // Avatars / search results (force tiny)
        srcData.src = tmdb.poster(path, 'w92')
    } else if (sizeHint === 'hero') {
        // Film detail headers
        srcData = tmdb.backdropSrcSet(path)
    } else {
        // Grids / Cards
        srcData = aspectRatio === 'backdrop' ? tmdb.backdropSrcSet(path) : tmdb.posterSrcSet(path)
    }

    return (
        <div className={`poster-container ${className || ''}`} style={containerStyle}>
            {/* Ultra-low quality placeholder for blur-up — desktop only */}
            {!IS_TOUCH && sizeHint !== 'sm' && !loaded && (
                <div 
                    style={{
                        position: 'absolute', inset: 0,
                        backgroundImage: `url(${tmdb.posterThumb(path)})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        filter: 'blur(10px)',
                        transform: 'scale(1.1)',
                        zIndex: 1
                    }} 
                />
            )}
            <img
                src={srcData.src}
                srcSet={srcData.srcSet}
                sizes={srcData.sizes}
                alt={title}
                width={aspectRatio === 'poster' ? 185 : aspectRatio === 'backdrop' ? 780 : 185}
                height={aspectRatio === 'poster' ? 278 : aspectRatio === 'backdrop' ? 439 : 185}
                loading={sizeHint === 'hero' ? 'eager' : 'lazy'}
                fetchPriority={sizeHint === 'hero' ? 'high' : undefined}
                decoding="async"
                onLoad={() => setLoaded(true)}
                onError={() => setError(true)}
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    opacity: IS_TOUCH ? 1 : (loaded ? 1 : 0),
                    transition: IS_TOUCH ? 'none' : 'opacity 0.3s ease-in-out',
                    zIndex: 2,
                    position: 'relative'
                }}
                {...props}
            />
        </div>
    )
}
