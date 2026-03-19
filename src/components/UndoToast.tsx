/**
 * UndoToast — Countdown toast with undo button for destructive actions.
 * Nitrate Noir styled glass panel with sepia accent progress bar.
 */

interface UndoItem {
  id: string
  message: string
}

interface Props {
  items: UndoItem[]
  onUndo: (id: string) => void
}

export default function UndoToast({ items, onUndo }: Props) {
  if (items.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: '1.5rem',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9998,
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      maxWidth: '400px',
      width: '90%',
    }}>
      {items.map(item => (
        <div
          key={item.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            padding: '0.75rem 1rem',
            background: 'rgba(18,14,9,0.95)',
            border: '1px solid var(--ash)',
            borderRadius: 'var(--radius-card)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <span style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            color: 'var(--bone)',
            flex: 1,
            minWidth: 0,
          }}>
            {item.message}
          </span>
          <button
            onClick={() => onUndo(item.id)}
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '0.6rem',
              letterSpacing: '0.15em',
              color: 'var(--sepia)',
              background: 'transparent',
              border: '1px solid var(--sepia)',
              borderRadius: '2px',
              padding: '0.3rem 0.8rem',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'background 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139,105,20,0.15)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            UNDO
          </button>
          {/* Progress bar countdown */}
          <div style={{
            position: 'absolute',
            bottom: 0, left: 0,
            width: '100%', height: '2px',
            background: 'var(--sepia)',
            animation: 'undoCountdown 5s linear forwards',
          }} />
        </div>
      ))}
    </div>
  )
}
