import { useEffect, useRef } from 'react'

/*  ═══════════════════════════════════════════════════════════════
    REELHOUSE — THE PROJECTOR SEQUENCE
    A cinematic 3-2-1 film-leader countdown.
    ═══════════════════════════════════════════════════════════════

    ARCHITECTURE — nothing can break this:
    ──────────────────────────────────────
    • ZERO Framer Motion. No AnimatePresence. No motion.div.
    • ZERO React state for digits. Pure CSS @keyframes + delays.
    • All 4 digits + curtain fade are CSS animations.
    • ONE ref-based flag tracks completion.
    • ONE setTimeout calls onComplete after total duration.
    • Component returns null after completion.
    ────────────────────────────────────────────────────────────*/

const D = 920   // ms per digit
const TOTAL = D * 4 + 700  // all digits + curtain fade-out

export default function Preloader({ onComplete }: { onComplete: () => void }) {
  const called = useRef(false)

  useEffect(() => {
    // Lock scroll
    document.body.style.overflow = 'hidden'

    const timer = setTimeout(() => {
      if (!called.current) {
        called.current = true
        document.body.style.overflow = ''
        onComplete()
      }
    }, TOTAL)

    return () => {
      clearTimeout(timer)
      document.body.style.overflow = ''
    }
  }, [onComplete])

  // Once called, render nothing
  if (called.current) return null

  return (
    <div
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
        touchAction: 'none',
        userSelect: 'none',
        animation: `pldCurtain ${TOTAL}ms ease-in forwards`,
      }}
    >
      {/* ── Inline keyframes — in DOM before any animated element ── */}
      <style>{`
        @keyframes pldDigit {
          0%   { opacity: 0; transform: scale(0.5); }
          12%  { opacity: 1; transform: scale(1.04); }
          20%  { opacity: 1; transform: scale(1); }
          75%  { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.12); }
        }
        @keyframes pldSweep {
          to { transform: rotate(360deg); }
        }
        @keyframes pldPulse {
          0%, 100% { opacity: 0.5;  transform: scale(1); }
          50%      { opacity: 0.95; transform: scale(1.008); }
        }
        @keyframes pldFlicker {
          0%, 100% { opacity: 0.55; }
          47% { opacity: 0.55; }
          48% { opacity: 0.12; }
          49% { opacity: 0.55; }
          93% { opacity: 0.55; }
          94% { opacity: 0.18; }
          95% { opacity: 0.55; }
        }
        @keyframes pldFlash {
          0%   { opacity: 0; }
          40%  { opacity: 0.6; }
          100% { opacity: 0; }
        }
        @keyframes pldCurtain {
          0%, 85% { opacity: 1; }
          100%    { opacity: 0; }
        }
      `}</style>

      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 80% 75% at center, transparent 25%, rgba(0,0,0,0.85) 100%)',
      }} />

      {/* Film grain */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.06,
        mixBlendMode: 'overlay',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`,
        backgroundSize: '160px',
      }} />

      {/* Scan lines */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.04,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.5) 2px, rgba(0,0,0,0.5) 4px)',
      }} />

      {/* ── The Gate (film-leader circle) ── */}
      <div style={{
        width: 'min(280px, 66vw)',
        height: 'min(280px, 66vw)',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>

        {/* Outer ring */}
        <div style={{
          position: 'absolute', inset: 0,
          border: '1.5px solid rgba(196,150,26,0.45)',
          borderRadius: '50%',
          animation: 'pldPulse 2.6s ease-in-out infinite',
          boxShadow: '0 0 60px rgba(196,150,26,0.06), 0 0 120px rgba(196,150,26,0.03), inset 0 0 40px rgba(196,150,26,0.03)',
        }} />

        {/* Inner ring */}
        <div style={{
          position: 'absolute', inset: '12%',
          border: '1px solid rgba(196,150,26,0.12)',
          borderRadius: '50%',
          pointerEvents: 'none',
        }} />

        {/* Sweep arm */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          width: '50%', height: '1px',
          background: 'linear-gradient(90deg, rgba(196,150,26,0.6), transparent 85%)',
          transformOrigin: 'left center',
          animation: 'pldSweep 2s linear infinite',
        }} />

        {/* Crosshairs */}
        <div style={{ position: 'absolute', top: '50%', left: '-8%', right: '-8%', height: '1px', background: 'rgba(196,150,26,0.08)' }} />
        <div style={{ position: 'absolute', left: '50%', top: '-8%', bottom: '-8%', width: '1px', background: 'rgba(196,150,26,0.08)' }} />

        {/* Tick marks */}
        {[0, 90, 180, 270].map(deg => (
          <div key={deg} style={{
            position: 'absolute', width: '10px', height: '1.5px',
            background: 'rgba(196,150,26,0.28)',
            top: '50%', left: '50%',
            transformOrigin: 'left center',
            transform: `rotate(${deg}deg) translateX(min(130px, 30vw))`,
          }} />
        ))}

        {/* Center dot */}
        <div style={{
          position: 'absolute', width: '4px', height: '4px',
          borderRadius: '50%', background: 'rgba(196,150,26,0.25)',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
        }} />

        {/* ══════ DIGITS — pure CSS, zero React state ══════ */}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          {(['3', '2', '1', '●'] as const).map((d, i) => (
            <span
              key={d}
              style={{
                position: 'absolute',
                fontFamily: "'Rye', Georgia, serif",
                fontSize: 'clamp(4.2rem, 16vw, 8rem)',
                color: '#EDE5D8',
                lineHeight: 1,
                opacity: 0,
                willChange: 'opacity, transform',
                filter: 'drop-shadow(0 0 40px rgba(248,240,192,0.5)) drop-shadow(0 0 80px rgba(196,150,26,0.25))',
                animation: `pldDigit ${D}ms ease-out ${i * D}ms both`,
              }}
            >
              {d}
            </span>
          ))}
        </div>
      </div>

      {/* Status label */}
      <div style={{
        marginTop: 'clamp(1.6rem, 5vw, 2.4rem)',
        fontFamily: "'Bungee', monospace, sans-serif",
        fontSize: 'clamp(0.42rem, 1.2vw, 0.56rem)',
        letterSpacing: '0.45em',
        color: 'rgba(196,150,26,0.55)',
        animation: 'pldFlicker 3.5s ease-in-out infinite',
      }}>
        THREADING PROJECTOR…
      </div>

      {/* Film-burn flash near end */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(circle at center, rgba(248,240,192,0.7) 0%, rgba(196,150,26,0.3) 40%, transparent 70%)',
        opacity: 0,
        animation: `pldFlash 0.35s ease-out ${D * 3 + 200}ms both`,
        zIndex: 2,
      }} />
    </div>
  )
}
