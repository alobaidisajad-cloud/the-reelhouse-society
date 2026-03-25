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
                background: '#2a2a28', // Exact dark slate/olive metallic background from the photo
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                borderRadius: '4px',
                border: '1px solid rgba(255,255,255,0.05)',
                boxShadow: 'inset 0 0 30px rgba(0,0,0,0.6)',
            }}
        >
            {/* The Master Logo masked with Holographic Foil colors */}
            <div style={{
                position: 'relative',
                width: '90%', // 90% width precisely matches the footprint of the logo in the photo
                height: '90%', 
                WebkitMaskImage: 'url(/reelhouse-logo.svg)',
                WebkitMaskSize: 'contain',
                WebkitMaskPosition: 'center',
                WebkitMaskRepeat: 'no-repeat',
                maskImage: 'url(/reelhouse-logo.svg)',
                maskSize: 'contain',
                maskPosition: 'center',
                maskRepeat: 'no-repeat',
                // Holographic foil colors matching the reference picture (silver/teal/gold/pink)
                background: 'linear-gradient(120deg, #cde3d6 0%, #e8e3a5 40%, #e6bebe 70%, #d4dbd6 100%)',
                opacity: 0.95,
                zIndex: 2,
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' // Crisp foil drop-shadow
            }} />

            {/* Faint metallic rim reflection */}
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top, rgba(255,255,255,0.06) 0%, transparent 60%)', pointerEvents: 'none' }} />
            
            {/* Heavy metallic noise texture to match the physical material of the card */}
            <div style={{ position: 'absolute', inset: 0, opacity: 0.35, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")', mixBlendMode: 'overlay', pointerEvents: 'none' }} />
        </div>
    )
}
