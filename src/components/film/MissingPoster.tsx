import React, { useMemo } from 'react'

interface MissingPosterProps {
    text?: string
    className?: string
    style?: React.CSSProperties
    sizeHint?: 'sm' | 'md' | 'lg' | 'hero'
}

export default function MissingPoster({ text = "NO POSTER ON\nFILE", className = "", style, sizeHint = 'md' }: MissingPosterProps) {
    // Holographic gradient movement
    const holoPosition = useMemo(() => {
        return `${Math.random() * 100}% ${Math.random() * 100}%`
    }, [])

    const isSmall = sizeHint === 'sm'

    return (
        <div 
            className={`missing-poster-foil ${className}`}
            style={{
                ...style,
                position: 'relative',
                width: '100%',
                height: '100%',
                // Elegant dark metallic background
                background: 'radial-gradient(ellipse at %holo_pos%, rgba(139,105,20,0.15) 0%, transparent 60%), radial-gradient(ellipse at bottom left, rgba(255,255,255,0.05) 0%, transparent 50%), #111'.replace('%holo_pos%', holoPosition),
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                borderRadius: '4px',
                border: '1px solid rgba(139,105,20,0.1)',
                boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8)',
            }}
        >
            {/* The elegant foil lighting overlay */}
            <div 
                className="foil-overlay"
                style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0.25,
                    background: `linear-gradient(135deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0) 100%)`,
                    backgroundSize: '200% 200%',
                    backgroundPosition: holoPosition,
                    mixBlendMode: 'color-dodge',
                    pointerEvents: 'none',
                    transition: 'background-position 0.5s ease',
                }}
            />
            
            {/* Subtle noise/texture overlay */}
            <div style={{ position: 'absolute', inset: 0, opacity: 0.15, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")', mixBlendMode: 'overlay', pointerEvents: 'none' }} />

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
                        width: isSmall ? '85%' : '80%',
                        maxWidth: '180px',
                        height: 'auto',
                        filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.9)) sepia(0.3) saturate(1.8) brightness(1.2)',
                    }}
                />
            </div>
        </div>
    )
}
