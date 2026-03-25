import { useRef, useState } from 'react'
import { Play, Pause, Volume2, VolumeX, Maximize, Loader } from 'lucide-react'

interface VideoPlayerProps {
    src: string
    title?: string
    onPlay?: () => void
}

export default function VideoPlayer({ src, title, onPlay }: VideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [playing, setPlaying] = useState(false)
    const [muted, setMuted] = useState(false)
    const [progress, setProgress] = useState(0)
    const [buffering, setBuffering] = useState(true)
    const [duration, setDuration] = useState(0)

    const toggle = () => {
        const v = videoRef.current
        if (!v) return
        if (v.paused) {
            v.play()
            setPlaying(true)
            onPlay?.()
        } else {
            v.pause()
            setPlaying(false)
        }
    }

    const handleTimeUpdate = () => {
        const v = videoRef.current
        if (!v || !v.duration) return
        setProgress((v.currentTime / v.duration) * 100)
    }

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        const v = videoRef.current
        if (!v) return
        const rect = e.currentTarget.getBoundingClientRect()
        const pct = (e.clientX - rect.left) / rect.width
        v.currentTime = pct * v.duration
    }

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60)
        const sec = Math.floor(s % 60)
        return `${m}:${sec.toString().padStart(2, '0')}`
    }

    const goFullscreen = () => {
        const v = videoRef.current
        if (v?.requestFullscreen) v.requestFullscreen()
    }

    return (
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000', borderRadius: '2px', overflow: 'hidden', border: '1px solid var(--ash)' }}>
            {/* Film grain overlay during buffering */}
            {buffering && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,7,3,0.8)' }}>
                    <Loader size={32} color="var(--sepia)" style={{ animation: 'spin 1s linear infinite' }} />
                </div>
            )}

            <video
                ref={videoRef}
                src={src}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={() => {
                    setDuration(videoRef.current?.duration || 0)
                    setBuffering(false)
                }}
                onWaiting={() => setBuffering(true)}
                onPlaying={() => setBuffering(false)}
                onEnded={() => setPlaying(false)}
                onClick={toggle}
                style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'pointer' }}
            />

            {/* Big play button overlay when paused */}
            {!playing && !buffering && (
                <div onClick={toggle} style={{ position: 'absolute', inset: 0, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(10,7,3,0.4)' }}>
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(139,105,20,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', border: '2px solid rgba(242,232,160,0.4)' }}>
                        <Play size={28} fill="var(--parchment)" color="transparent" />
                    </div>
                </div>
            )}

            {/* Controls bar */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 4, background: 'linear-gradient(transparent, rgba(10,7,3,0.95))', padding: '2rem 0.75rem 0.5rem' }}>
                {/* Progress bar */}
                <div onClick={handleSeek} style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.15)', cursor: 'pointer', marginBottom: '0.5rem', borderRadius: '2px', position: 'relative' }}>
                    <div style={{ width: `${progress}%`, height: '100%', background: 'var(--sepia)', borderRadius: '2px', transition: 'width 0.1s linear' }} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button onClick={toggle} style={{ background: 'none', border: 'none', color: 'var(--parchment)', cursor: 'pointer', padding: 0 }}>
                        {playing ? <Pause size={16} /> : <Play size={16} />}
                    </button>

                    <button onClick={() => { setMuted(!muted); if (videoRef.current) videoRef.current.muted = !muted }} style={{ background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer', padding: 0 }}>
                        {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>

                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.08em' }}>
                        {formatTime(videoRef.current?.currentTime || 0)} / {formatTime(duration)}
                    </span>

                    <div style={{ flex: 1 }} />

                    {title && (
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--sepia)', letterSpacing: '0.15em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
                            {title}
                        </span>
                    )}

                    <button onClick={goFullscreen} style={{ background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer', padding: 0 }}>
                        <Maximize size={14} />
                    </button>
                </div>
            </div>
        </div>
    )
}
