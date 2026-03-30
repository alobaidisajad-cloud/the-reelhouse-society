import { SHORTCUT_LIST } from '../hooks/useKeyboardShortcuts'
import { X } from 'lucide-react'

interface Props {
  onClose: () => void
}

export default function ShortcutsHelp({ onClose }: Props) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9990,
        background: 'rgba(10,7,3,0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--soot)',
          border: '1px solid var(--ash)',
          borderRadius: 'var(--radius-card)',
          padding: '2rem',
          maxWidth: 420,
          width: '90%',
          position: 'relative',
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close shortcuts"
          style={{
            position: 'absolute', top: '1rem', right: '1rem',
            background: 'none', border: '1px solid var(--ash)',
            borderRadius: '4px', padding: '0.35rem',
            color: 'var(--fog)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--sepia)'; e.currentTarget.style.color = 'var(--sepia)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--ash)'; e.currentTarget.style.color = 'var(--fog)' }}
        >
          <X size={14} />
        </button>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.2rem',
          color: 'var(--parchment)',
          letterSpacing: '0.15em',
          marginBottom: '1.5rem',
          display: 'flex', alignItems: 'center', gap: '0.75rem',
        }}>
          <span style={{ color: 'var(--sepia)' }}>⌨</span>
          KEYBOARD SHORTCUTS
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {SHORTCUT_LIST.map((s, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.4rem 0',
              borderBottom: i < SHORTCUT_LIST.length - 1 ? '1px solid rgba(58,50,40,0.5)' : 'none',
            }}>
              <span style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.85rem',
                color: 'var(--bone)',
              }}>
                {s.description}
              </span>
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                {s.keys.map((k, j) => (
                  <kbd key={j} style={{
                    display: 'inline-block',
                    padding: '0.15rem 0.5rem',
                    fontFamily: 'var(--font-ui)',
                    fontSize: '0.6rem',
                    letterSpacing: '0.05em',
                    color: 'var(--parchment)',
                    background: 'var(--ink)',
                    border: '1px solid var(--ash)',
                    borderRadius: '3px',
                    minWidth: '1.5rem',
                    textAlign: 'center',
                  }}>
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: '1.5rem',
          fontFamily: 'var(--font-ui)',
          fontSize: '0.5rem',
          letterSpacing: '0.15em',
          color: 'var(--fog)',
          textAlign: 'center',
        }}>
          PRESS ? OR ESC TO CLOSE
        </div>
      </div>
    </div>
  )
}
