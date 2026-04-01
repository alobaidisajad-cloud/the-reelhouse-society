import { useEffect, useState } from 'react'

// ── NITRATE NOIR APERTURE CURSOR ──
// Uses the proven vanilla-DOM + rAF approach — no React state, no lag.
// IMPORTANT: This is DESKTOP-ONLY. Touch devices (phones, tablets) must never
// see this cursor or have their native cursor hidden.

/** Bulletproof desktop-only detection.
 *  Many Android devices (Samsung S-Pen, etc.) report BOTH fine AND coarse pointers.
 *  We require: fine pointer + NO coarse pointer + NO touch support + wide viewport.
 */
function isDesktopPointerDevice(): boolean {
  if (typeof window === 'undefined') return false
  const hasFinePointer = window.matchMedia('(pointer: fine)').matches
  const hasCoarsePointer = window.matchMedia('(any-pointer: coarse)').matches
  const hasTouchPoints = navigator.maxTouchPoints > 0
  const isWideEnough = window.innerWidth >= 1024
  // Must have a fine PRIMARY pointer, NO coarse pointer at all, no touch, and desktop width
  return hasFinePointer && !hasCoarsePointer && !hasTouchPoints && isWideEnough
}

export default function CustomCursor() {
  // Evaluate once on mount — if not a desktop pointer device, render NOTHING
  const [isDesktop] = useState(() => isDesktopPointerDevice())

  useEffect(() => {
    if (!isDesktop) return

    const outer = document.createElement('div')
    const dot = document.createElement('div')

    outer.className = 'cursor-outer'
    dot.className = 'cursor-dot'

    // Aperture SVG — ring + crosshairs + sprocket holes
    outer.innerHTML =
      '<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      // outer ring
      '<circle cx="20" cy="20" r="18" stroke="#C29B38" stroke-width="1.2" stroke-opacity="0.9"/>' +
      // inner centre ring
      '<circle cx="20" cy="20" r="5.5" stroke="#C29B38" stroke-width="1" stroke-opacity="1"/>' +
      // crosshair N
      '<line x1="20" y1="2" x2="20" y2="13" stroke="#C29B38" stroke-width="1.2" stroke-opacity="1"/>' +
      // crosshair S
      '<line x1="20" y1="27" x2="20" y2="38" stroke="#C29B38" stroke-width="1.2" stroke-opacity="1"/>' +
      // crosshair W
      '<line x1="2" y1="20" x2="13" y2="20" stroke="#C29B38" stroke-width="1.2" stroke-opacity="1"/>' +
      // crosshair E
      '<line x1="27" y1="20" x2="38" y2="20" stroke="#C29B38" stroke-width="1.2" stroke-opacity="1"/>' +
      // diagonal corner ticks
      '<line x1="6" y1="6" x2="10" y2="10" stroke="#C29B38" stroke-width="0.8" stroke-opacity="0.6"/>' +
      '<line x1="34" y1="6" x2="30" y2="10" stroke="#C29B38" stroke-width="0.8" stroke-opacity="0.6"/>' +
      '<line x1="6" y1="34" x2="10" y2="30" stroke="#C29B38" stroke-width="0.8" stroke-opacity="0.6"/>' +
      '<line x1="34" y1="34" x2="30" y2="30" stroke="#C29B38" stroke-width="0.8" stroke-opacity="0.6"/>' +
      // film sprocket holes (4 small rects on the inner ring)
      '<rect x="18.5" y="13.5" width="3" height="2" rx="0.4" fill="#C29B38" fill-opacity="0.85"/>' +
      '<rect x="18.5" y="24.5" width="3" height="2" rx="0.4" fill="#C29B38" fill-opacity="0.85"/>' +
      '<rect x="13.5" y="18.5" width="2" height="3" rx="0.4" fill="#C29B38" fill-opacity="0.85"/>' +
      '<rect x="24.5" y="18.5" width="2" height="3" rx="0.4" fill="#C29B38" fill-opacity="0.85"/>' +
      '</svg>'

    // Start off-screen before appending — prevents 1-frame flash at (0,0)
    outer.style.transform = 'translate3d(-200px,-200px,0) translate(-50%,-50%)'
    dot.style.transform = 'translate3d(-200px,-200px,0) translate(-50%,-50%)'
    document.body.appendChild(outer)
    document.body.appendChild(dot)

    // Only hide cursor AFTER custom cursor elements exist in the DOM
    const cursorStyle = document.createElement('style')
    cursorStyle.id = 'custom-cursor-hide'
    cursorStyle.textContent = '* { cursor: none !important; }'
    document.head.appendChild(cursorStyle)

    let raf: number
    let mx = -200, my = -200
    let ox = -200, oy = -200

    const isInteractive = (el: Element) =>
      !!el.closest('a, button, input, textarea, select, [role="button"], .card-film, .btn, .dossier-card, .wire-item')

    const onMove = (e: MouseEvent) => {
      mx = e.clientX
      my = e.clientY
      dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0) translate(-50%,-50%)'
    }

    const onDown = () => { outer.classList.add('cursor-click'); dot.classList.add('cursor-click') }
    const onUp = () => { outer.classList.remove('cursor-click'); dot.classList.remove('cursor-click') }

    const onOver = (e: MouseEvent) => { if (isInteractive(e.target as Element)) outer.classList.add('cursor-hover') }
    const onOut = (e: MouseEvent) => { if (isInteractive(e.target as Element)) outer.classList.remove('cursor-hover') }

    // Hide custom cursor + restore real cursor when mouse leaves / window loses focus
    const onLeave = () => {
      outer.style.opacity = '0'
      dot.style.opacity = '0'
      document.documentElement.style.setProperty('cursor', 'auto', 'important')
    }
    const onEnter = () => {
      outer.style.opacity = ''
      dot.style.opacity = ''
      document.documentElement.style.removeProperty('cursor')
    }

    const animate = () => {
      ox += (mx - ox) * 0.92
      oy += (my - oy) * 0.92
      const rx = Math.round(ox * 100) / 100
      const ry = Math.round(oy * 100) / 100
      outer.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0) translate(-50%,-50%)'
      raf = requestAnimationFrame(animate)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('mousedown', onDown, { passive: true })
    window.addEventListener('mouseup', onUp, { passive: true })
    document.body.addEventListener('mouseover', onOver, { passive: true })
    document.body.addEventListener('mouseout', onOut, { passive: true })
    document.addEventListener('mouseleave', onLeave, { passive: true })
    document.addEventListener('mouseenter', onEnter, { passive: true })
    // Cover alt-tab / window switch — mouseleave doesn't fire in these cases
    window.addEventListener('blur', onLeave, { passive: true })
    window.addEventListener('focus', onEnter, { passive: true })
    const onVisibilityChange = () => { document.hidden ? onLeave() : onEnter() }
    document.addEventListener('visibilitychange', onVisibilityChange, { passive: true })

    animate()

    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
      document.body.removeEventListener('mouseover', onOver)
      document.body.removeEventListener('mouseout', onOut)
      document.removeEventListener('mouseleave', onLeave)
      document.removeEventListener('mouseenter', onEnter)
      window.removeEventListener('blur', onLeave)
      window.removeEventListener('focus', onEnter)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      cancelAnimationFrame(raf)
      outer.remove()
      dot.remove()
      cursorStyle.remove()
    }
  }, [isDesktop])

  // On touch/mobile devices, render NOTHING — no styles, no DOM, no interference
  if (!isDesktop) return null

  return (
    <style>{`
      .cursor-outer {
        position: fixed; top: 0; left: 0;
        pointer-events: none; z-index: var(--z-cursor);
        width: 40px; height: 40px;
        will-change: transform;
        transition: width 0.15s ease, height 0.15s ease, opacity 0.15s ease;
      }
      .cursor-outer svg {
        width: 100%; height: 100%;
        transition: transform 0.15s ease;
        will-change: transform;
      }

      /* HOVER — aperture opens + rotates 22.5deg */
      .cursor-outer.cursor-hover { width: 54px; height: 54px; opacity: 0.9; }
      .cursor-outer.cursor-hover svg {
        transform: rotate(22.5deg);
        filter: drop-shadow(0 0 6px rgba(242,232,160,0.9));
      }

      /* CLICK — snap closed */
      .cursor-outer.cursor-click { width: 30px; height: 30px; }
      .cursor-outer.cursor-click svg {
        transform: rotate(45deg) scale(0.85);
        filter: drop-shadow(0 0 10px rgba(242,232,160,1));
      }

      /* DOT */
      .cursor-dot {
        position: fixed; top: 0; left: 0;
        pointer-events: none; z-index: calc(var(--z-cursor) + 1);
        width: 4px; height: 4px; border-radius: 50%;
        background: #F2E8A0;
        box-shadow: 0 0 5px 1px rgba(242,232,160,0.7);
        will-change: transform;
        transition: width 0.1s, height 0.1s, background 0.1s;
      }
      .cursor-dot.cursor-click {
        width: 7px; height: 7px;
        background: #fff;
        box-shadow: 0 0 12px 3px rgba(242,232,160,1);
      }
    `}</style>
  )
}
