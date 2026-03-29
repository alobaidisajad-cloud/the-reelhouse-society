import { useEffect, useRef } from 'react'

/*  ═══════════════════════════════════════════════════════════════
    REELHOUSE — THE PROJECTOR SEQUENCE
    Authentic cinematic film-leader countdown. Nitrate Noir.
    ═══════════════════════════════════════════════════════════════

    ARCHITECTURE:
    ─────────────
    • ZERO Framer Motion. ZERO React state for animation.
    • Pure CSS @keyframes + staggered delays.
    • Digits: 3 → 2 → 1 → blank flash frame (not a dot)
    • ONE ref-based flag tracks completion.
    • ONE setTimeout calls onComplete after total duration.
    ────────────────────────────────────────────────────────────*/

const D     = 580          // ms per digit — crisp, cinematic, not sluggish
const FLASH = 380          // ms for the final blank flash frame
const FADE  = 600          // ms for the curtain fade to black
const TOTAL = D * 3 + FLASH + FADE

export default function Preloader({ onComplete }: { onComplete: () => void }) {
  const called = useRef(false)

  useEffect(() => {
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

  if (called.current) return null

  // ------------------------------------------------------------
  // Ring tick positions: 12 ticks around the aperture like a
  // clock face — authentic film leader detail.
  // ------------------------------------------------------------
  const ticks = Array.from({ length: 12 }, (_, i) => i * 30)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        background: '#080604',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        touchAction: 'none',
        userSelect: 'none',
        animation: `pldCurtain ${TOTAL}ms linear forwards`,
      }}
    >
      {/* ── Inline keyframes ── */}
      <style>{`
        @font-face {
          /* Ensure Rye is available — loaded via index.html but guard here */
        }

        /* Each digit burns in (scale up from slightly small, sharp fade in)
           then holds still, then fades out upward like burning celluloid.    */
        @keyframes pldDigit {
          0%   { opacity: 0;    transform: scale(0.82) translateY(6px); filter: blur(6px); }
          10%  { opacity: 1;    transform: scale(1.06) translateY(0);   filter: blur(0); }
          18%  { opacity: 1;    transform: scale(1)    translateY(0);   filter: blur(0); }
          78%  { opacity: 1;    transform: scale(1)    translateY(0);   filter: blur(0); }
          100% { opacity: 0;    transform: scale(1.08) translateY(-5px); filter: blur(2px); }
        }

        /* The "frame number" oscillates very subtly — like an old projector
           frame counter, not a sweep arm.                                    */
        @keyframes pldFrameTick {
          0%   { opacity: 0.18; }
          50%  { opacity: 0.50; }
          100% { opacity: 0.18; }
        }

        /* Outer ring breathes — slow, weighted, like a held breath */
        @keyframes pldBreathe {
          0%, 100% { opacity: 0.38; transform: scale(1); }
          50%      { opacity: 0.70; transform: scale(1.005); }
        }

        /* The blank flash frame at the end — SMPTE white flash before cut */
        @keyframes pldFlashFrame {
          0%   { opacity: 0; }
          20%  { opacity: 0.38; }
          55%  { opacity: 0.32; }
          100% { opacity: 0; }
        }

        /* Film-burn scratch lines flash near the end */
        @keyframes pldScratch {
          0%,100% { opacity: 0; }
          20%     { opacity: 0.8; }
          40%     { opacity: 0; }
          60%     { opacity: 0.5; }
          80%     { opacity: 0; }
        }

        /* Status label — slow film-projector flicker */
        @keyframes pldFlicker {
          0%, 100% { opacity: 0.45; }
          33%      { opacity: 0.45; }
          34%      { opacity: 0.08; }
          35%      { opacity: 0.45; }
          67%      { opacity: 0.45; }
          68%      { opacity: 0.15; }
          69%      { opacity: 0.45; }
        }

        /* Curtain: stays opaque, then fades at the very end */
        @keyframes pldCurtain {
          0%, ${Math.round(((D * 3 + FLASH) / TOTAL) * 100)}%  { opacity: 1; }
          100%                                                   { opacity: 0; }
        }
      `}</style>

      {/* ── Deep vignette — heavy, like shooting through an aperture gate ── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 65% 65% at 50% 50%, transparent 20%, rgba(0,0,0,0.7) 65%, rgba(0,0,0,0.97) 100%)',
        zIndex: 1,
      }} />

      {/* ── Film grain ── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        opacity: 0.055, mixBlendMode: 'overlay', zIndex: 2,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundSize: '150px',
      }} />

      {/* ── Horizontal scan lines ── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
        opacity: 0.035,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.6) 3px, rgba(0,0,0,0.6) 4px)',
      }} />

      {/* ═══════════════════════════════════════════════════════════
          THE GATE — Film leader aperture. No radar. No sweep arm.
          ======================================================= */}
      <div style={{
        width: 'min(300px, 68vw)',
        height: 'min(300px, 68vw)',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        zIndex: 3,
      }}>

        {/* Outermost decorative ring — very faint, large */}
        <div style={{
          position: 'absolute',
          inset: '-8%',
          border: '1px solid rgba(196,150,26,0.10)',
          borderRadius: '50%',
          animation: 'pldBreathe 3s ease-in-out infinite',
        }} />

        {/* Primary aperture ring */}
        <div style={{
          position: 'absolute', inset: 0,
          border: '1.5px solid rgba(196,150,26,0.42)',
          borderRadius: '50%',
          boxShadow: [
            '0 0 50px rgba(196,150,26,0.05)',
            '0 0 100px rgba(196,150,26,0.03)',
            'inset 0 0 50px rgba(196,150,26,0.04)',
          ].join(', '),
          animation: 'pldBreathe 3s ease-in-out infinite',
        }} />

        {/* Inner reference ring */}
        <div style={{
          position: 'absolute', inset: '14%',
          border: '0.75px solid rgba(196,150,26,0.15)',
          borderRadius: '50%',
          pointerEvents: 'none',
        }} />

        {/* Innermost small ring — the "gate" aperture itself */}
        <div style={{
          position: 'absolute', inset: '32%',
          border: '0.75px solid rgba(196,150,26,0.10)',
          borderRadius: '50%',
          pointerEvents: 'none',
        }} />

        {/* ── 12 clock-face tick marks around the primary ring ── */}
        {ticks.map((deg, i) => {
          const isMajor = i % 3 === 0  // 4 major ticks at 0°, 90°, 180°, 270°
          return (
            <div
              key={deg}
              style={{
                position: 'absolute',
                width: isMajor ? '12px' : '6px',
                height: isMajor ? '1.5px' : '1px',
                background: isMajor
                  ? 'rgba(196,150,26,0.38)'
                  : 'rgba(196,150,26,0.18)',
                top: '50%',
                left: '50%',
                transformOrigin: 'left center',
                // Push tick to the edge of the ring
                transform: `rotate(${deg}deg) translateX(min(141px, 32.5vw))`,
              }}
            />
          )
        })}

        {/* ── Frame counter arc labels (static, aesthetic detail) ── */}
        {(['III', 'VI', 'IX', 'XII'] as const).map((label, i) => {
          const angles = [0, 90, 180, 270]
          const deg = angles[i]
          const rad = (deg - 90) * (Math.PI / 180)
          const r = 42   // % from center
          const x = 50 + r * Math.cos(rad)
          const y = 50 + r * Math.sin(rad)
          return (
            <div
              key={label}
              style={{
                position: 'absolute',
                top: `${y}%`,
                left: `${x}%`,
                transform: 'translate(-50%, -50%)',
                fontFamily: "'Rye', Georgia, serif",
                fontSize: 'clamp(0.38rem, 1.0vw, 0.48rem)',
                color: 'rgba(196,150,26,0.22)',
                letterSpacing: '0.05em',
                animation: 'pldFlicker 4s ease-in-out infinite',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </div>
          )
        })}

        {/* ── DIGITS: 3 → 2 → 1 — CSS Grid overlap guarantees center ── */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'grid',
          placeItems: 'center',
          pointerEvents: 'none',
        }}>
          {(['3', '2', '1'] as const).map((d, i) => (
            <span
              key={d}
              style={{
                gridRow: 1, gridColumn: 1,
                fontFamily: "'Rye', Georgia, serif",
                fontSize: 'clamp(5rem, 18vw, 9rem)',
                fontWeight: 400,
                color: '#EDE5D8',
                lineHeight: 1,
                opacity: 0,
                willChange: 'opacity, transform, filter',
                // Primary glow + warm amber bloom
                filter: [
                  'drop-shadow(0 0 30px rgba(248,240,192,0.55))',
                  'drop-shadow(0 0 70px rgba(196,150,26,0.30))',
                  'drop-shadow(0 0 120px rgba(196,150,26,0.12))',
                ].join(' '),
                animation: `pldDigit ${D}ms cubic-bezier(0.16, 1, 0.3, 1) ${i * D}ms both`,
              }}
            >
              {d}
            </span>
          ))}
        </div>
      </div>

      {/* ── Status label ── */}
      <div style={{
        marginTop: 'clamp(1.8rem, 5vw, 2.6rem)',
        fontFamily: "'Bungee', monospace, sans-serif",
        fontSize: 'clamp(0.40rem, 1.1vw, 0.52rem)',
        letterSpacing: '0.50em',
        color: 'rgba(196,150,26,0.50)',
        animation: 'pldFlicker 3.5s ease-in-out infinite',
        zIndex: 3,
      }}>
        THREADING PROJECTOR…
      </div>

      {/* ═══════════════════════════════════════════════════════════
          BLANK FLASH FRAME — replaces the ● dot.
          Classic SMPTE: after the last digit, a pure white/warm
          flash frame burns in momentarily, then the curtain falls.
          ======================================================= */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10,
        // Warm amber burn — soft, not blinding. Nitrate Noir palette.
        background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(240,210,120,0.55) 0%, rgba(196,150,26,0.30) 45%, transparent 80%)',
        opacity: 0,
        animation: `pldFlashFrame ${FLASH}ms cubic-bezier(0.4, 0, 0.6, 1) ${D * 3}ms both`,
      }} />

      {/* ── Film scratch lines — appear with the flash for texture ── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 11,
        opacity: 0,
        animation: `pldScratch ${FLASH}ms ease-out ${D * 3}ms both`,
      }}>
        {/* Vertical scratch 1 */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: '48.5%', width: '0.75px',
          background: 'linear-gradient(180deg, transparent 5%, rgba(255,248,220,0.6) 20%, rgba(255,248,220,0.8) 50%, rgba(255,248,220,0.5) 80%, transparent 95%)',
        }} />
        {/* Vertical scratch 2 */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: '53%', width: '0.5px',
          background: 'linear-gradient(180deg, transparent 15%, rgba(255,248,220,0.3) 30%, rgba(255,248,220,0.5) 55%, transparent 90%)',
        }} />
      </div>
    </div>
  )
}
