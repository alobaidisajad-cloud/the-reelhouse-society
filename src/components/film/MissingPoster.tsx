import React, { useMemo } from 'react'

interface MissingPosterProps {
    className?: string
    style?: React.CSSProperties
    sizeHint?: 'sm' | 'md' | 'lg' | 'hero'
}

export default function MissingPoster({ className = "", style, sizeHint = 'md' }: MissingPosterProps) {
    const isSmall = sizeHint === 'sm'

    // Extremely subtle, premium background shimmer position
    const holoPosition = useMemo(() => {
        return `${Math.random() * 100}% ${Math.random() * 100}%`
    }, [])

    return (
        <div 
            className={`missing-poster-film ${className}`}
            style={{
                ...style,
                position: 'relative',
                width: '100%',
                height: '100%',
                background: '#0a0806', // Extremely deep film stock black/sepia
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                borderRadius: '4px',
                border: '1px solid rgba(139,105,20,0.1)',
                boxShadow: 'inset 0 0 50px rgba(0,0,0,0.9)',
            }}
        >
            {/* Cinematic Film Vignette Glow */}
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, rgba(139,105,20,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

            {/* Old Film Vertical Scratches */}
            <div style={{ position: 'absolute', inset: 0, opacity: 0.15, background: 'linear-gradient(90deg, transparent 10%, rgba(255,255,255,0.2) 10.2%, transparent 10.5%, transparent 45%, rgba(0,0,0,0.4) 45.1%, transparent 45.3%, transparent 80%, rgba(255,255,255,0.1) 80.1%, transparent 80.3%)', pointerEvents: 'none' }} />

            {/* Authentic 35mm Film Grain / Dust */}
            <div style={{ position: 'absolute', inset: 0, opacity: 0.35, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.8 0.8%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")', mixBlendMode: 'overlay', pointerEvents: 'none' }} />

            <div style={{ 
                position: 'relative', 
                zIndex: 2, 
                display: 'flex', 
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                opacity: 0.95
            }}>
                {/* Official Master Logo */}
                <img 
                    src="/reelhouse-logo.svg" 
                    alt="ReelHouse Logo"
                    style={{
                        width: isSmall ? '65%' : '55%',
                        maxWidth: '120px',
                        height: 'auto',
                        filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.9)) saturate(1.2) brightness(1.1)',
                    }}
                />
            </div>
            {/* Inner border to frame it like a master print */}
            <div style={{ position: 'absolute', inset: '4px', border: '1px solid rgba(139,105,20,0.1)', borderRadius: '2px', pointerEvents: 'none' }} />
        </div>
    )
}
