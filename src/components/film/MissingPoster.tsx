import React, { useMemo } from 'react'

interface MissingPosterProps {
    text?: string
    className?: string
    style?: React.CSSProperties
    sizeHint?: 'sm' | 'md' | 'lg' | 'hero'
}

export default function MissingPoster({ text = "NO POSTER ON FILE", className = "", style, sizeHint = 'md' }: MissingPosterProps) {
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
                border: '1px solid rgba(139,105,20,0.15)',
                boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)',
            }}
        >
            {/* The holographic foil overlay */}
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
            
            {/* Texture */}
            <div style={{ position: 'absolute', inset: 0, opacity: 0.05, background: 'repeating-linear-gradient(45deg, var(--sepia) 0px, var(--sepia) 1px, transparent 1px, transparent 4px)', pointerEvents: 'none' }} />

            <div style={{ 
                position: 'relative', 
                zIndex: 2, 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                gap: isSmall ? '0.2rem' : '0.8rem',
                transform: isSmall ? 'scale(0.5)' : 'scale(1)',
                opacity: 0.8
            }}>
                {/* Custom Eye logo with 5-hole reel pupil */}
                <svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}>
                    {/* Upper Eyelid */}
                    <path d="M10 45 Q 50 10 90 45" stroke="var(--sepia)" strokeWidth="3" fill="none" strokeLinecap="round" />
                    {/* Lower Eyelid */}
                    <path d="M10 45 Q 50 70 90 45" stroke="var(--sepia)" strokeWidth="3" fill="none" strokeLinecap="round" />
                    
                    {/* The Reel (Pupil) */}
                    <circle cx="50" cy="45" r="16" stroke="var(--sepia)" strokeWidth="3" fill="var(--ink)" />
                    {/* 5 holes inside the reel */}
                    <circle cx="50" cy="45" r="3" fill="var(--sepia)" />
                    <circle cx="50" cy="35" r="3" fill="var(--sepia)" />
                    <circle cx="59.5" cy="41.9" r="3" fill="var(--sepia)" />
                    <circle cx="55.8" cy="52.6" r="3" fill="var(--sepia)" />
                    <circle cx="44.2" cy="52.6" r="3" fill="var(--sepia)" />
                    <circle cx="40.5" cy="41.9" r="3" fill="var(--sepia)" />

                    {/* Outer Eyelite accents */}
                    <path d="M22 35 Q 50 0 78 35" stroke="var(--sepia)" strokeWidth="1" strokeDasharray="4 4" fill="none" opacity="0.6"/>

                    {/* 7 sharp Eyelashes pointing down */}
                    <path d="M15 52 L 5 70 L 25 57" fill="var(--sepia)" />
                    <path d="M30 58 L 22 82 L 40 61" fill="var(--sepia)" />
                    <path d="M46 62 L 45 90 L 54 62" fill="var(--sepia)" />
                    <path d="M60 61 L 78 82 L 70 58" fill="var(--sepia)" />
                    <path d="M75 57 L 95 70 L 85 52" fill="var(--sepia)" />
                </svg>

                <div style={{
                    fontFamily: 'var(--font-display-alt), "Bungee", sans-serif',
                    fontSize: '0.65rem',
                    letterSpacing: '0.25em',
                    color: 'var(--sepia)',
                    textTransform: 'uppercase',
                    textAlign: 'center',
                    textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                    padding: '0 0.5rem'
                }}>
                    {text}
                </div>
            </div>
        </div>
    )
}
