import { motion } from 'framer-motion'
import { RadarChart } from '../UI'
import { tmdb } from '../../tmdb'

export function TasteDNA({ logs }: { logs: any[] }) {
    if (logs.length === 0) {
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

    const decades: Record<string, number> = {}
    logs.forEach((log: any) => {
        const year = parseInt(log.year || '2000')
        const decade = `${Math.floor(year / 10) * 10}s`
        decades[decade] = (decades[decade] || 0) + 1
    })
    const topDecade = Object.entries(decades).sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0] || '2000s'
    const rated = logs.filter((l: any) => l.rating > 0)
    const avgRating = rated.length ? rated.reduce((s: number, l: any) => s + l.rating, 0) / rated.length : 0
    const obscurityScore = Math.round(40 + (5 - avgRating) * 12 + Math.min(logs.length, 30))
    const archetypes = [
        { min: 0, label: 'Initiate' }, { min: 5, label: 'Devotee' }, { min: 15, label: 'Archivist' },
        { min: 30, label: 'Cinephile' }, { min: 60, label: 'Obsessive' }, { min: 100, label: 'The Oracle' },
    ]
    const archetype = archetypes.filter(a => logs.length >= a.min).pop()?.label || 'Initiate'
    const tones = avgRating >= 4 ? 'Romanticism' : avgRating >= 3 ? 'Realism' : avgRating >= 2 ? 'Dark Romanticism' : 'Nihilism'
    const topDecades = Object.entries(decades).sort((a, b) => b[1] - a[1]).slice(0, 4)
    const autopsies = logs.filter((l: any) => l.isAutopsied && l.autopsy).map((l: any) => l.autopsy)
    let avgAutopsy: { story: number; cinematography: number; sound: number } | null = null
    if (autopsies.length > 0) {
        avgAutopsy = {
            story: Math.round(autopsies.reduce((s: number, a: any) => s + (a.story || a.screenplay || a.script || 0), 0) / autopsies.length),
            cinematography: Math.round(autopsies.reduce((s: number, a: any) => s + (a.cinematography || a.visuals || a.acting || 0), 0) / autopsies.length),
            sound: Math.round(autopsies.reduce((s: number, a: any) => s + (a.sound || a.score || a.editing || 0), 0) / autopsies.length),
        }
    }

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
                {topDecades.map(([decade, count]: [string, number]) => {
                    const pct = Math.round((count / logs.length) * 100)
                    return (
                        <div key={decade}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.15rem' }}>
                                <span style={{ fontFamily: 'var(--font-sub)', fontSize: '0.7rem', color: 'var(--bone)' }}>{decade}</span>
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--sepia)' }}>{pct}%</span>
                            </div>
                            <div style={{ height: 3, background: 'var(--ash)', borderRadius: 2, overflow: 'hidden' }}>
                                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, delay: 0.2 }} style={{ height: '100%', background: 'linear-gradient(90deg, var(--sepia), var(--flicker))' }} />
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
