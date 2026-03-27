import { motion } from 'framer-motion'
import { RadarChart } from '../UI'
import { tmdb } from '../../tmdb'

export function TasteDNA({ stats }: { stats: any }) {
    if (!stats || stats.total_logs === 0) {
        return (
            <div className="taste-dna-poster">
                <h3>TASTE DNA</h3>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--fog)', textAlign: 'center', marginBottom: '1rem' }}>CINEMATIC FINGERPRINT ANALYSIS</div>
                <div style={{ textAlign: 'center', padding: '1.5rem 1rem', color: 'var(--fog)', fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontStyle: 'italic' }}>Log 5 films to unlock your cinematic identity</div>
                {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(pos => (
                    <div key={pos} style={{ position: 'absolute', top: pos.includes('top') ? 8 : undefined, bottom: pos.includes('bottom') ? 8 : undefined, left: pos.includes('left') ? 8 : undefined, right: pos.includes('right') ? 8 : undefined, fontFamily: 'var(--font-display)', fontSize: '0.5rem', color: 'var(--ash)' }}>✦</div>
                ))}
            </div>
        )
    }

    const avgRating = Number(stats.avg_rating || 0)
    const obscurityScore = Math.round(40 + (5 - avgRating) * 12 + Math.min(stats.total_logs, 30))
    const archetypes = [
        { min: 0, label: 'Initiate' }, { min: 5, label: 'Devotee' }, { min: 15, label: 'Archivist' },
        { min: 30, label: 'Cinephile' }, { min: 60, label: 'Obsessive' }, { min: 100, label: 'The Oracle' },
    ]
    const archetype = archetypes.filter(a => stats.total_logs >= a.min).pop()?.label || 'Initiate'
    const tones = avgRating >= 4 ? 'Romanticism' : avgRating >= 3 ? 'Realism' : avgRating >= 2 ? 'Dark Romanticism' : 'Nihilism'
    
    // Convert decades JSON to sorted array
    const topDecades = Object.entries(stats.decades || {}).sort((a: any, b: any) => b[1] - a[1]).slice(0, 4)
    const topDecade = topDecades[0]?.[0] || '2000s'

    // Process Autopsies
    const avgAutopsy = (stats.avg_autopsy && Number(stats.avg_autopsy.story) > 0) ? {
        story: Math.round(Number(stats.avg_autopsy.story)),
        cinematography: Math.round(Number(stats.avg_autopsy.cinematography)),
        sound: Math.round(Number(stats.avg_autopsy.sound)),
    } : null

    return (
        <div className="taste-dna-poster">
            <h3>TASTE DNA</h3>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--fog)', textAlign: 'center', marginBottom: '1rem' }}>CINEMATIC FINGERPRINT ANALYSIS</div>
            <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.75rem', color: 'var(--parchment)', textAlign: 'center', lineHeight: 1.5, padding: '0.75rem', background: 'rgba(139,105,20,0.08)', borderRadius: 'var(--radius-card)', border: '1px solid var(--ash)', marginBottom: '1rem' }}>
                {archetype} of {topDecade} {tones}
            </div>
            {avgAutopsy && (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem', marginTop: '0.5rem', filter: 'drop-shadow(0 0 10px rgba(139,105,20,0.2))' }}>
                    <RadarChart autopsy={avgAutopsy} size={150} />
                </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>OBSCURITY INDEX</span>
                <span style={{ fontFamily: 'var(--font-display-alt)', fontSize: '1rem', color: 'var(--sepia)' }}>{obscurityScore}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {topDecades.map(([decade, count]: [string, any]) => {
                    const pct = Math.round((Number(count) / stats.total_logs) * 100)
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
            {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(pos => (
                <div key={pos} style={{ position: 'absolute', top: pos.includes('top') ? 8 : undefined, bottom: pos.includes('bottom') ? 8 : undefined, left: pos.includes('left') ? 8 : undefined, right: pos.includes('right') ? 8 : undefined, fontFamily: 'var(--font-display)', fontSize: '0.5rem', color: 'var(--ash)' }}>✦</div>
            ))}
        </div>
    )
}
