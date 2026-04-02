import { useState, useRef, useEffect, useCallback } from 'react'

interface Props {
    src: string
    filmTitle?: string
    compact?: boolean
}

function fmt(s: number): string {
    const m = Math.floor(s / 60)
    return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

export default function ScreeningRoomPlayer({ src, filmTitle, compact = false }: Props) {
    const vid = useRef<HTMLVideoElement>(null)
    const seekBar = useRef<HTMLDivElement>(null)
    const box = useRef<HTMLDivElement>(null)

    const [playing, setPlaying] = useState(false)
    const [time, setTime] = useState(0)
    const [dur, setDur] = useState(0)
    const [buf, setBuf] = useState(0)
    const [muted, setMuted] = useState(false)
    const [vol, setVol] = useState(1)
    const [fs, setFs] = useState(false)
    const [ready, setReady] = useState(false)
    const [dragging, setDragging] = useState(false)

    const pct = dur > 0 ? (time / dur) * 100 : 0
    const g = '#c4872a'

    // ── Play / Pause ──
    const toggle = useCallback(() => {
        const v = vid.current
        if (!v) return
        if (v.paused) { v.play(); setPlaying(true); setReady(true) }
        else { v.pause(); setPlaying(false) }
    }, [])

    // ── Seek ──
    const seekTo = useCallback((clientX: number) => {
        const el = seekBar.current, v = vid.current
        if (!el || !v || !dur) return
        const rect = el.getBoundingClientRect()
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
        v.currentTime = ratio * dur
        setTime(ratio * dur)
    }, [dur])

    // ── Drag seek ──
    useEffect(() => {
        if (!dragging) return
        const onMove = (e: MouseEvent) => { e.preventDefault(); seekTo(e.clientX) }
        const onUp = () => setDragging(false)
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        return () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }
    }, [dragging, seekTo])

    // ── Touch drag seek ──
    useEffect(() => {
        if (!dragging) return
        const onMove = (e: TouchEvent) => { if (e.touches[0]) seekTo(e.touches[0].clientX) }
        const onEnd = () => setDragging(false)
        window.addEventListener('touchmove', onMove, { passive: true })
        window.addEventListener('touchend', onEnd)
        return () => {
            window.removeEventListener('touchmove', onMove)
            window.removeEventListener('touchend', onEnd)
        }
    }, [dragging, seekTo])

    // ── Video events ──
    useEffect(() => {
        const v = vid.current
        if (!v) return
        const onTime = () => { if (!dragging) setTime(v.currentTime) }
        const onMeta = () => setDur(v.duration)
        const onEnd = () => { setPlaying(false); setReady(false); v.currentTime = 0 }
        const onBuf = () => {
            if (v.buffered.length > 0) setBuf((v.buffered.end(v.buffered.length - 1) / v.duration) * 100)
        }
        v.addEventListener('timeupdate', onTime)
        v.addEventListener('loadedmetadata', onMeta)
        v.addEventListener('ended', onEnd)
        v.addEventListener('progress', onBuf)
        return () => {
            v.removeEventListener('timeupdate', onTime)
            v.removeEventListener('loadedmetadata', onMeta)
            v.removeEventListener('ended', onEnd)
            v.removeEventListener('progress', onBuf)
        }
    }, [dragging])

    // ── Fullscreen ──
    useEffect(() => {
        const cb = () => setFs(!!document.fullscreenElement)
        document.addEventListener('fullscreenchange', cb)
        return () => document.removeEventListener('fullscreenchange', cb)
    }, [])

    const toggleFs = () => {
        if (!box.current) return
        if (!document.fullscreenElement) box.current.requestFullscreen?.()
        else document.exitFullscreen?.()
    }

    const toggleMute = () => {
        if (!vid.current) return
        vid.current.muted = !vid.current.muted
        setMuted(vid.current.muted)
    }

    const changeVol = (newVol: number) => {
        if (!vid.current) return
        vid.current.volume = newVol
        vid.current.muted = newVol === 0
        setVol(newVol)
        setMuted(newVol === 0)
    }

    // ── SIZES ──
    const iconSz = compact ? 16 : 20
    const barH = compact ? 6 : 8
    const dotSz = compact ? 14 : 16

    return (
        <div
            ref={box}
            style={{
                borderRadius: fs ? 0 : (compact ? '6px' : '10px'),
                overflow: 'hidden',
                background: '#000',
                borderTop: `2px solid ${g}`,
                borderLeft: '1px solid rgba(196,135,42,0.08)',
                borderRight: '1px solid rgba(196,135,42,0.08)',
                borderBottom: '1px solid rgba(196,135,42,0.08)',
                boxShadow: compact ? '0 4px 20px rgba(0,0,0,0.4)' : '0 16px 48px rgba(0,0,0,0.5)',
                display: 'flex', flexDirection: 'column',
            }}
        >
            {/* ── Video Area ── */}
            <div
                onClick={toggle}
                style={{
                    position: 'relative',
                    cursor: 'default',
                    flexGrow: 1,
                    minHeight: compact ? 200 : 340,
                }}
            >
                <video
                    ref={vid}
                    src={src}
                    preload="metadata"
                    playsInline
                    style={{
                        width: '100%',
                        height: '100%',
                        minHeight: compact ? 200 : 340,
                        maxHeight: fs ? '100vh' : (compact ? 320 : 600),
                        display: 'block',
                        background: '#000',
                        objectFit: 'contain',
                    }}
                />

                {/* Poster overlay */}
                {!ready && (
                    <div style={{
                        position: 'absolute', inset: 0,
                        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.7) 100%)',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        gap: compact ? '0.4rem' : '0.6rem',
                        cursor: 'pointer',
                    }}>
                        {/* Warm glow */}
                        <div style={{ position: 'absolute', top: '25%', left: '50%', transform: 'translateX(-50%)', width: '50%', height: '50%', background: 'radial-gradient(ellipse, rgba(196,135,42,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

                        <div
                            style={{
                                width: compact ? 52 : 72, height: compact ? 52 : 72,
                                borderRadius: '50%', border: `2px solid ${g}`,
                                background: 'rgba(196,135,42,0.05)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 0 32px rgba(196,135,42,0.12)',
                                transition: 'transform 0.2s, box-shadow 0.2s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 0 48px rgba(196,135,42,0.2)' }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 0 32px rgba(196,135,42,0.12)' }}
                        >
                            <svg width={compact ? 20 : 28} height={compact ? 20 : 28} viewBox="0 0 24 24" fill={g}>
                                <polygon points="9 5 20 12 9 19" />
                            </svg>
                        </div>

                        {filmTitle && !compact && (
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.75rem', color: 'var(--parchment, #e8dcc4)', opacity: 0.45 }}>{filmTitle}</div>
                        )}

                        {/* Branding */}
                        <div style={{ position: 'absolute', bottom: compact ? 8 : 12, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <div style={{ width: 16, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(196,135,42,0.25))' }} />
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: compact ? '0.35rem' : '0.4rem', color: g, opacity: 0.3, letterSpacing: '0.04em' }}>The Screening Room</span>
                            <div style={{ width: 16, height: '1px', background: 'linear-gradient(90deg, rgba(196,135,42,0.25), transparent)' }} />
                        </div>
                    </div>
                )}
            </div>

            {/* ── Controls Bar — ALWAYS visible ── */}
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: '#0a0806',
                    borderTop: '1px solid rgba(196,135,42,0.1)',
                    padding: compact ? '0.4rem 0.5rem 0.35rem' : '0.5rem 0.75rem 0.45rem',
                    cursor: 'default',
                    userSelect: 'none',
                }}
            >
                {/* Seek bar */}
                <div
                    ref={seekBar}
                    onMouseDown={e => { setDragging(true); seekTo(e.clientX) }}
                    onTouchStart={e => { setDragging(true); if (e.touches[0]) seekTo(e.touches[0].clientX) }}
                    style={{
                        width: '100%', height: barH,
                        background: 'rgba(255,255,255,0.08)',
                        borderRadius: barH / 2,
                        cursor: 'pointer',
                        position: 'relative',
                        marginBottom: compact ? '0.35rem' : '0.45rem',
                    }}
                >
                    {/* Buffered */}
                    <div style={{
                        position: 'absolute', top: 0, left: 0,
                        width: `${buf}%`, height: '100%',
                        background: 'rgba(196,135,42,0.12)',
                        borderRadius: barH / 2,
                    }} />
                    {/* Progress */}
                    <div style={{
                        position: 'absolute', top: 0, left: 0,
                        width: `${pct}%`, height: '100%',
                        background: `linear-gradient(90deg, ${g}, #daa520)`,
                        borderRadius: barH / 2,
                        boxShadow: '0 0 6px rgba(196,135,42,0.25)',
                        transition: dragging ? 'none' : 'width 0.15s linear',
                    }} />
                    {/* Dot */}
                    <div style={{
                        position: 'absolute', top: '50%', left: `${pct}%`,
                        transform: 'translate(-50%, -50%)',
                        width: dotSz, height: dotSz,
                        borderRadius: '50%',
                        background: g,
                        border: '2px solid #e8dcc4',
                        boxShadow: '0 0 8px rgba(196,135,42,0.4)',
                        cursor: 'grab',
                    }} />
                </div>

                {/* Button row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '0.5rem' : '0.75rem' }}>
                    {/* Play / Pause */}
                    <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', display: 'flex', lineHeight: 0 }}>
                        {playing ? (
                            <svg width={iconSz} height={iconSz} viewBox="0 0 24 24" fill={g}><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                        ) : (
                            <svg width={iconSz} height={iconSz} viewBox="0 0 24 24" fill={g}><polygon points="8 5 20 12 8 19" /></svg>
                        )}
                    </button>

                    {/* Time */}
                    <span style={{
                        fontFamily: 'var(--font-ui)',
                        fontSize: compact ? '0.55rem' : '0.65rem',
                        color: 'var(--parchment, #e8dcc4)',
                        fontVariantNumeric: 'tabular-nums',
                        opacity: 0.7,
                        letterSpacing: '0.03em',
                        minWidth: compact ? 60 : 80,
                    }}>
                        {fmt(time)} <span style={{ opacity: 0.35 }}>/</span> {fmt(dur)}
                    </span>

                    {/* Spacer + label */}
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                        {!compact && (
                            <span style={{
                                fontFamily: 'var(--font-display)',
                                fontSize: '0.45rem',
                                color: g,
                                opacity: 0.35,
                                letterSpacing: '0.04em',
                            }}>
                                The Screening Room
                            </span>
                        )}
                    </div>

                    {/* Volume group */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '0.3rem' : '0.4rem' }}>
                        <button onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', display: 'flex', lineHeight: 0 }}>
                            <svg width={iconSz} height={iconSz} viewBox="0 0 24 24" fill="none" stroke="var(--parchment, #e8dcc4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.55">
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="var(--parchment, #e8dcc4)" fillOpacity="0.55" stroke="none" />
                                {muted || vol === 0 ? (
                                    <><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></>
                                ) : vol < 0.5 ? (
                                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                ) : (
                                    <><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></>
                                )}
                            </svg>
                        </button>
                        <input
                            type="range"
                            min="0" max="1" step="0.01"
                            value={muted ? 0 : vol}
                            onChange={e => changeVol(parseFloat(e.target.value))}
                            aria-label="Volume"
                            style={{
                                width: compact ? 50 : 70,
                                height: 4,
                                appearance: 'none',
                                WebkitAppearance: 'none',
                                background: `linear-gradient(90deg, ${g} ${(muted ? 0 : vol) * 100}%, rgba(255,255,255,0.1) ${(muted ? 0 : vol) * 100}%)`,
                                borderRadius: 2,
                                outline: 'none',
                                cursor: 'pointer',
                            }}
                        />
                    </div>

                    {/* Fullscreen */}
                    <button onClick={toggleFs} aria-label="Fullscreen" style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', display: 'flex', lineHeight: 0 }}>
                        <svg width={iconSz} height={iconSz} viewBox="0 0 24 24" fill="none" stroke="var(--parchment, #e8dcc4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.55">
                            {fs ? (
                                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                            ) : (
                                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                            )}
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    )
}
