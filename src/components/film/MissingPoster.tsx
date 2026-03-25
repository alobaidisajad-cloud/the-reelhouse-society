import React from 'react'

interface MissingPosterProps {
    className?: string
    style?: React.CSSProperties
    sizeHint?: 'sm' | 'md' | 'lg' | 'hero'
}

export default function MissingPoster({ className = "", style, sizeHint = 'md' }: MissingPosterProps) {
    return (
        <div 
            className={`missing-poster-premium ${className}`}
            style={{
                ...style,
                position: 'relative',
                width: '100%',
                height: '100%',
                background: 'linear-gradient(145deg, #16120c 0%, #050403 100%)', // Ultra-premium dimensional sepia-black
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                borderRadius: '4px',
                border: '1px solid rgba(139,105,20,0.15)',
                boxShadow: 'inset 0 0 60px rgba(0,0,0,0.9)',
            }}
        >
            {/* Massive Bleeding Master Logo Watermark */}
            <img 
                src="/reelhouse-logo.svg" 
                alt="ReelHouse Watermark"
                style={{
                    position: 'absolute',
                    width: '320%', // Massively scaled up so the logo bleeds off all edges
                    height: 'auto',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    opacity: 0.25, // Perfectly balanced to be prominent but not overwhelming
                    mixBlendMode: 'color-dodge', // Makes the gold lines interact dynamically with the background gradient
                    filter: 'saturate(1.8) drop-shadow(0 10px 20px rgba(0,0,0,1))',
                    pointerEvents: 'none'
                }}
            />

            {/* Cinematic focal lighting (Rim light) */}
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top right, rgba(139,105,20,0.2) 0%, transparent 60%)', pointerEvents: 'none', mixBlendMode: 'overlay' }} />
            
            {/* Secondary cool counter-light */}
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at bottom left, rgba(255,255,255,0.04) 0%, transparent 50%)', pointerEvents: 'none' }} />
            
            {/* Extremely subtle physical material noise for a matte card feel */}
            <div style={{ position: 'absolute', inset: 0, opacity: 0.15, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")', mixBlendMode: 'overlay', pointerEvents: 'none' }} />
        </div>
    )
}
