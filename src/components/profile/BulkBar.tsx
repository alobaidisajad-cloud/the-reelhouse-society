import { X } from 'lucide-react'
/**
 * BulkBar — Sticky bottom action bar for bulk log operations.
 * Appears when user enters selection mode on diary grid.
 */

interface Props {
  selectedCount: number
  onDelete: () => void
  onAddToList: () => void
  onExport: () => void
  onCancel: () => void
}

export default function BulkBar({ selectedCount, onDelete, onAddToList, onExport, onCancel }: Props) {
  if (selectedCount === 0) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 0, left: 0, right: 0,
      zIndex: 9000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.75rem 1.5rem',
      background: 'rgba(18,14,9,0.95)',
      borderTop: '1px solid var(--sepia)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: '0 -4px 30px rgba(0,0,0,0.4)',
    }}>
      {/* Selected count */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
      }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.1rem',
          color: 'var(--flicker)',
        }}>
          {selectedCount}
        </span>
        <span style={{
          fontFamily: 'var(--font-ui)',
          fontSize: '0.6rem',
          letterSpacing: '0.15em',
          color: 'var(--fog)',
        }}>
          {selectedCount === 1 ? 'LOG SELECTED' : 'LOGS SELECTED'}
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          onClick={onAddToList}
          className="btn btn-ghost"
          style={{ fontSize: '0.55rem', padding: '0.4rem 0.8rem' }}
        >
          + ADD TO STACK
        </button>
        <button
          onClick={onExport}
          className="btn btn-ghost"
          style={{ fontSize: '0.55rem', padding: '0.4rem 0.8rem' }}
        >
          ↓ EXPORT
        </button>
        <button
          onClick={onDelete}
          style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.55rem',
            letterSpacing: '0.1em',
            color: 'var(--blood-reel)',
            background: 'transparent',
            border: '1px solid var(--blood-reel)',
            borderRadius: '2px',
            padding: '0.4rem 0.8rem',
            cursor: 'pointer',
          }}
        >
          {<X size={12} style={{ display: "inline-block", verticalAlign: "middle" }} />} DELETE
        </button>
        <button
          onClick={onCancel}
          className="btn btn-ghost"
          style={{ fontSize: '0.55rem', padding: '0.4rem 0.8rem' }}
        >
          CANCEL
        </button>
      </div>
    </div>
  )
}
