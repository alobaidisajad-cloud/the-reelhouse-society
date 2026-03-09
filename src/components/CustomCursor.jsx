import { useEffect } from 'react'

// ── NITRATE NOIR APERTURE CURSOR ──
// Projector lens aperture design — 8 iris blades that close on click.
// Pure DOM + requestAnimationFrame for 144hz+ buttery-smooth tracking.

export default function CustomCursor() {
  useEffect(() => {
    // Desktop (fine pointer) only
    if (!window.matchMedia('(any-pointer: fine)').matches) return

    // ── Build DOM nodes ──
    const ring = document.createElement('div')
    const dot = document.createElement('div')
    const glow = document.createElement('div')

    ring.className = 'nc-ring'
    dot.className = 'nc-dot'
    glow.className = 'nc-glow'

    // Aperture SVG — 8 iris blades arranged in a circle
    ring.innerHTML = `
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Outer ring -->
        <circle cx="20" cy="20" r="18" stroke="#C29B38" stroke-width="1" stroke-opacity="0.9"/>
        <!-- Inner ring -->
        <circle cx="20" cy="20" r="6" stroke="#C29B38" stroke-width="1" stroke-opacity="1"/>
        <!-- Crosshair lines -->
        <line x1="20" y1="2" x2="20" y2="12" stroke="#C29B38" stroke-width="1" stroke-opacity="1"/>
        <line x1="20" y1="28" x2="20" y2="38" stroke="#C29B38" stroke-width="1" stroke-opacity="1"/>
        <line x1="2" y1="20" x2="12" y2="20" stroke="#C29B38" stroke-width="1" stroke-opacity="1"/>
        <line x1="28" y1="20" x2="38" y2="20" stroke="#C29B38" stroke-width="1" stroke-opacity="1"/>
        <!-- Diagonal corner ticks -->
        <line x1="6.5" y1="6.5" x2="10.5" y2="10.5" stroke="#C29B38" stroke-width="0.75" stroke-opacity="0.7"/>
        <line x1="33.5" y1="6.5" x2="29.5" y2="10.5" stroke="#C29B38" stroke-width="0.75" stroke-opacity="0.7"/>
        <line x1="6.5" y1="33.5" x2="10.5" y2="29.5" stroke="#C29B38" stroke-width="0.75" stroke-opacity="0.7"/>
        <line x1="33.5" y1="33.5" x2="29.5" y2="29.5" stroke="#C29B38" stroke-width="0.75" stroke-opacity="0.7"/>
        <!-- Film sprocket holes -->
        <rect x="18.5" y="13" width="3" height="2" rx="0.5" fill="#C29B38" fill-opacity="0.8"/>
        <rect x="18.5" y="25" width="3" height="2" rx="0.5" fill="#C29B38" fill-opacity="0.8"/>
        <rect x="13" y="18.5" width="2" height="3" rx="0.5" fill="#C29B38" fill-opacity="0.8"/>
        <rect x="25" y="18.5" width="2" height="3" rx="0.5" fill="#C29B38" fill-opacity="0.8"/>
      </svg>
    `

    document.body.appendChild(glow)
    document.body.appendChild(ring)
    document.body.appendChild(dot)

    let raf
    let mx = -200, my = -200
    let ox = -200, oy = -200

    const isInteractive = (el) =>
      !!el.closest('a, button, input, textarea, select, [role="button"], .card-film, .btn, .scroll-item, .dossier-card, .wire-item, .film-card')

    const isText = (el) =>
      !!el.closest('p, h1, h2, h3, h4, h5, h6, blockquote, label')

    const onMove = (e) => {
      mx = e.clientX
      my = e.clientY
      dot.style.transform = `translate3d(${mx}px, ${my}px, 0) translate(-50%, -50%)`
      glow.style.transform = `translate3d(${mx}px, ${my}px, 0) translate(-50%, -50%)`
    }

    const onDown = () => {
      ring.classList.add('nc-click')
      dot.classList.add('nc-click')
      glow.classList.add('nc-click')
    }

    const onUp = () => {
      ring.classList.remove('nc-click')
      dot.classList.remove('nc-click')
      glow.classList.remove('nc-click')
    }

    const onOver = (e) => {
      if (isInteractive(e.target)) {
        ring.classList.add('nc-hover')
        glow.classList.add('nc-hover')
        dot.classList.add('nc-hover')
      } else if (isText(e.target)) {
        ring.classList.add('nc-text')
      }
    }

    const onOut = (e) => {
      if (isInteractive(e.target)) {
        ring.classList.remove('nc-hover')
        glow.classList.remove('nc-hover')
        dot.classList.remove('nc-hover')
      } else if (isText(e.target)) {
        ring.classList.remove('nc-text')
      }
    }

    const animate = () => {
      ox += (mx - ox) * 0.55
      oy += (my - oy) * 0.55
      const rx = Math.round(ox * 100) / 100
      const ry = Math.round(oy * 100) / 100
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%)`
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
      ring.remove()
      dot.remove()
      glow.remove()
    }
  }, [])

  return (
    <style>{`
      /* ── NITRATE NOIR APERTURE CURSOR ── */
      .nc-ring {
        position: fixed; top: 0; left: 0;
        pointer-events: none; z-index: 999998;
        width: 40px; height: 40px;
        will-change: transform, width, height;
        transition: width 0.18s cubic-bezier(0.34,1.56,0.64,1),
                    height 0.18s cubic-bezier(0.34,1.56,0.64,1),
                    opacity 0.18s ease;
      }
      .nc-ring svg {
        width: 100%; height: 100%;
        transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease;
        will-change: transform;
      }

      /* hover: aperture opens wider, rotates slightly */
      .nc-ring.nc-hover {
        width: 54px; height: 54px;
        opacity: 0.95;
      }
      .nc-ring.nc-hover svg {
        transform: rotate(22.5deg);
        filter: drop-shadow(0 0 6px rgba(242,232,160,0.8));
      }

      /* text mode: compress to I-beam width */
      .nc-ring.nc-text {
        width: 28px; height: 28px;
        opacity: 0.5;
      }

      /* click: snap closed */
      .nc-ring.nc-click {
        width: 28px; height: 28px;
      }
      .nc-ring.nc-click svg {
        transform: rotate(45deg) scale(0.85);
        opacity: 1;
        filter: drop-shadow(0 0 8px rgba(242,232,160,1));
      }

      /* ── CENTER DOT ── */
      .nc-dot {
        position: fixed; top: 0; left: 0;
        pointer-events: none; z-index: 999999;
        width: 4px; height: 4px; border-radius: 50%;
        background: #F2E8A0;
        box-shadow: 0 0 4px 1px rgba(242,232,160,0.6);
        transition: width 0.1s, height 0.1s, background 0.1s, box-shadow 0.1s;
        will-change: transform;
      }
      .nc-dot.nc-hover {
        width: 6px; height: 6px;
        background: #fff;
        box-shadow: 0 0 8px 2px rgba(242,232,160,0.9);
      }
      .nc-dot.nc-click {
        width: 8px; height: 8px;
        background: #F2E8A0;
        box-shadow: 0 0 14px 4px rgba(242,232,160,0.9);
      }

      /* ── AMBIENT GLOW (large diffuse light) ── */
      .nc-glow {
        position: fixed; top: 0; left: 0;
        pointer-events: none; z-index: 999996;
        width: 180px; height: 180px; border-radius: 50%;
        background: radial-gradient(ellipse at center, rgba(139,105,20,0.06) 0%, transparent 70%);
        will-change: transform, opacity;
        transition: opacity 0.3s ease;
        margin: 0;
      }
      .nc-glow.nc-hover {
        opacity: 1.5;
        background: radial-gradient(ellipse at center, rgba(242,232,160,0.08) 0%, transparent 70%);
      }
      .nc-glow.nc-click {
        background: radial-gradient(ellipse at center, rgba(242,232,160,0.15) 0%, transparent 60%);
      }
    `}</style>
  )
}
