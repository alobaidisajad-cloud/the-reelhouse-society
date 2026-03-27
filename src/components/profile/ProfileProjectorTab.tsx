import { ReelRating } from '../UI'

interface ProfileProjectorTabProps {
    profileLogs: any[]
    profileWatchlist: any[]
    profileLists: any[]
}

export function ProfileProjectorTab({ profileLogs, profileWatchlist, profileLists }: ProfileProjectorTabProps) {
    if (profileLogs.length === 0) return null

    const ratingBuckets = [1, 2, 3, 4, 5].map(r => ({ star: r, count: profileLogs.filter((l: any) => Math.round(l.rating) === r).length }))
    const maxRatingCount = Math.max(...ratingBuckets.map(b => b.count), 1)
    const decadeBuckets: Record<number, number> = {}
    profileLogs.forEach((l: any) => { if (!l.year) return; const decade = Math.floor(l.year / 10) * 10; decadeBuckets[decade] = (decadeBuckets[decade] || 0) + 1 })
    const decades = Object.entries(decadeBuckets).sort(([a], [b]) => +a - +b)
    const maxDecadeCount = Math.max(...(Object.values(decadeBuckets) as number[]), 1)

    return (
        <div className="profile-analytics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            <div className="card" style={{ padding: '1.75rem' }}>
                <div className="section-title" style={{ marginBottom: '1.25rem' }}>RATINGS REGISTER</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {ratingBuckets.reverse().map(({ star, count }) => (
                        <div key={star} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: 58, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
                                <ReelRating value={star} size="sm" />
                            </div>
                            <div style={{ flex: 1, height: 6, background: 'var(--ash)', borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 3, width: `${(count / maxRatingCount) * 100}%`, background: 'linear-gradient(90deg, var(--sepia), var(--flicker))', transition: 'width 0.6s ease' }} /></div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', width: 20, textAlign: 'right', flexShrink: 0 }}>{count}</div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="card" style={{ padding: '1.75rem' }}>
                <div className="section-title" style={{ marginBottom: '1.25rem' }}>ERA DISTRIBUTION</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {decades.map(([decade, count]: any) => (
                        <div key={decade} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', width: 38, flexShrink: 0 }}>{decade}s</div>
                            <div style={{ flex: 1, height: 6, background: 'var(--ash)', borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 3, width: `${(count / maxDecadeCount) * 100}%`, background: 'linear-gradient(90deg, var(--blood-reel), var(--sepia))', transition: 'width 0.6s ease' }} /></div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', width: 20, textAlign: 'right', flexShrink: 0 }}>{count}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
