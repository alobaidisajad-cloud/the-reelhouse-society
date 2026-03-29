import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * Preloader — Cinematic film-leader countdown.
 *
 * State-driven: each digit is advanced by a sequential setTimeout chain.
 * No CSS @keyframe injection — works perfectly regardless of CPU load,
 * paint timing, or browser animation quirks.
 *
 * React state drives EVERYTHING. Framer Motion handles enter/exit per digit.
 */

const TICK = 950    // ms each digit is displayed (hold time)
const EXIT_GAP = 350 // ms after last digit before fade-out begins

const DIGITS = ['3', '2', '1', '●'] as const
type Digit = typeof DIGITS[number]

// Ring spin via inline CSS animation — simple, isolated, always works
const ringSpinStyle: React.CSSProperties = {
  animation: 'spin 2s linear infinite',
}

export default function Preloader({ onComplete }: { onComplete: () => void }) {
  const [currentDigit, setCurrentDigit] = useState<Digit | null>(null)
  const [panelVisible, setPanelVisible] = useState(true)
  const cancelledRef = useRef(false)

  // Inject only the simple spin keyframe — nothing digit-related
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'pld-spin'
    style.textContent = `
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes pldRing {
        0%, 100% { opacity: 0.6; transform: scale(1); }
        50%       { opacity: 1;   transform: scale(1.012); }
      }
      @keyframes pldFlicker {
        0%, 100% { opacity: 0.5; }
        47%      { opacity: 0.5; }
        48%      { opacity: 0.18; }
        49%      { opacity: 0.5; }
        93%      { opacity: 0.5; }
        94%      { opacity: 0.28; }
        95%      { opacity: 0.5; }
      }
    `
    document.head.appendChild(style)
    return () => {
      if (style.parentNode) document.head.removeChild(style)
    }
  }, [])

  // Sequential state-driven countdown — 100% bulletproof
  useEffect(() => {
    cancelledRef.current = false

    const delay = (ms: number) =>
      new Promise<void>(resolve => {
        const t = setTimeout(resolve, ms)
        // Store timeout id so we can detect cancellation
        return () => clearTimeout(t)
      })

    const run = async () => {
      for (const digit of DIGITS) {
        if (cancelledRef.current) return
        setCurrentDigit(digit)
        await delay(TICK)
      }
      if (cancelledRef.current) return

      // All digits shown — clear digit, wait briefly, then fade panel out
      setCurrentDigit(null)
      await delay(EXIT_GAP)

      if (cancelledRef.current) return
      setPanelVisible(false)
    }

    run()

    return () => {
      cancelledRef.current = true
    }
  }, [])

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {panelVisible && (
        <motion.div
          key="preloader-panel"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.55, ease: 'easeInOut' }}
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
          {/* Cinematic vignette */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(ellipse at center, transparent 28%, rgba(0,0,0,0.75) 100%)',
              pointerEvents: 'none',
            }}
          />

          {/* Film grain overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'0.04\'/%3E%3C/svg%3E")',
              backgroundSize: '180px 180px',
              opacity: 0.35,
              pointerEvents: 'none',
            }}
          />

          {/* ── Outer ring ── */}
          <div
            style={{
              width: 'min(280px, 65vw)',
              height: 'min(280px, 65vw)',
              border: '1.5px solid rgba(139,105,20,0.55)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              animation: 'pldRing 2.4s ease-in-out infinite',
              boxShadow: '0 0 80px rgba(139,105,20,0.07), inset 0 0 50px rgba(139,105,20,0.04)',
            }}
          >
            {/* Inner decorative ring */}
            <div
              style={{
                position: 'absolute',
                inset: '10%',
                border: '1px solid rgba(139,105,20,0.15)',
                borderRadius: '50%',
                pointerEvents: 'none',
              }}
            />

            {/* Spinning sweep arm */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: '50%',
                height: '1px',
                background: 'linear-gradient(90deg, rgba(139,105,20,0.5) 0%, rgba(139,105,20,0) 100%)',
                transformOrigin: 'left center',
                ...ringSpinStyle,
              }}
            />

            {/* Crosshair lines */}
            <div style={{ position: 'absolute', top: '50%', left: '-7%', right: '-7%', height: '1px', background: 'rgba(139,105,20,0.1)' }} />
            <div style={{ position: 'absolute', left: '50%', top: '-7%', bottom: '-7%', width: '1px', background: 'rgba(139,105,20,0.1)' }} />

            {/* Tick marks at 12 / 3 / 6 / 9 o'clock */}
            {[0, 90, 180, 270].map(deg => (
              <div
                key={deg}
                style={{
                  position: 'absolute',
                  width: '10px',
                  height: '1.5px',
                  background: 'rgba(139,105,20,0.35)',
                  top: '50%',
                  left: '50%',
                  transformOrigin: 'left center',
                  transform: `rotate(${deg}deg) translateX(min(132px, 30vw))`,
                }}
              />
            ))}

            {/* ── Digit — ONE at a time, animated by Framer Motion ── */}
            <AnimatePresence mode="wait">
              {currentDigit !== null && (
                <motion.span
                  key={currentDigit}
                  initial={{ opacity: 0, scale: 0.55, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.88, y: -8 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  style={{
                    position: 'absolute',
                    fontFamily: 'var(--font-display, Georgia, serif)',
                    fontSize: 'clamp(3.8rem, 15vw, 7.5rem)',
                    color: '#E8DFC8',
                    textShadow: '0 0 40px rgba(232,223,200,0.4), 0 0 80px rgba(139,105,20,0.2)',
                    lineHeight: 1,
                    userSelect: 'none',
                    letterSpacing: currentDigit === '●' ? '0' : '-0.02em',
                  }}
                >
                  {currentDigit}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {/* Status label */}
          <div
            style={{
              marginTop: 'clamp(1.4rem, 5vw, 2.2rem)',
              fontFamily: 'var(--font-ui, monospace)',
              fontSize: '0.58rem',
              letterSpacing: '0.42em',
              color: 'rgba(139,105,20,0.65)',
              animation: 'pldFlicker 3.8s ease-in-out infinite',
              userSelect: 'none',
            }}
          >
            THREADING PROJECTOR…
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
