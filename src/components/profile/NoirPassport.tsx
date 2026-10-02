/**
 * NoirPassport — the passport's stamps, earned from the member's whole record
 * (constants/honours.ts, the app's list), never from the logs that loaded.
 */
import { useMemo } from 'react'
import { PASSPORT_STAMPS, stampLines, stampsOf, type ProfileAnalytics } from '../../constants/honours'
import { RecordNotRead } from './RecordNotRead'

function PassportStamp({ stamp, earned, index }: { stamp: { label: string; sub: string; glyph: string }; earned: boolean; index: number }) {
    const rotation = ['-4', '3', '-2', '5', '-3', '2', '-5', '4'][index % 8]
    const [line1, line2] = stampLines(stamp.label)
    return (
        <div
            title={earned ? stamp.label : `Not yet earned: ${stamp.sub}`}
            style={{
                position: 'relative', width: 120, height: 120,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: earned ? 1 : 0.18, transform: `rotate(${rotation}deg)`,
                transition: 'opacity 0.3s, transform 0.3s', cursor: 'default',
                filter: earned ? 'none' : 'grayscale(1)',
            }}
            onMouseEnter={e => { if (earned) e.currentTarget.style.transform = `rotate(${rotation}deg) scale(1.08)` }}
            onMouseLeave={e => e.currentTarget.style.transform = `rotate(${rotation}deg) scale(1)`}
        >
            <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" width="120" height="120">
                <circle cx="60" cy="60" r="56" fill="none" stroke="var(--sepia)" strokeWidth="2.5" strokeDasharray="8 3 15 2 6 4 20 2" opacity="0.9" />
                <circle cx="60" cy="60" r="48" fill="none" stroke="var(--sepia)" strokeWidth="1" opacity="0.5" />
                <text x="60" y="58" textAnchor="middle" dominantBaseline="middle" fontFamily="var(--font-display)" fontSize="24" fill="var(--sepia)" opacity="0.95">{stamp.glyph}</text>
                <text x="60" y="38" textAnchor="middle" fontFamily="var(--font-ui)" fontSize="7" letterSpacing="2" fill="var(--sepia)" opacity="0.85">{line1}</text>
                {line2 && (
                    <text x="60" y="47" textAnchor="middle" fontFamily="var(--font-ui)" fontSize="7" letterSpacing="2" fill="var(--sepia)" opacity="0.85">{line2}</text>
                )}
                <text x="60" y="82" textAnchor="middle" fontFamily="var(--font-ui)" fontSize="6" letterSpacing="1.5" fill="var(--sepia)" opacity="0.6">{stamp.sub}</text>
                <line x1="20" y1="55" x2="28" y2="58" stroke="var(--sepia)" strokeWidth="1" opacity="0.2" />
                <line x1="92" y1="63" x2="100" y2="60" stroke="var(--sepia)" strokeWidth="1" opacity="0.15" />
            </svg>
        </div>
    )
}

export function NoirPassport({ analytics, failed }: { analytics?: ProfileAnalytics | null; failed?: boolean }) {
    const stamps = stampsOf(analytics)
    const earned = useMemo(() =>
        stamps ? PASSPORT_STAMPS.map(s => ({ ...s, earned: s.earned(stamps) })) : [],
        [stamps])

    if (!stamps) return <RecordNotRead analytics={analytics} failed={failed} />

    const earnedCount = earned.filter(s => s.earned).length

    return (
        <div style={{ padding: '2rem 0' }}>
            <div style={{
                border: '1px solid rgba(139,105,20,0.3)', borderRadius: '4px', padding: '3rem',
                background: 'linear-gradient(135deg, rgba(139,105,20,0.04) 0%, transparent 60%)',
                position: 'relative', overflow: 'hidden',
            }}>
                {[['top', 'left'], ['top', 'right'], ['bottom', 'left'], ['bottom', 'right']].map(([v, h]: string[]) => (
                    <div key={`${v}-${h}`} style={{
                        position: 'absolute', [v]: '0.75rem', [h]: '0.75rem', width: 16, height: 16,
                        borderTop: v === 'top' ? '1px solid rgba(139,105,20,0.4)' : 'none',
                        borderBottom: v === 'bottom' ? '1px solid rgba(139,105,20,0.4)' : 'none',
                        borderLeft: h === 'left' ? '1px solid rgba(139,105,20,0.4)' : 'none',
                        borderRight: h === 'right' ? '1px solid rgba(139,105,20,0.4)' : 'none',
                    }} />
                ))}

                <div style={{ textAlign: 'center', marginBottom: '2.5rem', borderBottom: '1px dashed rgba(139,105,20,0.2)', paddingBottom: '2rem' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.5em', color: 'var(--sepia)', marginBottom: '0.5rem', opacity: 0.7 }}>THE REELHOUSE SOCIETY</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 3rem)', color: 'var(--parchment)', lineHeight: 1, marginBottom: '0.75rem' }}>Cinematic Passport</div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.3em', color: 'var(--fog)' }}>{earnedCount} of {PASSPORT_STAMPS.length} STAMPS EARNED</div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center', padding: '1rem 0' }}>
                    {earned.map((stamp, i) => (
                        <PassportStamp key={stamp.id} stamp={stamp} earned={stamp.earned} index={i} />
                    ))}
                </div>

                <div style={{ textAlign: 'center', marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px dashed rgba(139,105,20,0.2)' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.4em', color: 'var(--fog)', opacity: 0.4 }}>STAMPS ARE ISSUED BY THE SOCIETY ARCHIVIST · NOT TRANSFERABLE · REELHOUSE ARCHIVE DEPT</div>
                </div>
            </div>
        </div>
    )
}
