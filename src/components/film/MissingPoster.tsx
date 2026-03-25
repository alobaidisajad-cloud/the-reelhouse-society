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
                background: '#0a0805', // Deep dark brown/black
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                borderRadius: '4px',
                border: '1px solid rgba(139,105,20,0.1)',
            }}
        >
            {/* Subtle Diagonal Stripe Texture */}
            <div style={{ position: 'absolute', inset: 0, opacity: 0.15, background: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(139,105,20,0.2) 2px, rgba(139,105,20,0.2) 4px)', pointerEvents: 'none' }} />

            <div style={{ 
                position: 'relative', 
                zIndex: 2, 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                gap: isSmall ? '0.4rem' : '1.5rem',
                transform: isSmall ? 'scale(0.5)' : 'scale(1)',
            }}>
                {/* Exact Flat Logo SVG */}
                <svg width="120" height="90" viewBox="0 0 120 90" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {/* Dashed Eyebrow Arc */}
                    <path d="M 35 15 Q 60 5 85 15" stroke="var(--sepia)" strokeWidth="1.5" strokeDasharray="4 4" fill="none" />
                    
                    {/* Upper Eyelid */}
                    <path d="M 15 45 Q 60 20 105 45" stroke="var(--sepia)" strokeWidth="3.5" fill="none" />
                    {/* Lower Eyelid */}
                    <path d="M 15 45 Q 60 70 105 45" stroke="var(--sepia)" strokeWidth="3.5" fill="none" />
                    
                    {/* Reel Pupil Outline */}
                    <circle cx="60" cy="45" r="16" stroke="var(--sepia)" strokeWidth="3.5" fill="none" />
                    
                    {/* Center Hole + 5 Reel Holes */}
                    <circle cx="60" cy="45" r="2.5" fill="var(--sepia)" />
                    
                    {/* Outer 5 Holes (spaced evenly around the center) */}
                    <circle cx="60" cy="35" r="2.5" fill="var(--sepia)" />
                    <circle cx="69.5" cy="41.9" r="2.5" fill="var(--sepia)" />
                    <circle cx="65.8" cy="53.1" r="2.5" fill="var(--sepia)" />
                    <circle cx="54.2" cy="53.1" r="2.5" fill="var(--sepia)" />
                    <circle cx="50.5" cy="41.9" r="2.5" fill="var(--sepia)" />

                    {/* 5 Eyelashes pointing down */}
                    <path d="M 28 55 L 20 75 L 35 60 Z" fill="var(--sepia)" />
                    <path d="M 45 62 L 40 85 L 52 64 Z" fill="var(--sepia)" />
                    <path d="M 60 65 L 60 90 L 60 65 Z" stroke="var(--sepia)" strokeWidth="3.5" />
                    <path d="M 60 64 L 56 88 L 64 88 Z" fill="var(--sepia)" />
                    <path d="M 68 64 L 80 85 L 75 62 Z" fill="var(--sepia)" />
                    <path d="M 85 60 L 100 75 L 92 55 Z" fill="var(--sepia)" />
                </svg>

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
