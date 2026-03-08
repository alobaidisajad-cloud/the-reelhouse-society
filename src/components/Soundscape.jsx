import { Volume2, VolumeX } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useSoundscape } from '../store'

// ── Fix #4: Module-level constants — not re-allocated on every render ──
const ICON_ANIMATE_PLAYING = { scale: [1, 1.2, 1] }
const ICON_ANIMATE_STOPPED = {}

export default function Soundscape() {
    const { isPlaying, toggle } = useSoundscape()
    const audioRef = useRef(null)
    const [hasInteracted, setHasInteracted] = useState(false)

    useEffect(() => {
        if (isPlaying && hasInteracted) {
            audioRef.current?.play().catch(() => {
                console.warn('Playback blocked by browser')
            })
        } else {
            audioRef.current?.pause()
        }
    }, [isPlaying, hasInteracted])

    return (
        <>
            {/* Fix #2: preload="none" — don't fetch audio until user clicks */}
            <audio
                ref={audioRef}
                src="https://upload.wikimedia.org/wikipedia/commons/4/46/Film_projector_running_sound.oga"
                loop
                preload="none"
                onError={() => { }}
            />
            <audio
                id="shutter-audio"
                src="https://upload.wikimedia.org/wikipedia/commons/e/e6/Camera_click.ogg"
                preload="none"
                onError={() => { }}
            />

            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="soundscape-control"
                style={{
                    position: 'fixed',
                    bottom: '1.5rem',
                    left: '1.5rem',
                    zIndex: 100000,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    background: 'rgba(10, 10, 10, 0.8)',
                    backdropFilter: 'blur(10px)',
                    padding: '0.5rem 1rem',
                    borderRadius: '2rem',
                    border: '1px solid var(--ash)',
                    cursor: 'pointer'
                }}
                onClick={() => {
                    setHasInteracted(true)
                    toggle()
                }}
            >
                <motion.div
                    animate={isPlaying ? ICON_ANIMATE_PLAYING : ICON_ANIMATE_STOPPED}
                    transition={{ repeat: isPlaying ? Infinity : 0, duration: 2 }}
                >
                    {isPlaying ? <Volume2 size={16} color="var(--sepia)" /> : <VolumeX size={16} color="var(--fog)" />}
                </motion.div>
                <div style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: '0.6rem',
                    letterSpacing: '0.15em',
                    color: isPlaying ? 'var(--sepia)' : 'var(--fog)',
                    textTransform: 'uppercase'
                }}>
                    {isPlaying ? 'Projector Rolling' : 'Soundscape Muted'}
                </div>

                <AnimatePresence>
                    {isPlaying && (
                        <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            style={{
                                fontFamily: 'var(--font-ui)',
                                fontSize: '0.5rem',
                                letterSpacing: '0.1em',
                                color: 'var(--sepia)',
                                opacity: 0.6,
                                marginLeft: '0.5rem',
                                paddingLeft: '0.5rem',
                                borderLeft: '1px solid var(--ash)'
                            }}
                        >
                            35MM ACTIVE
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </>
    )
}
