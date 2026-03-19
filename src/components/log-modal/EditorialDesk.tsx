import { tmdb } from '../../tmdb'

interface EditorialDeskProps {
    dropCap: boolean
    setDropCap: (v: boolean) => void
    pullQuote: string
    setPullQuote: (v: string) => void
    editorialHeader: string | null
    setEditorialHeader: (v: string | null) => void
    availableBackdrops: Array<{ file_path: string }>
}

export default function EditorialDesk({ dropCap, setDropCap, pullQuote, setPullQuote, editorialHeader, setEditorialHeader, availableBackdrops }: EditorialDeskProps) {
    return (
        <div style={{ padding: '1.25rem', border: '1px solid var(--sepia)', borderRadius: 'var(--radius-card)', background: 'rgba(139,105,20,0.05)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--sepia)' }}>
                    ✦ The Editorial Desk
                </div>
            </div>

            {/* Drop Cap */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--bone)' }}>
                    STYLIZED DROP CAP
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--fog)', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={dropCap}
                        onChange={(e) => setDropCap(e.target.checked)}
                        style={{ accentColor: 'var(--sepia)' }}
                    />
                    ENABLE
                </label>
            </div>

            {/* Pull Quote */}
            <div>
                <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--bone)', display: 'block', marginBottom: '0.5rem' }}>
                    PULL QUOTE
                </label>
                <input
                    className="input"
                    placeholder="Highlight a memorable line from your review..."
                    value={pullQuote}
                    onChange={(e) => setPullQuote(e.target.value)}
                    maxLength={120}
                    style={{ borderStyle: 'dashed', borderColor: 'var(--sepia)', fontFamily: 'var(--font-sub)', fontStyle: 'italic' }}
                />
            </div>

            {/* Header Still */}
            <div>
                <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--bone)', display: 'block', marginBottom: '0.75rem' }}>
                    ARTICLE HEADER (STILL)
                </label>
                {availableBackdrops.length > 0 ? (
                    <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem', scrollbarWidth: 'none' }}>
                        <button
                            onClick={() => setEditorialHeader(null)}
                            style={{ flexShrink: 0, width: 80, height: 45, background: editorialHeader === null ? 'var(--sepia)' : 'var(--ink)', border: editorialHeader === null ? '2px solid var(--sepia)' : '1px solid var(--ash)', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: editorialHeader === null ? 'var(--ink)' : 'var(--fog)' }}
                        >
                            NONE
                        </button>
                        {availableBackdrops.map(p => (
                            <img
                                key={p.file_path}
                                src={tmdb.backdrop(p.file_path, 'w300')}
                                onClick={() => setEditorialHeader(p.file_path)}
                                style={{
                                    flexShrink: 0, width: 80, height: 45, objectFit: 'cover', borderRadius: '2px', cursor: 'pointer',
                                    border: editorialHeader === p.file_path ? '2px solid var(--sepia)' : '1px solid transparent',
                                    opacity: editorialHeader && editorialHeader !== p.file_path ? 0.4 : 1
                                }}
                            />
                        ))}
                    </div>
                ) : (
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)' }}>
                        No stills found.
                    </div>
                )}
            </div>
        </div>
    )
}
