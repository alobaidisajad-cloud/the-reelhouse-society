/**
 * AchievementToast — Gold sepia celebration toast when a badge is unlocked.
 * Auto-dismisses after 5 seconds with a slide-in animation.
 */
import { useEffect, useState } from 'react'
import type { Badge } from '../hooks/useAchievements'

interface Props {
  badge: Badge
  onDismiss: () => void
}

export default function AchievementToast({ badge, onDismiss }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onDismiss, 400)
    }, 5000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div
      style={{
        position: 'fixed',
        top: visible ? '1.5rem' : '-6rem',
        right: '1.5rem',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '1rem 1.5rem',
        background: 'linear-gradient(135deg, rgba(18,14,9,0.95), rgba(30,24,15,0.95))',
        border: '1px solid rgba(139,105,20,0.4)',
        borderRadius: 'var(--radius-card)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 60px rgba(139,105,20,0.15)',
        transition: 'top 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        maxWidth: '360px',
        cursor: 'pointer',
      }}
      onClick={() => { setVisible(false); setTimeout(onDismiss, 400) }}
      role="alert"
      aria-live="polite"
    >
      {/* Badge glyph */}
      <div style={{
        width: 48, height: 48,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.6rem',
        color: 'var(--flicker)',
        background: 'radial-gradient(circle, rgba(139,105,20,0.2), transparent)',
        borderRadius: '50%',
        border: '1px solid rgba(139,105,20,0.3)',
        flexShrink: 0,
        animation: 'achievementShimmer 2s ease infinite',
      }}>
        {badge.glyph}
      </div>

      {/* Text */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-ui)',
          fontSize: '0.5rem',
          letterSpacing: '0.2em',
          color: 'var(--sepia)',
        }}>
          BADGE UNLOCKED
        </div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1rem',
          color: 'var(--parchment)',
          letterSpacing: '0.1em',
          lineHeight: 1.2,
        }}>
          {badge.label}
        </div>
        <div style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.75rem',
          color: 'var(--fog)',
          lineHeight: 1.4,
        }}>
          {badge.description}
        </div>
      </div>

      {/* Gold accent line */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: '10%',
        right: '10%',
        height: '2px',
        background: 'linear-gradient(to right, transparent, var(--sepia), transparent)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.6s',
      }} />
    </div>
  )
}
