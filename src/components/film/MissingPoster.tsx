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
            className={`missing-poster-foil ${className}`}
            style={{
                ...style,
                position: 'relative',
                width: '100%',
                height: '100%',
                background: 'var(--ink)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                borderRadius: '4px',
                border: '1px solid rgba(139,105,20,0.15)',
                boxShadow: 'inset 0 0 40px rgba(0,0,0,0.6)',
            }}
        >
            {/* The elegant foil lighting overlay */}
            <div 
                className="foil-overlay"
                style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0.15,
                    background: `linear-gradient(135deg, rgba(255,255,255,0) 0%, rgba(139,105,20,0.4) 50%, rgba(255,255,255,0) 100%)`,
                    backgroundSize: '200% 200%',
                    backgroundPosition: holoPosition,
                    mixBlendMode: 'color-dodge',
                    pointerEvents: 'none',
                    transition: 'background-position 0.5s ease',
                }}
            />
            
            {/* Subtle texture */}
            <div style={{ position: 'absolute', inset: 0, opacity: 0.05, background: 'repeating-linear-gradient(45deg, var(--sepia) 0px, var(--sepia) 1px, transparent 1px, transparent 4px)', pointerEvents: 'none' }} />

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
