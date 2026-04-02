import { useRef } from 'react'

interface ScreeningRoomPlayerProps {
    src: string
    filmTitle?: string
    compact?: boolean
}

export default function ScreeningRoomPlayer({ src, compact = false }: ScreeningRoomPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null)

    return (
        <div style={{
            borderRadius: compact ? '6px' : '8px',
            overflow: 'hidden',
            background: '#000',
            border: '1px solid rgba(196,135,42,0.18)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
            {/* Minimal label */}
            <div style={{
                padding: compact ? '0.35rem 0.6rem' : '0.4rem 0.75rem',
                background: 'rgba(196,135,42,0.04)',
                borderBottom: '1px solid rgba(196,135,42,0.1)',
                display: 'flex', alignItems: 'center', gap: '0.35rem',
            }}>
                <div style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: '#c4872a',
                    boxShadow: '0 0 6px rgba(196,135,42,0.4)',
                }} />
                <span style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: compact ? '0.55rem' : '0.65rem',
                    color: '#c4872a',
                    letterSpacing: '0.04em',
                }}>
                    The Screening Room
                </span>
            </div>

            {/* Video — clean, no overlays */}
            <video
                ref={videoRef}
                src={src}
                controls
                preload="metadata"
                playsInline
                style={{
                    width: '100%',
                    maxHeight: compact ? 220 : 460,
                    display: 'block',
                    background: '#000',
                }}
            />
        </div>
    )
}
