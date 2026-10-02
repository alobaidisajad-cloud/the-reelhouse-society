import { motion } from 'framer-motion'
import { RadarChart } from '../UI'
import { stampsOf, type ProfileAnalytics } from '../../constants/honours'
import { standingFor } from '../../constants/standing'
import { dnaOf, DNA_FLOOR } from './dna'

const Corners = () => (
    <>
        {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(pos => (
            <div key={pos} style={{ position: 'absolute', top: pos.includes('top') ? 8 : undefined, bottom: pos.includes('bottom') ? 8 : undefined, left: pos.includes('left') ? 8 : undefined, right: pos.includes('right') ? 8 : undefined, fontFamily: 'var(--font-display)', fontSize: '0.5rem', color: 'var(--ash)' }}>✦</div>
        ))}
    </>
)

/**
 * TASTE DNA, read from the member's whole record (get_public_profile_analytics),
 * as the app's Cinema DNA card reads it: the house's one ladder for the name,
 * the measured obscurity index or "—", never a figure made up from the average.
 */
export function TasteDNA({ analytics, failed }: { analytics?: ProfileAnalytics | null; failed?: boolean }) {
    const stamps = stampsOf(analytics)
    const total = stamps?.total_logs ?? 0
    const plain = (words: string) => (
        <div className="taste-dna-poster">
            <h3>TASTE DNA</h3>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--fog)', textAlign: 'center', marginBottom: '1rem' }}>CINEMATIC FINGERPRINT ANALYSIS</div>
            <div role="status" style={{ textAlign: 'center', padding: '1.5rem 1rem', color: 'var(--fog)', fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontStyle: 'italic' }}>{words}</div>
            <Corners />
        </div>
    )
    if (!stamps) {
        return plain(analytics?.error ? 'This record is not open to you.' : failed || analytics ? 'The record could not be read.' : 'Reading the record…')
    }
    if (total < DNA_FLOOR) return plain(`A reading needs ${DNA_FLOOR} films; ${total} ${total === 1 ? 'is' : 'are'} logged.`)

    const dna = dnaOf(analytics)
    const archetype = standingFor(total).level
    const topDecade = dna.topDecades[0]?.[0]

    return (
        <div className="taste-dna-poster">
            <h3>TASTE DNA</h3>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--fog)', textAlign: 'center', marginBottom: '1rem' }}>CINEMATIC FINGERPRINT ANALYSIS</div>
            <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.75rem', color: 'var(--parchment)', textAlign: 'center', lineHeight: 1.5, padding: '0.75rem', background: 'rgba(139,105,20,0.08)', borderRadius: 'var(--radius-card)', border: '1px solid var(--ash)', marginBottom: '1rem' }}>
                {archetype}{topDecade ? ` · ${topDecade}` : ''} · School of {dna.tones}
            </div>
            {dna.autopsy && (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem', marginTop: '0.5rem', filter: 'drop-shadow(0 0 10px rgba(139,105,20,0.2))' }}>
                    <RadarChart autopsy={dna.autopsy} size={150} />
                </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>OBSCURITY INDEX</span>
                <span style={{ fontFamily: 'var(--font-display-alt)', fontSize: '1rem', color: 'var(--sepia)' }}>{dna.obscurity}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {dna.topDecades.map(([decade, count]) => {
                    const pct = Math.round((count / total) * 100)
                    return (
                        <div key={decade}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.15rem' }}>
                                <span style={{ fontFamily: 'var(--font-sub)', fontSize: '0.7rem', color: 'var(--bone)' }}>{decade}</span>
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--sepia)' }}>{pct}%</span>
                            </div>
                            <div style={{ height: 3, background: 'var(--ash)', borderRadius: 2, overflow: 'hidden' }}>
                                <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: pct / 100 }} transition={{ duration: 0.8, delay: 0.2 }} style={{ height: '100%', width: '100%', transformOrigin: 'left', background: 'linear-gradient(90deg, var(--sepia), var(--flicker))' }} />
                            </div>
                        </div>
                    )
                })}
            </div>
            <Corners />
        </div>
    )
}
