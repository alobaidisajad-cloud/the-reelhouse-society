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
                background: 'var(--ink)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                borderRadius: '4px',
                border: '1px solid rgba(139,105,20,0.15)',
                boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)',
            }}
        >
            {/* The elegant foil lighting overlay */}
            <div 
                className="foil-overlay"
                style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0.15,
                    background: `linear-gradient(135deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0) 100%)`,
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
                flexDirection: 'column', 
                alignItems: 'center', 
                gap: isSmall ? '0.4rem' : '1.5rem',
                transform: isSmall ? 'scale(0.5)' : 'scale(1)',
                opacity: 0.85
            }}>
                {/* Official Master Logo */}
                <img 
                    src="/reelhouse-logo.svg" 
                    alt="ReelHouse Logo"
                    style={{
                        width: isSmall ? '40px' : '90px',
                        height: 'auto',
                        filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.8)) sepia(0.5) hue-rotate(-10deg) saturate(1.5)',
                        opacity: 0.9
                    }}
                />

                {/* Stencil Text */}
                <div style={{
                    fontFamily: 'var(--font-display-alt), "Bungee", sans-serif',
                    fontSize: '0.75rem',
                    letterSpacing: '0.1em',
                    color: 'var(--sepia)',
                    textTransform: 'uppercase',
                    textAlign: 'center',
                    lineHeight: 1.4,
                    whiteSpace: 'pre-line'
                }}>
                    {text}
                </div>
            </div>
        </div>
    )
}
