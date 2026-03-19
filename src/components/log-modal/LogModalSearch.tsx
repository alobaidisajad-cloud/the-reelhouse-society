import { motion } from 'framer-motion'
import { Search } from 'lucide-react'
import { tmdb } from '../../tmdb'

interface LogModalSearchProps {
    query: string
    searching: boolean
    results: any[]
    searchType: string
    searchContext: string
    onSearch: (q: string) => void
    onSelect: (film: any) => void
}

export default function LogModalSearch({ query, searching, results, searchType, searchContext, onSearch, onSelect }: LogModalSearchProps) {
    return (
        <div>
            <div style={{ position: 'relative' }}>
                <Search
                    size={16}
                    style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--fog)' }}
                />
                <input
                    className="input"
                    style={{ paddingLeft: '2.25rem' }}
                    placeholder="Search for a film..."
                    value={query}
                    onChange={(e) => onSearch(e.target.value)}
                    autoFocus
                />
            </div>

            {searching && (
                <motion.div
                    initial={{ opacity: 0.4 }}
                    animate={{ opacity: 1 }}
                    transition={{ repeat: Infinity, duration: 0.8, direction: 'alternate' } as any}
                    style={{ textAlign: 'center', padding: '1.5rem', fontFamily: 'var(--font-ui)', fontSize: '0.65rem', color: 'var(--sepia)', letterSpacing: '0.2em' }}
                >
                    TRANSMITTING QUERY...
                </motion.div>
            )}

            {results.length > 0 && (
                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {searchType === 'person' && (
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--sepia)', letterSpacing: '0.1em', padding: '0.25rem 0' }}>✦ ACTOR/DIRECTOR MATCH: {searchContext.toUpperCase()}</div>
                    )}
                    {searchType === 'typo' && (
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--flicker)', letterSpacing: '0.1em', padding: '0.25rem 0' }}>✦ FUZZY RESCUE: {searchContext.toUpperCase()}</div>
                    )}
                    {searchType === 'semantic' && (
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--parchment)', letterSpacing: '0.1em', padding: '0.25rem 0' }}>✦ SEMANTIC MATCH: {searchContext.toUpperCase()}</div>
                    )}
                    {results.map((r) => (
                        <button
                            key={r.id}
                            onClick={() => onSelect(r)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.75rem',
                                background: 'var(--ink)', border: '1px solid var(--ash)',
                                borderRadius: 'var(--radius-wobbly)',
                                padding: '0.6rem 0.75rem',
                                textAlign: 'left', transition: 'border-color 0.2s, background 0.2s',
                            }}
                            onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--sepia)'}
                            onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--ash)'}
                        >
                            {r.poster_path && (
                                <img
                                    src={tmdb.poster(r.poster_path, 'w92')}
                                    alt={r.title}
                                    style={{ width: 36, height: 54, objectFit: 'cover', borderRadius: '2px', filter: 'sepia(0.3)' }}
                                />
                            )}
                            <div>
                                <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--parchment)' }}>{r.title}</div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>
                                    {r.release_date?.slice(0, 4)} · {r.vote_average?.toFixed(1)} ✦
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {!searching && query && results.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--fog)', fontFamily: 'var(--font-sub)', fontSize: '0.85rem' }}>
                    No films found for "{query}"
                </div>
            )}
        </div>
    )
}
