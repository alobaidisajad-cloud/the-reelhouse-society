import { useState, useRef } from 'react'

interface ScreeningRoomPlayerProps {
    src: string
    filmTitle?: string
    compact?: boolean
}

export default function ScreeningRoomPlayer({ src, filmTitle, compact = false }: ScreeningRoomPlayerProps) {
    const [playing, setPlaying] = useState(false)
    const videoRef = useRef<HTMLVideoElement>(null)

    const handlePlay = () => {
        setPlaying(true)
        setTimeout(() => {
            videoRef.current?.play()
        }, 100)
    }

    const handleEnded = () => {
        setPlaying(false)
        if (videoRef.current) videoRef.current.currentTime = 0
    }

    return (
        <div style={{
            background: 'linear-gradient(180deg, #0d0a06 0%, #080604 100%)',
            border: '2px solid rgba(196,135,42,0.25)',
            borderRadius: compact ? '6px' : '8px',
            overflow: 'hidden',
            boxShadow: compact
                ? '0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(196,135,42,0.08)'
                : '0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(196,135,42,0.06), inset 0 1px 0 rgba(196,135,42,0.1)',
        }}>
            {/* ── Header Bar ── */}
            <div style={{
                padding: compact ? '0.5rem 0.75rem' : '0.65rem 1rem',
                background: 'linear-gradient(90deg, rgba(196,135,42,0.06) 0%, rgba(196,135,42,0.02) 50%, rgba(196,135,42,0.06) 100%)',
                borderBottom: '1px solid rgba(196,135,42,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '0.35rem' : '0.5rem' }}>
                    {/* Projector icon */}
                    <svg width={compact ? 14 : 18} height={compact ? 14 : 18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="8" cy="10" r="5" stroke="#c4872a" strokeWidth="1.5" fill="none" opacity="0.8"/>
                        <circle cx="8" cy="10" r="2" fill="#c4872a" opacity="0.4"/>
                        <rect x="14" y="8" width="7" height="4" rx="1" stroke="#c4872a" strokeWidth="1.5" fill="none" opacity="0.6"/>
                        <line x1="5" y1="16" x2="5" y2="20" stroke="#c4872a" strokeWidth="1.5" opacity="0.4"/>
                        <line x1="11" y1="16" x2="11" y2="20" stroke="#c4872a" strokeWidth="1.5" opacity="0.4"/>
                    </svg>
                    <div>
                        <div style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: compact ? '0.65rem' : '0.8rem',
                            color: '#c4872a',
                            letterSpacing: '0.05em',
                            lineHeight: 1,
                        }}>
                            The Screening Room
                        </div>
                        {!compact && (
                            <div style={{
                                fontFamily: 'var(--font-ui)',
                                fontSize: '0.3rem',
                                letterSpacing: '0.2em',
                                color: 'rgba(196,135,42,0.45)',
                                marginTop: '0.15rem',
                            }}>
                                PROJECTIONIST EXCLUSIVE
                            </div>
                        )}
                    </div>
                </div>
                <div style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: '0.3rem',
                    letterSpacing: '0.15em',
                    color: 'rgba(196,135,42,0.35)',
                }}>
                    REELHOUSE
                </div>
            </div>

            {/* ── Video Area ── */}
            <div style={{ position: 'relative', background: '#000' }}>
                {!playing ? (
                    /* ── Poster / Play Overlay ── */
                    <div
                        onClick={handlePlay}
                        style={{
                            position: 'relative',
                            width: '100%',
                            height: compact ? 180 : 320,
                            background: 'linear-gradient(180deg, #0a0806 0%, #060402 100%)',
                            cursor: 'pointer',
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            gap: compact ? '0.6rem' : '1rem',
                            overflow: 'hidden',
                            transition: 'background 0.3s',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = 'linear-gradient(180deg, #0e0a06 0%, #080502 100%)'
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = 'linear-gradient(180deg, #0a0806 0%, #060402 100%)'
                        }}
                    >
                        {/* Ambient projector beam */}
                        <div style={{
                            position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)',
                            width: '60%', height: '80%',
                            background: 'radial-gradient(ellipse at top, rgba(196,135,42,0.08) 0%, transparent 70%)',
                            pointerEvents: 'none',
                        }} />

                        {/* Play button */}
                        <div style={{
                            width: compact ? 48 : 68,
                            height: compact ? 48 : 68,
                            borderRadius: '50%',
                            border: '2px solid rgba(196,135,42,0.4)',
                            background: 'rgba(196,135,42,0.08)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.3s',
                            boxShadow: '0 0 30px rgba(196,135,42,0.12), inset 0 0 20px rgba(196,135,42,0.05)',
                            position: 'relative', zIndex: 1,
                        }}>
                            <svg width={compact ? 18 : 24} height={compact ? 18 : 24} viewBox="0 0 24 24" fill="#c4872a">
                                <polygon points="8 5 20 12 8 19"></polygon>
                            </svg>
                        </div>

                        {/* Film title + prompt */}
                        <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
                            {filmTitle && !compact && (
                                <div style={{
                                    fontFamily: 'var(--font-display)',
                                    fontSize: '0.85rem',
                                    color: 'var(--parchment)',
                                    marginBottom: '0.3rem',
                                    opacity: 0.7,
                                }}>
                                    {filmTitle}
                                </div>
                            )}
                            <div style={{
                                fontFamily: 'var(--font-ui)',
                                fontSize: compact ? '0.35rem' : '0.4rem',
                                letterSpacing: '0.2em',
                                color: 'rgba(196,135,42,0.5)',
                            }}>
                                TAP TO BEGIN SCREENING
                            </div>
                        </div>

                        {/* Ornamental corners */}
                        <div style={{ position: 'absolute', top: 8, left: 8, width: 16, height: 16, borderTop: '1px solid rgba(196,135,42,0.2)', borderLeft: '1px solid rgba(196,135,42,0.2)' }} />
                        <div style={{ position: 'absolute', top: 8, right: 8, width: 16, height: 16, borderTop: '1px solid rgba(196,135,42,0.2)', borderRight: '1px solid rgba(196,135,42,0.2)' }} />
                        <div style={{ position: 'absolute', bottom: 8, left: 8, width: 16, height: 16, borderBottom: '1px solid rgba(196,135,42,0.2)', borderLeft: '1px solid rgba(196,135,42,0.2)' }} />
                        <div style={{ position: 'absolute', bottom: 8, right: 8, width: 16, height: 16, borderBottom: '1px solid rgba(196,135,42,0.2)', borderRight: '1px solid rgba(196,135,42,0.2)' }} />
                    </div>
                ) : (
                    /* ── Active Video ── */
                    <video
                        ref={videoRef}
                        src={src}
                        controls
                        playsInline
                        onEnded={handleEnded}
                        style={{
                            width: '100%',
                            maxHeight: compact ? 220 : 460,
                            display: 'block',
                            background: '#000',
                        }}
                    />
                )}
            </div>

            {/* ── Bottom Bar ── */}
            <div style={{
                padding: compact ? '0.35rem 0.75rem' : '0.4rem 1rem',
                background: 'linear-gradient(90deg, rgba(196,135,42,0.04), transparent, rgba(196,135,42,0.04))',
                borderTop: '1px solid rgba(196,135,42,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: 12, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(196,135,42,0.3))' }} />
                    <span style={{
                        fontFamily: 'var(--font-ui)',
                        fontSize: '0.25rem',
                        letterSpacing: '0.25em',
                        color: 'rgba(196,135,42,0.3)',
                    }}>
                        THE REELHOUSE SOCIETY
                    </span>
                    <div style={{ width: 12, height: '1px', background: 'linear-gradient(90deg, rgba(196,135,42,0.3), transparent)' }} />
                </div>
            </div>
        </div>
    )
}
