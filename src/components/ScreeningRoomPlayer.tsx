import { useState, useRef, useEffect, useCallback } from 'react'

interface ScreeningRoomPlayerProps {
    src: string
    filmTitle?: string
    compact?: boolean
}

function fmt(s: number): string {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function ScreeningRoomPlayer({ src, filmTitle, compact = false }: ScreeningRoomPlayerProps) {
    const v = useRef<HTMLVideoElement>(null)
    const bar = useRef<HTMLDivElement>(null)
    const wrap = useRef<HTMLDivElement>(null)
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

    const [on, setOn] = useState(false)
    const [t, setT] = useState(0)
    const [dur, setDur] = useState(0)
    const [buf, setBuf] = useState(0)
    const [mut, setMut] = useState(false)
    const [ctrl, setCtrl] = useState(true)
    const [fs, setFs] = useState(false)
    const [begun, setBegun] = useState(false)

    const pct = dur > 0 ? (t / dur) * 100 : 0

    const showCtrl = useCallback(() => {
        setCtrl(true)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => {
            if (v.current && !v.current.paused) setCtrl(false)
        }, 3000)
    }, [])

    const play = useCallback(() => {
        if (!v.current) return
        if (v.current.paused) {
            v.current.play(); setOn(true); setBegun(true)
        } else {
            v.current.pause(); setOn(false)
        }
        showCtrl()
    }, [showCtrl])

    const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!bar.current || !v.current) return
        const r = bar.current.getBoundingClientRect()
        v.current.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * v.current.duration
        showCtrl()
    }, [showCtrl])

    useEffect(() => {
        const el = v.current
        if (!el) return
        const onT = () => setT(el.currentTime)
        const onM = () => setDur(el.duration)
        const onE = () => { setOn(false); setBegun(false) }
        const onP = () => { if (el.buffered.length > 0) setBuf((el.buffered.end(el.buffered.length - 1) / el.duration) * 100) }
        el.addEventListener('timeupdate', onT)
        el.addEventListener('loadedmetadata', onM)
        el.addEventListener('ended', onE)
        el.addEventListener('progress', onP)
        const onFs = () => setFs(!!document.fullscreenElement)
        document.addEventListener('fullscreenchange', onFs)
        return () => {
            el.removeEventListener('timeupdate', onT)
            el.removeEventListener('loadedmetadata', onM)
            el.removeEventListener('ended', onE)
            el.removeEventListener('progress', onP)
            document.removeEventListener('fullscreenchange', onFs)
        }
    }, [])

    useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

    const g = '#c4872a'

    return (
        <div
            ref={wrap}
            onMouseMove={showCtrl}
            onMouseEnter={() => setCtrl(true)}
            onClick={e => { if (!(e.target as HTMLElement).closest('[data-c]')) play() }}
            style={{
                position: 'relative',
                borderRadius: fs ? 0 : (compact ? '6px' : '10px'),
                overflow: 'hidden',
                background: '#000',
                cursor: 'pointer',
                // Prominent gold accent top border
                borderTop: `2px solid ${g}`,
                borderLeft: '1px solid rgba(196,135,42,0.08)',
                borderRight: '1px solid rgba(196,135,42,0.08)',
                borderBottom: '1px solid rgba(196,135,42,0.08)',
                boxShadow: compact
                    ? '0 4px 20px rgba(0,0,0,0.4)'
                    : '0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(196,135,42,0.04)',
            }}
        >
            {/* Video element */}
            <video
                ref={v}
                src={src}
                preload="metadata"
                playsInline
                style={{
                    width: '100%',
                    // BIGGER — this is the main event
                    maxHeight: fs ? '100vh' : (compact ? 280 : 560),
                    minHeight: compact ? 180 : 300,
                    display: 'block',
                    background: '#000',
                    objectFit: 'contain',
                }}
            />

            {/* Pre-play overlay */}
            {!begun && (
                <div style={{
                    position: 'absolute', inset: 0,
                    background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.7) 100%)',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: compact ? '0.4rem' : '0.6rem',
                    zIndex: 2,
                }}>
                    <div style={{
                        width: compact ? 50 : 72,
                        height: compact ? 50 : 72,
                        borderRadius: '50%',
                        border: `2px solid ${g}`,
                        background: 'rgba(196,135,42,0.06)',
                        backdropFilter: 'blur(6px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 40px rgba(196,135,42,0.12)',
                    }}>
                        <svg width={compact ? 20 : 28} height={compact ? 20 : 28} viewBox="0 0 24 24" fill={g}>
                            <polygon points="8 5 20 12 8 19" />
                        </svg>
                    </div>
                    {filmTitle && !compact && (
                        <div style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: '0.8rem',
                            color: 'var(--parchment, #e8dcc4)',
                            opacity: 0.5,
                        }}>
                            {filmTitle}
                        </div>
                    )}
                </div>
            )}

            {/* Controls */}
            <div
                data-c="1"
                onClick={e => e.stopPropagation()}
                style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.9) 100%)',
                    padding: compact ? '2rem 0.6rem 0.5rem' : '2.5rem 1rem 0.6rem',
                    opacity: ctrl || !on ? 1 : 0,
                    transition: 'opacity 0.3s',
                    zIndex: 3,
                }}
            >
                {/* Seek bar */}
                <div
                    ref={bar}
                    onClick={seek}
                    style={{
                        width: '100%',
                        height: compact ? 4 : 5,
                        background: 'rgba(255,255,255,0.1)',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        position: 'relative',
                        marginBottom: compact ? '0.4rem' : '0.6rem',
                    }}
                >
                    <div style={{ position: 'absolute', top: 0, left: 0, width: `${buf}%`, height: '100%', background: 'rgba(255,255,255,0.06)', borderRadius: '3px' }} />
                    <div style={{
                        position: 'absolute', top: 0, left: 0,
                        width: `${pct}%`, height: '100%',
                        background: g,
                        borderRadius: '3px',
                        boxShadow: `0 0 8px rgba(196,135,42,0.3)`,
                    }} />
                    <div style={{
                        position: 'absolute', top: '50%', left: `${pct}%`,
                        transform: 'translate(-50%, -50%)',
                        width: compact ? 10 : 12,
                        height: compact ? 10 : 12,
                        borderRadius: '50%',
                        background: g,
                        boxShadow: `0 0 8px rgba(196,135,42,0.5)`,
                        opacity: ctrl ? 1 : 0,
                        transition: 'opacity 0.2s',
                    }} />
                </div>

                {/* Bottom row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '0.6rem' : '0.8rem' }}>
                    {/* Play/Pause */}
                    <button onClick={play} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}>
                        {on ? (
                            <svg width={compact ? 16 : 20} height={compact ? 16 : 20} viewBox="0 0 24 24" fill={g}>
                                <rect x="6" y="4" width="4" height="16" rx="1" />
                                <rect x="14" y="4" width="4" height="16" rx="1" />
                            </svg>
                        ) : (
                            <svg width={compact ? 16 : 20} height={compact ? 16 : 20} viewBox="0 0 24 24" fill={g}>
                                <polygon points="8 5 20 12 8 19" />
                            </svg>
                        )}
                    </button>

                    {/* Time */}
                    <span style={{
                        fontFamily: 'var(--font-ui)',
                        fontSize: compact ? '0.5rem' : '0.6rem',
                        color: 'rgba(255,255,255,0.6)',
                        letterSpacing: '0.06em',
                        fontVariantNumeric: 'tabular-nums',
                    }}>
                        {fmt(t)}<span style={{ opacity: 0.4, margin: '0 0.15rem' }}>/</span>{fmt(dur)}
                    </span>

                    <div style={{ flex: 1 }} />

                    {/* Screening Room label */}
                    {!compact && (
                        <span style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: '0.5rem',
                            color: g,
                            opacity: 0.5,
                            letterSpacing: '0.04em',
                        }}>
                            The Screening Room
                        </span>
                    )}

                    {/* Mute */}
                    <button onClick={() => { if (v.current) { v.current.muted = !v.current.muted; setMut(v.current.muted) }; showCtrl() }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}>
                        <svg width={compact ? 16 : 18} height={compact ? 16 : 18} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="rgba(255,255,255,0.5)" />
                            {mut ? (
                                <><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></>
                            ) : (
                                <><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></>
                            )}
                        </svg>
                    </button>

                    {/* Fullscreen */}
                    <button onClick={() => {
                        if (!wrap.current) return
                        if (!document.fullscreenElement) wrap.current.requestFullscreen?.()
                        else document.exitFullscreen?.()
                        showCtrl()
                    }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}>
                        <svg width={compact ? 16 : 18} height={compact ? 16 : 18} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
