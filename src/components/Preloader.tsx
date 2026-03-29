import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * Preloader — Cinematic film-leader countdown.
 *
 * Every digit is in the DOM from mount. Visibility is driven
 * entirely by CSS @keyframes (compositor-thread) — zero React
 * state changes during the countdown, so it never jitters or
 * skips numbers even when the main thread is busy booting the app.
 *
 * React only handles the final dismissal (one setTimeout).
 */

const TICK = 900  // ms each digit stays visible
const TOTAL = TICK * 4 + 500  // 3 digits + dot + exit buffer

const DIGITS = ['3', '2', '1', '●'] as const

// Injected once on mount, removed on unmount
const CSS = `
@keyframes pld-digit {
  0%   { opacity: 0; transform: scale(0.5) translateY(4px); }
  16%  { opacity: 1; transform: scale(1.06) translateY(0); }
  26%  { opacity: 1; transform: scale(1); }
  82%  { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.88); }
}
@keyframes pld-sweep {
  to { transform: rotate(360deg); }
}
@keyframes pld-ring {
  0%, 100% { opacity: 0.65; transform: scale(1); }
  50%      { opacity: 1;    transform: scale(1.01); }
}
@keyframes pld-flicker {
  0%, 100% { opacity: 0.5; }
  47%      { opacity: 0.5; }
  48%      { opacity: 0.2; }
  49%      { opacity: 0.5; }
  93%      { opacity: 0.5; }
  94%      { opacity: 0.3; }
  95%      { opacity: 0.5; }
}
@keyframes pld-flash {
  0%   { opacity: 0; }
  40%  { opacity: 0.7; }
  100% { opacity: 0; }
}
`

export default function Preloader({ onComplete }: { onComplete: () => void }) {
    const [visible, setVisible] = useState(true)

    useEffect(() => {
        // Inject keyframes
        const style = document.createElement('style')
        style.textContent = CSS
        document.head.appendChild(style)

        // Single timeout — only React work is the final dismissal
        const timer = setTimeout(() => setVisible(false), TOTAL)
        return () => {
            clearTimeout(timer)
            if (style.parentNode) document.head.removeChild(style)
        }
    }, [])

    return (
        <AnimatePresence onExitComplete={onComplete}>
            {visible && (
                <motion.div
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 100000,
                        background: '#0A0806',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                    }}
                >
                    {/* Vignette — darkened edges for cinematic depth */}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.7) 100%)',
                        pointerEvents: 'none',
                    }} />

                    {/* Outer ring */}
                    <div style={{
                        width: 'min(260px, 62vw)',
                        height: 'min(260px, 62vw)',
                        border: '1.5px solid rgba(139,105,20,0.6)',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        animation: 'pld-ring 2.2s ease-in-out infinite',
                        boxShadow: '0 0 60px rgba(139,105,20,0.08), inset 0 0 40px rgba(139,105,20,0.04)',
                    }}>

                        {/* Inner ring — premium double-ring look */}
                        <div style={{
                            position: 'absolute',
                            inset: '14%',
                            border: '1px solid rgba(139,105,20,0.18)',
                            borderRadius: '50%',
                            pointerEvents: 'none',
                        }} />

                        {/* Spinning sweep — gradient fades out toward edge */}
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            width: '50%',
                            height: '1px',
                            background: 'linear-gradient(90deg, rgba(139,105,20,0.45), rgba(139,105,20,0))',
                            transformOrigin: 'left center',
                            animation: 'pld-sweep 1.8s linear infinite',
                        }} />

                        {/* Crosshair lines */}
                        <div style={{ position: 'absolute', top: '50%', left: '-6%', right: '-6%', height: '1px', background: 'rgba(139,105,20,0.12)' }} />
                        <div style={{ position: 'absolute', left: '50%', top: '-6%', bottom: '-6%', width: '1px', background: 'rgba(139,105,20,0.12)' }} />

                        {/* Tick marks at 12/3/6/9 o'clock */}
                        {[0, 90, 180, 270].map(deg => (
                            <div key={deg} style={{
                                position: 'absolute',
                                width: '8px',
                                height: '1px',
                                background: 'rgba(139,105,20,0.3)',
                                top: '50%',
                                left: '50%',
                                transformOrigin: 'left center',
                                transform: `rotate(${deg}deg) translateX(min(122px, 28vw))`,
                            }} />
                        ))}

                        {/* Countdown digits — ALL rendered, CSS handles visibility */}
                        {DIGITS.map((d, i) => (
                            <span
                                key={d}
                                aria-hidden={i > 0 ? 'true' : undefined}
                                style={{
                                    position: 'absolute',
                                    opacity: 0,
                                    fontFamily: 'var(--font-display)',
                                    fontSize: 'clamp(3.5rem, 14vw, 7rem)',
                                    color: 'var(--parchment, #E8DFC8)',
                                    textShadow: '0 0 30px rgba(232,223,200,0.35), 0 0 60px rgba(139,105,20,0.15)',
                                    animation: `pld-digit ${TICK}ms ease-out ${i * TICK}ms both`,
                                    lineHeight: 1,
                                    userSelect: 'none',
                                }}
                            >
                                {d}
                            </span>
                        ))}
                    </div>

                    {/* Status label */}
                    <div style={{
                        marginTop: 'clamp(1.2rem, 4vw, 2rem)',
                        fontFamily: 'var(--font-ui, monospace)',
                        fontSize: '0.6rem',
                        letterSpacing: '0.4em',
                        color: 'rgba(139,105,20,0.7)',
                        animation: 'pld-flicker 4s ease-in-out infinite',
                        userSelect: 'none',
                    }}>
                        THREADING PROJECTOR…
                    </div>

                    {/* Film-burn flash right before exit */}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'var(--flicker, #F2E8A0)',
                        pointerEvents: 'none',
                        opacity: 0,
                        animation: `pld-flash 0.4s ease-out ${TICK * 3 + 200}ms both`,
                        zIndex: 1,
                    }} />
                </motion.div>
            )}
        </AnimatePresence>
    )
}
