import { useState, useRef, useEffect, useCallback } from 'react'

interface ScreeningRoomPlayerProps {
    src: string
    filmTitle?: string
    compact?: boolean
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
}

export default function ScreeningRoomPlayer({ src, filmTitle, compact = false }: ScreeningRoomPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const progressRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

    const [playing, setPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [buffered, setBuffered] = useState(0)
    const [volume, setVolume] = useState(1)
    const [muted, setMuted] = useState(false)
    const [showControls, setShowControls] = useState(true)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [started, setStarted] = useState(false)

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0

    // ── Event Handlers ──
    const togglePlay = useCallback(() => {
        const v = videoRef.current
        if (!v) return
        if (v.paused) {
            v.play()
            setPlaying(true)
            setStarted(true)
        } else {
            v.pause()
            setPlaying(false)
        }
        resetHideTimer()
    }, [])

    const resetHideTimer = useCallback(() => {
        setShowControls(true)
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
        hideTimerRef.current = setTimeout(() => {
            if (videoRef.current && !videoRef.current.paused) {
                setShowControls(false)
            }
        }, 3000)
    }, [])

    const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const bar = progressRef.current
        const v = videoRef.current
        if (!bar || !v) return
        const rect = bar.getBoundingClientRect()
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
        v.currentTime = pct * v.duration
        resetHideTimer()
    }, [resetHideTimer])

    const toggleMute = useCallback(() => {
        const v = videoRef.current
        if (!v) return
        v.muted = !v.muted
        setMuted(v.muted)
        resetHideTimer()
    }, [resetHideTimer])

    const toggleFullscreen = useCallback(() => {
        const c = containerRef.current
        if (!c) return
        if (!document.fullscreenElement) {
            c.requestFullscreen?.()
        } else {
            document.exitFullscreen?.()
        }
        resetHideTimer()
    }, [resetHideTimer])

    // ── Sync State ──
    useEffect(() => {
        const v = videoRef.current
        if (!v) return

        const onTime = () => setCurrentTime(v.currentTime)
        const onMeta = () => setDuration(v.duration)
        const onEnd = () => { setPlaying(false); setStarted(false) }
        const onProgress = () => {
            if (v.buffered.length > 0) {
                setBuffered((v.buffered.end(v.buffered.length - 1) / v.duration) * 100)
            }
        }

        v.addEventListener('timeupdate', onTime)
        v.addEventListener('loadedmetadata', onMeta)
        v.addEventListener('ended', onEnd)
        v.addEventListener('progress', onProgress)

        const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
        document.addEventListener('fullscreenchange', onFsChange)

        return () => {
            v.removeEventListener('timeupdate', onTime)
            v.removeEventListener('loadedmetadata', onMeta)
            v.removeEventListener('ended', onEnd)
            v.removeEventListener('progress', onProgress)
            document.removeEventListener('fullscreenchange', onFsChange)
        }
    }, [])

    useEffect(() => {
        return () => {
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
        }
    }, [])

    const gold = '#c4872a'
    const goldDim = 'rgba(196,135,42,0.35)'

    return (
        <div
            ref={containerRef}
            onMouseMove={resetHideTimer}
            onMouseEnter={() => setShowControls(true)}
            onClick={(e) => {
                // Only toggle play if clicking the video area, not controls
                if ((e.target as HTMLElement).closest('[data-controls]')) return
                togglePlay()
            }}
            style={{
                position: 'relative',
                borderRadius: compact ? '6px' : '8px',
                overflow: 'hidden',
                background: '#000',
                border: `1px solid rgba(196,135,42,0.15)`,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                cursor: 'pointer',
                ...(isFullscreen ? { borderRadius: 0, border: 'none' } : {}),
            }}
        >
            {/* ── Video ── */}
            <video
                ref={videoRef}
                src={src}
                preload="metadata"
                playsInline
                style={{
                    width: '100%',
                    maxHeight: isFullscreen ? '100vh' : (compact ? 220 : 460),
                    display: 'block',
                    background: '#000',
                }}
            />

            {/* ── Pre-play Poster Overlay ── */}
            {!started && (
                <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.6) 100%)',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: compact ? '0.5rem' : '0.75rem',
                    zIndex: 2,
                }}>
                    {/* Play circle */}
                    <div style={{
                        width: compact ? 44 : 60,
                        height: compact ? 44 : 60,
                        borderRadius: '50%',
                        border: `2px solid ${gold}`,
                        background: 'rgba(0,0,0,0.4)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        boxShadow: `0 0 24px rgba(196,135,42,0.15)`,
                    }}>
                        <svg width={compact ? 16 : 22} height={compact ? 16 : 22} viewBox="0 0 24 24" fill={gold}>
                            <polygon points="8 5 20 12 8 19" />
                        </svg>
                    </div>
                    {filmTitle && !compact && (
                        <div style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: '0.75rem',
                            color: 'var(--parchment, #e8dcc4)',
                            opacity: 0.6,
                            textAlign: 'center',
                            padding: '0 1rem',
                        }}>
                            {filmTitle}
                        </div>
                    )}
                </div>
            )}

            {/* ── Custom Controls ── */}
            <div
                data-controls="true"
                style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.85) 100%)',
                    padding: compact ? '1.5rem 0.5rem 0.4rem' : '2rem 0.75rem 0.5rem',
                    opacity: showControls || !playing ? 1 : 0,
                    transition: 'opacity 0.3s',
                    zIndex: 3,
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Progress bar */}
                <div
                    ref={progressRef}
                    onClick={handleSeek}
                    style={{
                        width: '100%', height: compact ? 3 : 4,
                        background: 'rgba(255,255,255,0.12)',
                        borderRadius: '2px',
                        cursor: 'pointer',
                        position: 'relative',
                        marginBottom: compact ? '0.35rem' : '0.5rem',
                    }}
                >
                    {/* Buffered */}
                    <div style={{
                        position: 'absolute', top: 0, left: 0,
                        width: `${buffered}%`, height: '100%',
                        background: 'rgba(255,255,255,0.08)',
                        borderRadius: '2px',
                    }} />
                    {/* Progress */}
                    <div style={{
                        position: 'absolute', top: 0, left: 0,
                        width: `${progress}%`, height: '100%',
                        background: `linear-gradient(90deg, ${gold}, #daa520)`,
                        borderRadius: '2px',
                        transition: 'width 0.1s linear',
                    }} />
                    {/* Scrubber dot */}
                    <div style={{
                        position: 'absolute', top: '50%',
                        left: `${progress}%`,
                        transform: 'translate(-50%, -50%)',
                        width: compact ? 8 : 10,
                        height: compact ? 8 : 10,
                        borderRadius: '50%',
                        background: gold,
                        boxShadow: `0 0 6px rgba(196,135,42,0.5)`,
                        opacity: showControls ? 1 : 0,
                        transition: 'opacity 0.2s',
                    }} />
                </div>

                {/* Controls row */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: compact ? '0.5rem' : '0.75rem',
                }}>
                    {/* Play/Pause */}
                    <button onClick={togglePlay} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        {playing ? (
                            <svg width={compact ? 14 : 18} height={compact ? 14 : 18} viewBox="0 0 24 24" fill={gold}>
                                <rect x="6" y="4" width="4" height="16" rx="1" />
                                <rect x="14" y="4" width="4" height="16" rx="1" />
                            </svg>
                        ) : (
                            <svg width={compact ? 14 : 18} height={compact ? 14 : 18} viewBox="0 0 24 24" fill={gold}>
                                <polygon points="8 5 20 12 8 19" />
                            </svg>
                        )}
                    </button>

                    {/* Time */}
                    <span style={{
                        fontFamily: 'var(--font-ui, monospace)',
                        fontSize: compact ? '0.45rem' : '0.55rem',
                        letterSpacing: '0.05em',
                        color: 'rgba(255,255,255,0.7)',
                        minWidth: compact ? 55 : 70,
                        userSelect: 'none',
                    }}>
                        {formatTime(currentTime)} / {formatTime(duration)}
                    </span>

                    {/* Spacer */}
                    <div style={{ flex: 1 }} />

                    {/* Label */}
                    {!compact && (
                        <span style={{
                            fontFamily: 'var(--font-ui)',
                            fontSize: '0.3rem',
                            letterSpacing: '0.15em',
                            color: goldDim,
                            userSelect: 'none',
                        }}>
                            THE SCREENING ROOM
                        </span>
                    )}

                    {/* Volume */}
                    <button onClick={toggleMute} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        {muted || volume === 0 ? (
                            <svg width={compact ? 14 : 16} height={compact ? 14 : 16} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="rgba(255,255,255,0.6)" />
                                <line x1="23" y1="9" x2="17" y2="15" />
                                <line x1="17" y1="9" x2="23" y2="15" />
                            </svg>
                        ) : (
                            <svg width={compact ? 14 : 16} height={compact ? 14 : 16} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="rgba(255,255,255,0.6)" />
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                            </svg>
                        )}
                    </button>

                    {/* Fullscreen */}
                    <button onClick={toggleFullscreen} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        {isFullscreen ? (
                            <svg width={compact ? 14 : 16} height={compact ? 14 : 16} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                            </svg>
                        ) : (
                            <svg width={compact ? 14 : 16} height={compact ? 14 : 16} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
