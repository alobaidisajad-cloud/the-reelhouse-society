import { useState, useRef } from 'react'

interface ScreeningRoomPlayerProps {
    src: string
    filmTitle?: string
    compact?: boolean
}

export default function ScreeningRoomPlayer({ src, filmTitle, compact = false }: ScreeningRoomPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [started, setStarted] = useState(false)

    const handlePlay = () => {
        setStarted(true)
        setTimeout(() => videoRef.current?.play(), 50)
    }

    const handleEnded = () => {
        setStarted(false)
        if (videoRef.current) videoRef.current.currentTime = 0
    }

    const gold = '#c4872a'

    return (
        <div style={{ position: 'relative' }}>
            {/* ── The Frame ── */}
            <div style={{
                borderRadius: compact ? '6px' : '10px',
                overflow: 'hidden',
                background: '#000',
                borderTop: `2px solid ${gold}`,
                borderLeft: '1px solid rgba(196,135,42,0.08)',
                borderRight: '1px solid rgba(196,135,42,0.08)',
                borderBottom: '1px solid rgba(196,135,42,0.08)',
                boxShadow: compact
                    ? '0 4px 20px rgba(0,0,0,0.4)'
                    : '0 16px 48px rgba(0,0,0,0.5), 0 0 60px rgba(196,135,42,0.04)',
            }}>
                {/* ── Poster Overlay (before play) ── */}
                {!started ? (
                    <div
                        onClick={handlePlay}
                        style={{
                            position: 'relative',
                            width: '100%',
                            minHeight: compact ? 200 : 340,
                            background: 'linear-gradient(180deg, #0c0a06 0%, #050302 100%)',
                            cursor: 'pointer',
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            gap: compact ? '0.5rem' : '0.75rem',
                        }}
                    >
                        {/* Ambient warm glow */}
                        <div style={{
                            position: 'absolute', top: '30%', left: '50%',
                            transform: 'translateX(-50%)',
                            width: '50%', height: '50%',
                            background: 'radial-gradient(ellipse, rgba(196,135,42,0.07) 0%, transparent 70%)',
                            pointerEvents: 'none',
                        }} />

                        {/* Play button */}
                        <div style={{
                            width: compact ? 52 : 72,
                            height: compact ? 52 : 72,
                            borderRadius: '50%',
                            border: `2px solid ${gold}`,
                            background: 'rgba(196,135,42,0.05)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: `0 0 32px rgba(196,135,42,0.12)`,
                            transition: 'transform 0.2s, box-shadow 0.2s',
                            position: 'relative', zIndex: 1,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 0 48px rgba(196,135,42,0.2)' }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 0 32px rgba(196,135,42,0.12)' }}
                        >
                            <svg width={compact ? 20 : 28} height={compact ? 20 : 28} viewBox="0 0 24 24" fill={gold}>
                                <polygon points="9 5 20 12 9 19" />
                            </svg>
                        </div>

                        {/* Film title */}
                        {filmTitle && !compact && (
                            <div style={{
                                fontFamily: 'var(--font-display)',
                                fontSize: '0.75rem',
                                color: 'var(--parchment, #e8dcc4)',
                                opacity: 0.45,
                                position: 'relative', zIndex: 1,
                            }}>
                                {filmTitle}
                            </div>
                        )}

                        {/* Branding line */}
                        <div style={{
                            position: 'absolute', bottom: compact ? 8 : 12,
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                        }}>
                            <div style={{ width: 16, height: '1px', background: `linear-gradient(90deg, transparent, rgba(196,135,42,0.25))` }} />
                            <span style={{
                                fontFamily: 'var(--font-display)',
                                fontSize: compact ? '0.35rem' : '0.4rem',
                                color: gold,
                                opacity: 0.3,
                                letterSpacing: '0.04em',
                            }}>
                                The Screening Room
                            </span>
                            <div style={{ width: 16, height: '1px', background: `linear-gradient(90deg, rgba(196,135,42,0.25), transparent)` }} />
                        </div>
                    </div>
                ) : (
                    /* ── Native video with working controls ── */
                    <video
                        ref={videoRef}
                        src={src}
                        controls
                        playsInline
                        onEnded={handleEnded}
                        style={{
                            width: '100%',
                            minHeight: compact ? 200 : 340,
                            maxHeight: compact ? 320 : 600,
                            display: 'block',
                            background: '#000',
                        }}
                    />
                )}
            </div>
        </div>
    )
}
