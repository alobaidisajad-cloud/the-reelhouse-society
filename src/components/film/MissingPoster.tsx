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
                background: 'linear-gradient(145deg, #110e0A 0%, #050403 100%)', // Premium dark sepia
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                borderRadius: '4px',
                border: '1px solid rgba(139,105,20,0.1)',
                boxShadow: 'inset 0 0 50px rgba(0,0,0,0.8)',
            }}
        >
            {/* Perfectly Scaled Master Logo */}
            <img 
                src="/reelhouse-logo.svg" 
                alt="ReelHouse Poster"
                style={{
                    position: 'relative',
                    width: '80%', // Sized exactly to match the photo's proportions
                    height: 'auto',
                    opacity: 0.85,
                    mixBlendMode: 'luminosity', // Premium metallic interaction
                    filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.9)) sepia(0.3) saturate(1.5)',
                    pointerEvents: 'none',
                    zIndex: 2
                }}
            />

            {/* Cinematic focal lighting */}
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, rgba(139,105,20,0.08) 0%, transparent 65%)', pointerEvents: 'none' }} />
            
            {/* Film Grain Texture for Matte Feel */}
            <div style={{ position: 'absolute', inset: 0, opacity: 0.3, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")', mixBlendMode: 'overlay', pointerEvents: 'none' }} />
        </div>
    )
}
