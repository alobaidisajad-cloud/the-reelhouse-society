import { useEffect, useState, useMemo } from 'react'
import { useFilmStore } from '../store'

// Detect touch/mobile once — never re-evaluate
const IS_TOUCH = typeof window !== 'undefined' && window.matchMedia('(any-pointer: coarse)').matches

export default function FilmDamage() {
  // On any touch device: render NOTHING — these overlays are the #1 mobile GPU killer
  // They run continuous steps() animations at 30fps+ on fixed position composited layers
  if (IS_TOUCH) return null

  return <FilmDamageDesktop />
}

// Desktop-only damage effects — split out so the hook rules don't break
function FilmDamageDesktop() {
  const { logs } = useFilmStore()
  const [burnActive, setBurnActive] = useState(false)
  const count = logs.length

  // Trigger rare "Cigarette Burn" flashes — independent of render cycle
  useEffect(() => {
    let timerId

    const triggerBurn = () => {
      setBurnActive(true)
      const offTimer = setTimeout(() => setBurnActive(false), 450)

      // Schedule next burn between 45 and 120 seconds
      const nextDelay = Math.random() * 75000 + 45000
      timerId = setTimeout(triggerBurn, nextDelay)

      return offTimer
    }

    timerId = setTimeout(triggerBurn, 50000)
    return () => clearTimeout(timerId)
  }, [])

  // Memoize computed values — only recalculate when log count changes
  const { scratchOpacity, dustOpacity, jitterStrength } = useMemo(() => ({
    scratchOpacity: Math.min(0.04 + (count * 0.002), 0.12),
    dustOpacity: Math.min(0.025 + (count * 0.001), 0.08),
    jitterStrength: Math.min(1 + (count * 0.05), 2.5),
  }), [count])

  // Memoize the style block so it only changes when values change
  const styleBlock = useMemo(() => `
    @keyframes film-scratches {
      0%   { transform: translate(0, 0) translateZ(0); background-position: 0% 0%; }
      33%  { transform: translate(-${jitterStrength}px, ${jitterStrength * 0.8}px) translateZ(0); background-position: 30% 20%; }
      66%  { transform: translate(${jitterStrength * 0.7}px, -${jitterStrength}px) translateZ(0); background-position: -10% 70%; }
      100% { transform: translate(0, 0) translateZ(0); background-position: 0% 0%; }
    }

    @keyframes dust-float {
      0%   { opacity: ${dustOpacity}; }
      50%  { opacity: ${dustOpacity * 1.4}; }
      100% { opacity: ${dustOpacity}; }
    }

    .film-scratches {
      position: fixed;
      inset: -${Math.ceil(jitterStrength) + 4}px;
      z-index: 8000;
      pointer-events: none;
      opacity: ${scratchOpacity};
      background:
        radial-gradient(circle at 18% 32%, rgba(240,230,180,0.6) 0.5px, transparent 0.5px),
        radial-gradient(circle at 72% 58%, rgba(240,230,180,0.5) 0.5px, transparent 0.5px);
      background-size: 100% 100%;
      animation: film-scratches 0.5s steps(1) infinite;
      will-change: transform;
      contain: layout style paint;
    }

    .film-dust {
      position: fixed;
      inset: 0;
      z-index: 8001;
      pointer-events: none;
      background-image: radial-gradient(rgba(139, 105, 20, 0.4) 1px, transparent 1px);
      background-size: 8px 8px;
      opacity: ${dustOpacity};
      animation: dust-float 12s ease-in-out infinite;
      will-change: opacity;
      contain: layout style paint;
    }
  `, [scratchOpacity, dustOpacity, jitterStrength])

  return (
    <>
      <style>{styleBlock}</style>
      <div className="film-scratches" />
      <div className="film-dust" />
      <div className={`cigarette-burn-overlay${burnActive ? ' cigarette-burn-active' : ''}`} />
    </>
  )
}
