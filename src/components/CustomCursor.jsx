import { useEffect } from 'react'

// ── ENTERPRISE FIX: Vanilla JS Custom Cursor ──
// This completely bypasses React's render cycle. 
// Attaching 1000hz mouse events to React state causes incredible micro-lag.
// Pure DOM manipulation with requestAnimationFrame ensures 144hz+ buttery smooth tracking.

export default function CustomCursor() {
  useEffect(() => {
    // Only initialize on desktop
    if (!window.matchMedia('(any-pointer: fine)').matches) return

    // Create cursor nodes
    const outer = document.createElement('div')
    const dot = document.createElement('div')

    outer.className = 'cursor-outer'
    dot.className = 'cursor-dot'

    // The Viewfinder Reticle SVG
    outer.innerHTML = `
      <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 9 L2 2 L9 2" stroke="#8B6914" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M19 2 L26 2 L26 9" stroke="#8B6914" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M2 19 L2 26 L9 26" stroke="#8B6914" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M19 26 L26 26 L26 19" stroke="#8B6914" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    `

    document.body.appendChild(outer)
    document.body.appendChild(dot)

    let raf
    let mx = -200, my = -200
    let ox = -200, oy = -200

    // Highly specific interactive selector 
    const isInteractive = (el) => !!el.closest('a, button, input, textarea, select, [role="button"], .card-film, .btn, .scroll-item, .dossier-card, .wire-item')

    const onMove = (e) => {
      mx = e.clientX
      my = e.clientY
      // Center dot snaps instantly
      dot.style.transform = `translate3d(${mx}px, ${my}px, 0) translate(-50%, -50%)`
    }

    const onDown = () => {
      outer.classList.add('cursor-click')
      dot.classList.add('cursor-click')
    }

    const onUp = () => {
      outer.classList.remove('cursor-click')
      dot.classList.remove('cursor-click')
    }

    // Event delegation for interactives
    const onOver = (e) => { if (isInteractive(e.target)) outer.classList.add('cursor-hover') }
    const onOut = (e) => { if (isInteractive(e.target)) outer.classList.remove('cursor-hover') }

    const animate = () => {
      // Lerp outer box (fast tracking 0.6)
      ox += (mx - ox) * 0.6
      oy += (my - oy) * 0.6

      // Elite Performance: Rounding to 2 decimals prevents GPU floating-point recalculation jitter
      const roundedX = Math.round(ox * 100) / 100
      const roundedY = Math.round(oy * 100) / 100

      outer.style.transform = `translate3d(${roundedX}px, ${roundedY}px, 0) translate(-50%, -50%)`
      raf = requestAnimationFrame(animate)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('mousedown', onDown, { passive: true })
    window.addEventListener('mouseup', onUp, { passive: true })
    document.body.addEventListener('mouseover', onOver, { passive: true })
    document.body.addEventListener('mouseout', onOut, { passive: true })

    animate()

    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
      document.body.removeEventListener('mouseover', onOver)
      document.body.removeEventListener('mouseout', onOut)
      cancelAnimationFrame(raf)
      outer.remove()
      dot.remove()
    }
  }, [])

  return (
    <style>{`
      /* ── ENTERPRISE OPTIMIZED VIEWFINDER ── */
      .cursor-outer {
        position: fixed; top: 0; left: 0;
        pointer-events: none; z-index: 999998;
        width: 28px; height: 28px;
        transition: width 0.15s ease, height 0.15s ease, opacity 0.15s ease;
        will-change: transform, width, height;
      }
      .cursor-outer svg { width: 100%; height: 100%; transition: opacity 0.15s ease, transform 0.15s ease; will-change: transform; }
      .cursor-outer.cursor-hover { width: 36px; height: 36px; opacity: 0.7; }
      .cursor-outer.cursor-click { width: 22px; height: 22px; }
      .cursor-outer.cursor-click svg { transform: rotate(45deg); opacity: 0.9; }

      .cursor-dot {
        position: fixed; top: 0; left: 0;
        pointer-events: none; z-index: 999999;
        width: 3px; height: 3px; border-radius: 50%;
        background: #8B6914;
        transition: width 0.1s, height 0.1s, background 0.1s;
        will-change: transform, width, height;
      }
      .cursor-dot.cursor-click { width: 5px; height: 5px; background: #F2E8A0; }
    `}</style>
  )
}
