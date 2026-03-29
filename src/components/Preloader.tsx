import { useEffect, useRef } from 'react'

/*  ═══════════════════════════════════════════════════════════════
    REELHOUSE — THE PROJECTOR SEQUENCE
    "The Lamp Warms Up" — a 3-second love letter to cinema.
    ═══════════════════════════════════════════════════════════════

    ARCHITECTURE:
    ─────────────
    • ZERO Framer Motion. ZERO React state for animation.
    • Pure CSS @keyframes + staggered delays.
    • Digits: 3 → 2 → 1, each progressively warmer.
    • Iris bloom resolution: the gate opens, the film begins.
    • ONE ref-based flag tracks completion.
    • ONE setTimeout calls onComplete after total duration.
    ────────────────────────────────────────────────────────────*/

const D1    = 580       // ms — digit "3" (distant, the lamp is cold)
const D2    = 580       // ms — digit "2" (closer, warmth building)
const D3    = 620       // ms — digit "1" (present, intimate — the held breath)
const BLOOM = 400       // ms — iris opens, warm light fills the gate
const FADE  = 500       // ms — dissolve into the site
const TOTAL = D1 + D2 + D3 + BLOOM + FADE   // 2,680ms

// The countdown duration before the bloom
const CD = D1 + D2 + D3   // 1,780ms

// Each digit grows progressively warmer — the projector lamp warming up.
// text-shadow provides the ambient glow; filter:brightness in keyframes adds the bloom.
const DIGITS = [
  {
    char: '3', delay: 0, dur: D1,
    shadow: '0 0 20px rgba(196,150,26,0.22), 0 0 50px rgba(196,150,26,0.08)',
  },
  {
    char: '2', delay: D1, dur: D2,
    shadow: '0 0 28px rgba(248,240,192,0.38), 0 0 65px rgba(196,150,26,0.16), 0 0 100px rgba(196,150,26,0.06)',
  },
  {
    char: '1', delay: D1 + D2, dur: D3,
    shadow: '0 0 35px rgba(248,240,192,0.55), 0 0 75px rgba(248,240,192,0.28), 0 0 130px rgba(196,150,26,0.15)',
  },
]

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

  // 12 clock-face ticks — authentic film leader detail
  const ticks = Array.from({ length: 12 }, (_, i) => i * 30)

  // Curtain hold percentage — stays opaque through countdown + half the bloom, then fades
  const curtainHoldPct = Math.round(((CD + BLOOM * 0.4) / TOTAL) * 100)

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
      {/* ── Keyframes ── */}
      <style>{`
        /* ── Digit: bloom entry → steady hold → clean exit ──
           brightness(1.35) on entry creates a warm overexposure
           moment, like the projector light first hitting the
           film emulsion. It amplifies the text-shadow glow too,
           creating a unified "the light catches the frame" bloom. */
        @keyframes pldDigit {
          0%   { opacity: 0;  transform: scale(0.96); filter: brightness(1); }
          8%   { opacity: 1;  transform: scale(1.01); filter: brightness(1.35); }
          20%  { opacity: 1;  transform: scale(1);    filter: brightness(1); }
          82%  { opacity: 1;  transform: scale(1);    filter: brightness(1); }
          100% { opacity: 0;  transform: scale(1);    filter: brightness(1); }
        }

        /* ── Ring breathes: projector lamp pulse ──
           Box-shadow warms on the inhale — as if the lamp
           brightens slightly on each breath cycle. */
        @keyframes pldBreathe {
          0%, 100% {
            opacity: 0.42;
            box-shadow: 0 0 40px rgba(196,150,26,0.04),
                        inset 0 0 30px rgba(196,150,26,0.03);
          }
          50% {
            opacity: 0.72;
            box-shadow: 0 0 70px rgba(196,150,26,0.09),
                        inset 0 0 50px rgba(196,150,26,0.05);
          }
        }

        /* ── Animated grain: 4-frame cycle ──
           steps(4) = discrete jumps like individual film
           frames advancing through the gate. */
        @keyframes pldGrainShift {
          0%   { background-position: 0 0; }
          25%  { background-position: -37px -29px; }
          50%  { background-position: 23px -47px; }
          75%  { background-position: -19px 31px; }
          100% { background-position: 0 0; }
        }

        /* ── Iris bloom: gate opens after final digit ──
           The entire gate assembly scales up gently,
           like a camera iris opening to the first frame. */
        @keyframes pldIrisOpen {
          0%   { transform: scale(1); }
          100% { transform: scale(1.06); }
        }

        /* ── Warm bloom: amber light fills the center ──
           Replaces the old flash frame with a warm, gentle
           radial glow — the projector light hitting the
           screen for the first time. */
        @keyframes pldWarmBloom {
          0%   { opacity: 0;    transform: scale(0.92); }
          50%  { opacity: 0.30; transform: scale(1); }
          100% { opacity: 0.12; transform: scale(1.05); }
        }

        /* ── Background warmth: center warms during countdown ──
           Imperceptible but felt — the black gets warmer as
           the projector lamp heats up across 3 digits. */
        @keyframes pldWarmth {
          0%   { opacity: 0; }
          60%  { opacity: 0.22; }
          100% { opacity: 0.35; }
        }

        /* ── Status label: projector flicker ── */
        @keyframes pldFlicker {
          0%, 100% { opacity: 0.45; }
          33%      { opacity: 0.45; }
          34%      { opacity: 0.08; }
          35%      { opacity: 0.45; }
          67%      { opacity: 0.45; }
          68%      { opacity: 0.15; }
          69%      { opacity: 0.45; }
        }

        /* ── Curtain: holds during countdown, dissolves at end ── */
        @keyframes pldCurtain {
          0%, ${curtainHoldPct}%  { opacity: 1; }
          100%                    { opacity: 0; }
        }
      `}</style>

      {/* ── Deep vignette — aperture gate framing ── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 65% 65% at 50% 50%, transparent 20%, rgba(0,0,0,0.7) 65%, rgba(0,0,0,0.97) 100%)',
        zIndex: 1,
      }} />

      {/* ── Animated film grain — alive, not static ── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        opacity: 0.055, mixBlendMode: 'overlay' as const, zIndex: 2,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundSize: '150px',
        animation: 'pldGrainShift 180ms steps(4) infinite',
        willChange: 'background-position',
      }} />

      {/* ── Horizontal scan lines ── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
        opacity: 0.035,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.6) 3px, rgba(0,0,0,0.6) 4px)',
      }} />

      {/* ── Background warmth — the lamp warms the center ── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
        background: 'radial-gradient(circle at 50% 47%, rgba(40,28,12,0.5) 0%, transparent 40%)',
        opacity: 0,
        animation: `pldWarmth ${CD}ms ease-in forwards`,
      }} />

      {/* ═══════════════════════════════════════════════════════════
          THE GATE — Film leader aperture.
          After the final digit, the gate scales up (iris bloom)
          as warm light dissolves into the site.
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
        willChange: 'transform',
        animation: `pldIrisOpen ${BLOOM}ms ease-out ${CD}ms both`,
      }}>

        {/* Outermost decorative ring — faint, large, breathing */}
        <div style={{
          position: 'absolute',
          inset: '-8%',
          border: '1px solid rgba(196,150,26,0.10)',
          borderRadius: '50%',
          animation: 'pldBreathe 3s ease-in-out infinite',
        }} />

        {/* Primary aperture ring — the main circle */}
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

        {/* ── 12 clock-face tick marks ── */}
        {ticks.map((deg, i) => {
          const isMajor = i % 3 === 0
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
                transform: `rotate(${deg}deg) translateX(min(141px, 32.5vw))`,
              }}
            />
          )
        })}

        {/* ── DIGITS: 3 → 2 → 1 — progressively warmer ── */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'grid',
          placeItems: 'center',
          pointerEvents: 'none',
        }}>
          {DIGITS.map((d) => (
            <span
              key={d.char}
              style={{
                gridRow: 1, gridColumn: 1,
                fontFamily: "'Rye', Georgia, serif",
                fontSize: 'clamp(5rem, 18vw, 9rem)',
                fontWeight: 400,
                color: '#EDE5D8',
                lineHeight: 1,
                opacity: 0,
                willChange: 'opacity, transform',
                textShadow: d.shadow,
                animation: `pldDigit ${d.dur}ms cubic-bezier(0.16, 1, 0.3, 1) ${d.delay}ms both`,
              }}
            >
              {d.char}
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
          WARM BLOOM — replaces the old flash frame.
          A gentle amber radial glow, centered on the gate.
          The projector light hits the screen for the first time.
          ======================================================= */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10,
        background: 'radial-gradient(ellipse 42% 42% at 50% 47%, rgba(248,240,192,0.38) 0%, rgba(196,150,26,0.15) 50%, transparent 78%)',
        opacity: 0,
        animation: `pldWarmBloom ${BLOOM}ms ease-out ${CD}ms both`,
      }} />
    </div>
  )
}
