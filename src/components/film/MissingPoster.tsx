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
                background: '#161412', // Dark matte metallic
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                borderRadius: '4px',
                border: '1px solid rgba(255,255,255,0.05)',
                boxShadow: 'inset 0 0 40px rgba(0,0,0,0.9)',
            }}
        >
            {/* Subtle noise/texture overlay for the matte background */}
            <div style={{ position: 'absolute', inset: 0, opacity: 0.2, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.8%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")', mixBlendMode: 'overlay', pointerEvents: 'none' }} />

            {/* Subtle diffuse glow behind the holographic logo */}
            <div style={{ position: 'absolute', width: '80%', height: '80%', background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 60%)', filter: 'blur(20px)', pointerEvents: 'none' }} />

            <div style={{ 
                position: 'relative', 
                zIndex: 2, 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                gap: isSmall ? '0.4rem' : '1rem',
                transform: isSmall ? 'scale(0.5)' : 'scale(1)',
                width: '100%',
                opacity: 0.95
            }}>
                {/* Holographic Exact Eye SVG */}
                <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ 
                    width: isSmall ? '85%' : '75%', 
                    maxWidth: '180px', 
                    height: 'auto', 
                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' 
                }}>
                    <defs>
                        {/* Dynamic Holographic foil gradient applied to the strokes/fills */}
                        <linearGradient id="holo" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#e0e0e0" />
                            <stop offset="25%" stopColor="#f0cdcd" />
                            <stop offset="50%" stopColor="#d2f0e0" />
                            <stop offset="75%" stopColor="#f5f0b5" />
                            <stop offset="100%" stopColor="#e0e0e0" />
                            <animate attributeName="x1" values="0%; 100%; 0%" dur="7s" repeatCount="indefinite" />
                            <animate attributeName="y1" values="0%; 100%; 0%" dur="5s" repeatCount="indefinite" />
                        </linearGradient>
                    </defs>

                    {/* Solid crease above the eye */}
                    <path d="M 25 22 Q 60 0 95 22" stroke="url(#holo)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                    
                    {/* Upper Eyelid */}
                    <path d="M 12 45 Q 60 15 108 45" stroke="url(#holo)" strokeWidth="3" fill="none" strokeLinecap="round" />
                    
                    {/* Lower Eyelid */}
                    <path d="M 12 45 Q 60 70 108 45" stroke="url(#holo)" strokeWidth="3" fill="none" strokeLinecap="round" />
                    
                    {/* Inner Eyelid Detail Lines */}
                    <path d="M 25 40 Q 60 20 95 40" stroke="url(#holo)" strokeWidth="1" opacity="0.5" fill="none" />
                    
                    {/* Reel Pupil Outline */}
                    <circle cx="60" cy="45" r="18" stroke="url(#holo)" strokeWidth="3" fill="#161412" />
                    
                    {/* Center Hole + 5 Big Reel Holes */}
                    <circle cx="60" cy="45" r="4.5" fill="url(#holo)" />
                    
                    {/* Outer 5 Holes (spaced evenly around the center) */}
                    <circle cx="60" cy="33" r="3.5" fill="url(#holo)" />
                    <circle cx="71" cy="41" r="3.5" fill="url(#holo)" />
                    <circle cx="67" cy="54" r="3.5" fill="url(#holo)" />
                    <circle cx="53" cy="54" r="3.5" fill="url(#holo)" />
                    <circle cx="49" cy="41" r="3.5" fill="url(#holo)" />

                    {/* 5 Needle Eyelashes pointing down (longer, thinner) */}
                    <path d="M 26 53 L 15 82 L 32 58 Z" fill="url(#holo)" />
                    <path d="M 43 62 L 32 94 L 50 64 Z" fill="url(#holo)" />
                    <path d="M 60 65 L 60 100 L 60 65 Z" stroke="url(#holo)" strokeWidth="2.5" strokeLinecap="round" />
                    <path d="M 60 64 L 58 98 L 62 98 Z" fill="url(#holo)" />
                    <path d="M 77 62 L 88 94 L 70 64 Z" fill="url(#holo)" />
                    <path d="M 94 53 L 105 82 L 88 58 Z" fill="url(#holo)" />
                </svg>
            </div>
        </div>
    )
}
