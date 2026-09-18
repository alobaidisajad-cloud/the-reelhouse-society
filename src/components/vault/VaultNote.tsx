import { Lock, ChevronRight } from 'lucide-react'

/**
 * A private note, as the member's own log page shows it. The web twin of the
 * mobile app's VaultNote — same rules, same look:
 *
 *  · Only ever handed a note that is the reader's own. The page decides that,
 *    and the server agrees: `log_private_notes` is owner-only.
 *  · NO FRAME. A brass rule down one side and a faint wash, so it reads as part
 *    of the writing above it rather than a third box.
 *  · A LOCK, not a key — a key means "a rank you do not hold" everywhere else.
 *  · ONE line of chrome, no date: the viewing it belongs to already has one.
 *  · The whole note is one control. Opening it is where it can be removed, so
 *    nothing destructive sits on a page made for reading.
 *  · On a chronicle card it is clamped to three lines, so one long note cannot
 *    swell a card the other viewings have to match.
 *  · `dir="auto"`: an Arabic note reads right-to-left by its own first letter.
 */
export default function VaultNote({ note, onOpen, compact = false }: {
    note: string
    onOpen?: () => void
    compact?: boolean
}) {
    const body = (note ?? '').trim()
    if (!body) return null

    const inner = (
        <>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: compact ? '0.35rem' : '0.5rem' }}>
                <Lock size={compact ? 9 : 10} color="var(--sepia)" strokeWidth={2} aria-hidden="true" />
                <span style={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: compact ? '0.45rem' : '0.5rem', letterSpacing: '0.2em' }}>
                    <span style={{ color: 'var(--sepia)' }}>THE VAULT</span>
                    <span style={{ color: 'var(--fog)' }}>{'  ·  ONLY YOU'}</span>
                </span>
                {onOpen && <ChevronRight size={12} color="var(--fog)" strokeWidth={1.5} aria-hidden="true" />}
            </span>
            <span
                dir="auto"
                style={{
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: compact ? 3 : 'unset',
                    overflow: compact ? 'hidden' : 'visible',
                    fontFamily: 'var(--font-body)', fontStyle: 'italic',
                    fontSize: compact ? '0.8rem' : '0.9rem', lineHeight: compact ? 1.6 : 1.65,
                    color: 'var(--bone)', whiteSpace: 'pre-wrap', textAlign: 'start',
                }}
            >
                {body}
            </span>
        </>
    )

    const frame: React.CSSProperties = {
        display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'start',
        background: 'rgba(184,137,26,0.05)',
        border: 'none', borderLeft: '2px solid var(--sepia)', borderRadius: 0,
        padding: compact ? '0.65rem 0.6rem 0.65rem 0.75rem' : '0.9rem 0.75rem 0.9rem 0.9rem',
        margin: compact ? '0.9rem 0 0' : '0.5rem 0 1rem',
    }

    if (!onOpen) return <div style={frame} data-vault-note="">{inner}</div>

    return (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen() }}
            // Heard as one thing: that it is private, then what it says.
            aria-label={`Your private note. ${body}`}
            className="vault-note"
            data-vault-note=""
            style={{ ...frame, cursor: 'pointer', color: 'inherit', font: 'inherit' }}
        >
            {inner}
        </button>
    )
}
