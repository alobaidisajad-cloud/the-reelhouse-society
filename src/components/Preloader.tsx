import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * Preloader — Cinematic film-leader countdown.
 *
 * ALL timeouts are scheduled at mount in a single useEffect.
 * No async/await, no cancellation refs, no race conditions.
 * The sequence is hardcoded: 3 → 2 → 1 → ● → [fade out]
 *
 * This is the simplest and most reliable implementation possible.
 */

// ms each digit is held on screen
const T = 950

// Scheduled at: T*0, T*1, T*2, T*3, T*4, T*4+400
// Digits:        '3'  '2'  '1'  '●'  null  [panel fade]

export default function Preloader({ onComplete }: { onComplete: () => void }) {
  const [digit, setDigit] = useState<string | null>(null)
  const [visible, setVisible] = useState(true)

  // Lock body scroll for the entire duration of the preloader
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    // All timers fire from t=0 reference — nothing can interrupt the sequence
    // Start null so '3' gets the same AnimatePresence entrance animation as other digits
    const t0 = setTimeout(() => setDigit('3'), 80)   // tiny delay so first digit animates in
    const t1 = setTimeout(() => setDigit('2'), T + 80)
    const t2 = setTimeout(() => setDigit('1'), T * 2 + 80)
    const t3 = setTimeout(() => setDigit('●'), T * 3 + 80)
    const t4 = setTimeout(() => setDigit(null), T * 4 + 80)   // clear digit
    const t5 = setTimeout(() => setVisible(false), T * 4 + 500) // fade out panel

    return () => {
      clearTimeout(t0)
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
      clearTimeout(t5)
    }
  }, [])

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {visible && (
        <motion.div
          key="pld"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
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
          {/* Vignette */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.72) 100%)',
          }} />

          {/* Film grain */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.3,
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E")`,
            backgroundSize: '180px',
          }} />

          {/* Outer ring */}
          <div style={{
            width: 'min(270px, 64vw)',
            height: 'min(270px, 64vw)',
            border: '1.5px solid rgba(139,105,20,0.55)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            animation: 'pldRing 2.4s ease-in-out infinite',
            boxShadow: '0 0 80px rgba(139,105,20,0.06), inset 0 0 50px rgba(139,105,20,0.03)',
          }}>

            {/* Inner decorative ring */}
            <div style={{
              position: 'absolute', inset: '11%',
              border: '1px solid rgba(139,105,20,0.14)',
              borderRadius: '50%', pointerEvents: 'none',
            }} />

            {/* Spinning sweep arm */}
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              width: '50%', height: '1px',
              background: 'linear-gradient(90deg, rgba(139,105,20,0.55) 0%, transparent 100%)',
              transformOrigin: 'left center',
              animation: 'pldSpin 1.8s linear infinite',
            }} />

            {/* Crosshairs */}
            <div style={{ position: 'absolute', top: '50%', left: '-6%', right: '-6%', height: '1px', background: 'rgba(139,105,20,0.09)' }} />
            <div style={{ position: 'absolute', left: '50%', top: '-6%', bottom: '-6%', width: '1px', background: 'rgba(139,105,20,0.09)' }} />

            {/* Tick marks */}
            {[0, 90, 180, 270].map(deg => (
              <div key={deg} style={{
                position: 'absolute', width: '9px', height: '1.5px',
                background: 'rgba(139,105,20,0.32)',
                top: '50%', left: '50%',
                transformOrigin: 'left center',
                transform: `rotate(${deg}deg) translateX(min(127px, 29vw))`,
              }} />
            ))}

            {/* ── Digit — AnimatePresence mode sync = simultaneous crossfade ── */}
            <AnimatePresence mode="sync">
              {digit !== null && (
                <motion.span
                  key={digit}
                  initial={{ opacity: 0, scale: 0.6, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 1.05, y: -6 }}
                  transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
                  style={{
                    position: 'absolute',
                    fontFamily: 'var(--font-display, Georgia, serif)',
                    fontSize: 'clamp(4rem, 15vw, 7.5rem)',
                    color: '#E8DFC8',
                    textShadow: '0 0 40px rgba(232,223,200,0.38), 0 0 90px rgba(139,105,20,0.18)',
                    lineHeight: 1,
                    userSelect: 'none',
                  }}
                >
                  {digit}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {/* Status label */}
          <div style={{
            marginTop: 'clamp(1.4rem, 5vw, 2.2rem)',
            fontFamily: 'var(--font-ui, monospace)',
            fontSize: '0.58rem',
            letterSpacing: '0.42em',
            color: 'rgba(139,105,20,0.6)',
            animation: 'pldFlicker 3.8s ease-in-out infinite',
            userSelect: 'none',
          }}>
            THREADING PROJECTOR…
          </div>

          {/* Keyframes — injected once, only for ring/spin/flicker. Digit timing is 100% JS. */}
          <style>{`
            @keyframes pldSpin   { to { transform: rotate(360deg); } }
            @keyframes pldRing   { 0%,100%{opacity:.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.013)} }
            @keyframes pldFlicker{ 0%,100%{opacity:.5} 47%{opacity:.5} 48%{opacity:.15} 49%{opacity:.5} 93%{opacity:.5} 94%{opacity:.25} 95%{opacity:.5} }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
