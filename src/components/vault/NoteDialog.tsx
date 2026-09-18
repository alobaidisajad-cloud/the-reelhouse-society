import { useEffect, useState } from 'react'
import { Lock, Pencil, Trash2 } from 'lucide-react'
import ModalShell from '../ModalShell'

/**
 * A private note, opened. The web twin of the mobile app's NoteSheet.
 *
 *  · EDIT appears only where editing is real: on the viewing the log is on now,
 *    for a member who holds the rank. A past viewing's note is a record of that
 *    night, and a member whose rank has ended may read and take back their
 *    writing but not change it — both are the server's rules, drawn here so
 *    nothing is offered that would then be refused.
 *  · REMOVE is always here. Taking your own writing back is never gated.
 *  · Removing asks first, inside the same dialog — the house's own words, not
 *    the browser's — and says exactly what is lost: the note, not the viewing.
 */
export default function NoteDialog({ open, note, viewingLabel, canEdit, onClose, onEdit, onRemove }: {
    open: boolean
    note: string
    viewingLabel: string
    canEdit: boolean
    onClose: () => void
    onEdit?: () => void
    onRemove: () => void
}) {
    const [confirming, setConfirming] = useState(false)
    useEffect(() => { if (!open) setConfirming(false) }, [open])

    const row: React.CSSProperties = {
        display: 'flex', alignItems: 'center', gap: '0.9rem', width: '100%',
        padding: '0.95rem 0', background: 'none', border: 'none', cursor: 'pointer',
        borderTop: '1px solid rgba(139,105,20,0.12)', color: 'var(--parchment)',
        fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', textAlign: 'start',
    }

    return (
        <ModalShell open={open} onClose={onClose} maxWidth={480} trapFocus>
            <div role="dialog" aria-modal="true" aria-label="Your private note">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                    <Lock size={10} color="var(--sepia)" strokeWidth={2} aria-hidden="true" />
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em' }}>
                        <span style={{ color: 'var(--sepia)' }}>THE VAULT</span>
                        <span style={{ color: 'var(--fog)' }}>{'  ·  ONLY YOU'}</span>
                    </span>
                </div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.62rem', letterSpacing: '0.15em', color: 'var(--parchment)', marginBottom: '1rem' }}>
                    {viewingLabel}
                </div>
                {/* A long note scrolls here rather than pushing the actions away. */}
                <p dir="auto" style={{
                    fontFamily: 'var(--font-body)', fontStyle: 'italic', fontSize: '1rem', lineHeight: 1.7,
                    color: 'var(--bone)', margin: '0 0 1.5rem', whiteSpace: 'pre-wrap', textAlign: 'start',
                    maxHeight: '45vh', overflowY: 'auto',
                }}>{note}</p>

                {!confirming ? (
                    <>
                        {canEdit && onEdit && (
                            <button type="button" style={row} onClick={onEdit} aria-label="Edit this note">
                                <Pencil size={15} color="var(--sepia)" strokeWidth={1.5} aria-hidden="true" /> EDIT NOTE
                            </button>
                        )}
                        {/* Parchment with a crimson mark: blood-reel text on ink is
                            unreadable. The confirmation carries the red. */}
                        <button type="button" style={row} onClick={() => setConfirming(true)}
                            aria-label="Remove this note" aria-describedby="vault-remove-hint">
                            <Trash2 size={15} color="var(--crimson)" strokeWidth={1.5} aria-hidden="true" /> REMOVE NOTE
                        </button>
                        <span id="vault-remove-hint" style={{ display: 'none' }}>The viewing stays. The note is gone for good.</span>
                    </>
                ) : (
                    <div role="alertdialog" aria-label="Remove this note?" style={{ borderTop: '1px solid rgba(139,105,20,0.12)', paddingTop: '1rem' }}>
                        <div style={{ fontFamily: 'var(--font-sub)', fontSize: '1rem', color: 'var(--parchment)', marginBottom: '0.35rem' }}>
                            Remove this note?
                        </div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--fog)', marginBottom: '1.1rem' }}>
                            The viewing stays. The note is gone for good.
                        </div>
                        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                            <button type="button" className="btn btn-ghost" autoFocus onClick={() => setConfirming(false)}
                                style={{ fontSize: '0.6rem', letterSpacing: '0.18em' }}>
                                KEEP
                            </button>
                            <button type="button" className="btn" onClick={onRemove}
                                style={{ fontSize: '0.6rem', letterSpacing: '0.18em', background: 'var(--crimson)', color: 'var(--parchment)', borderColor: 'var(--crimson)' }}>
                                REMOVE
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </ModalShell>
    )
}
