import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

/*  ═══════════════════════════════════════════════════════════════
    REELHOUSE — THE PROJECTOR SEQUENCE
    A cinematic 3-2-1 film-leader countdown.
    ═══════════════════════════════════════════════════════════════

    ARCHITECTURE (bulletproof by design):
    ─────────────────────────────────────
    • All 4 digits exist in the DOM from first paint.
    • A single `activeIdx` integer toggles which one is opaque.
    • Sequencing uses CHAINED timeouts: each callback schedules
      the next, so React 18 batching can never collapse them.
    • CSS `transition` handles fade — runs on the compositor
      thread, immune to main-thread jank.
    • Framer Motion is used ONLY for the final curtain fade-out.
    • Body scroll is locked for the entire duration.
    ─────────────────────────────────────────────────────────────*/

const HOLD = 920   // ms a digit stays visible
const DIGITS = ['3', '2', '1', '●'] as const

export default function Preloader({ onComplete }: { onComplete: () => void }) {
  const [idx, setIdx] = useState(-1)       // which digit is lit (-1 = none)
  const [curtain, setCurtain] = useState(true) // panel visible
  const bag = useRef<number[]>([])         // timeout ids for cleanup

  /* ── schedule helper — pushes every id into the cleanup bag ── */
  const after = useCallback((ms: number, fn: () => void) => {
    const id = window.setTimeout(fn, ms)
    bag.current.push(id)
  }, [])

  /* ── lock scroll ── */
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  /* ── the countdown chain ── */
  useEffect(() => {
    // Step through each digit one at a time.
    // Each step only schedules the NEXT step inside its own callback,
    // so React can never batch two setIdx calls together.
    const chain = (i: number) => {
      if (i < DIGITS.length) {
        after(i === 0 ? 150 : HOLD, () => {
          setIdx(i)
          chain(i + 1)
        })
      } else {
        // All digits shown → clear → fade out
        after(HOLD, () => {
          setIdx(-1)
          after(350, () => setCurtain(false))
        })
      }
    }
    chain(0)
    return () => { bag.current.forEach(clearTimeout); bag.current = [] }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {curtain && (
        <motion.div
          key="projector"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          style={S.curtain}
        >
          {/* ── Layers: vignette + grain + scan lines ── */}
          <div style={S.vignette} />
          <div style={S.grain} />
          <div style={S.scanlines} />

          {/* ── The Gate — outer film-leader circle ── */}
          <div style={S.gate}>

            {/* Outer ring glow */}
            <div style={S.ringOuter} />

            {/* Inner ring */}
            <div style={S.ringInner} />

            {/* Sweep arm — spinning radar line */}
            <div style={S.sweep} />

            {/* Cross hairs */}
            <div style={S.hairH} />
            <div style={S.hairV} />

            {/* Tick marks — 12 / 3 / 6 / 9 positions */}
            {[0, 90, 180, 270].map(deg => (
              <div key={deg} style={{
                ...S.tick,
                transform: `rotate(${deg}deg) translateX(min(130px, 30vw))`,
              }} />
            ))}

            {/* Small circle center dot */}
            <div style={S.centerDot} />

            {/* ══════ DIGITS — all 4 in DOM, CSS transition toggles ══════ */}
            <div style={S.digitBed}>
              {DIGITS.map((d, i) => (
                <span
                  key={d}
                  aria-hidden={idx !== i}
                  style={{
                    ...S.digit,
                    opacity: idx === i ? 1 : 0,
                    transform: idx === i ? 'scale(1)' : idx > i ? 'scale(1.2)' : 'scale(0.55)',
                    filter: idx === i
                      ? 'drop-shadow(0 0 40px rgba(248,240,192,0.5)) drop-shadow(0 0 80px rgba(196,150,26,0.25))'
                      : 'none',
                  }}
                >
                  {d}
                </span>
              ))}
            </div>
          </div>

          {/* ── "THREADING PROJECTOR…" label ── */}
          <div style={S.label}>THREADING PROJECTOR…</div>

          {/* ── Film-burn flash (fires once near end) ── */}
          <div
            style={{
              ...S.flash,
              animationDelay: `${150 + HOLD * 3 + 200}ms`,
            }}
          />

          {/* ── Keyframes (ring + sweep + flicker + flash only) ── */}
          <style>{KEYFRAMES}</style>
        </motion.div>
      )}
    </AnimatePresence>
  )
}


/* ══════════════════════════════════════════════════════════════
   STYLES — all inline for zero-dependency, zero-side-effect
   ══════════════════════════════════════════════════════════════ */

const S: Record<string, React.CSSProperties> = {
  curtain: {
    position: 'fixed',
    inset: 0,
    zIndex: 100000,
    background: '#0A0806',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    touchAction: 'none',       // prevent mobile scroll / pull-to-refresh
    userSelect: 'none',
    WebkitUserSelect: 'none',
  },

  vignette: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    background: 'radial-gradient(ellipse 80% 75% at center, transparent 25%, rgba(0,0,0,0.85) 100%)',
  },

  grain: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    opacity: 0.06,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`,
    backgroundSize: '160px',
    mixBlendMode: 'overlay',
  },

  scanlines: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    opacity: 0.04,
    background: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.5) 2px, rgba(0,0,0,0.5) 4px)`,
  },

  /* ── The Gate (film-leader circle) ── */
  gate: {
    width: 'min(280px, 66vw)',
    height: 'min(280px, 66vw)',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  ringOuter: {
    position: 'absolute', inset: 0,
    border: '1.5px solid rgba(196,150,26,0.45)',
    borderRadius: '50%',
    animation: 'pldPulse 2.6s ease-in-out infinite',
    boxShadow: '0 0 60px rgba(196,150,26,0.06), 0 0 120px rgba(196,150,26,0.03), inset 0 0 40px rgba(196,150,26,0.03)',
  },

  ringInner: {
    position: 'absolute', inset: '12%',
    border: '1px solid rgba(196,150,26,0.12)',
    borderRadius: '50%',
    pointerEvents: 'none',
  },

  sweep: {
    position: 'absolute',
    top: '50%', left: '50%',
    width: '50%', height: '1px',
    background: 'linear-gradient(90deg, rgba(196,150,26,0.6) 0%, rgba(196,150,26,0) 85%)',
    transformOrigin: 'left center',
    animation: 'pldSweep 2s linear infinite',
  },

  hairH: {
    position: 'absolute', top: '50%', left: '-8%', right: '-8%',
    height: '1px',
    background: 'rgba(196,150,26,0.08)',
  },

  hairV: {
    position: 'absolute', left: '50%', top: '-8%', bottom: '-8%',
    width: '1px',
    background: 'rgba(196,150,26,0.08)',
  },

  tick: {
    position: 'absolute',
    width: '10px', height: '1.5px',
    background: 'rgba(196,150,26,0.28)',
    top: '50%', left: '50%',
    transformOrigin: 'left center',
  },

  centerDot: {
    position: 'absolute',
    width: '4px', height: '4px',
    borderRadius: '50%',
    background: 'rgba(196,150,26,0.25)',
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
  },

  /* ── Digit bed — covers the gate, flex-centers contents ── */
  digitBed: {
    position: 'absolute', inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },

  digit: {
    position: 'absolute',
    fontFamily: `'Rye', Georgia, serif`,
    fontSize: 'clamp(4.2rem, 16vw, 8rem)',
    color: '#EDE5D8',
    lineHeight: 1,
    transition: 'opacity 0.25s ease-out, transform 0.25s ease-out, filter 0.25s ease-out',
    willChange: 'opacity, transform',
  },

  label: {
    marginTop: 'clamp(1.6rem, 5vw, 2.4rem)',
    fontFamily: `'Bungee', monospace, sans-serif`,
    fontSize: 'clamp(0.42rem, 1.2vw, 0.56rem)',
    letterSpacing: '0.45em',
    color: 'rgba(196,150,26,0.55)',
    animation: 'pldFlicker 3.5s ease-in-out infinite',
    textTransform: 'uppercase' as const,
    userSelect: 'none',
  },

  flash: {
    position: 'absolute', inset: 0,
    background: 'radial-gradient(circle at center, rgba(248,240,192,0.7) 0%, rgba(196,150,26,0.3) 40%, transparent 70%)',
    pointerEvents: 'none',
    opacity: 0,
    animation: 'pldFlash 0.35s ease-out both',
    zIndex: 2,
  },
}


/* ══════════════════════════════════════════════════════════════
   KEYFRAMES — only for ambient effects, NOT digit sequencing
   ══════════════════════════════════════════════════════════════ */

const KEYFRAMES = `
@keyframes pldSweep {
  to { transform: rotate(360deg); }
}
@keyframes pldPulse {
  0%, 100% { opacity: 0.55; transform: scale(1); }
  50%      { opacity: 1;    transform: scale(1.008); }
}
@keyframes pldFlicker {
  0%, 100% { opacity: 0.55; }
  47%      { opacity: 0.55; }
  48%      { opacity: 0.12; }
  49%      { opacity: 0.55; }
  93%      { opacity: 0.55; }
  94%      { opacity: 0.2;  }
  95%      { opacity: 0.55; }
}
@keyframes pldFlash {
  0%   { opacity: 0; }
  35%  { opacity: 0.6; }
  100% { opacity: 0; }
}
`
