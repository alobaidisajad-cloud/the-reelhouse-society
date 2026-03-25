import { Link } from 'react-router-dom'
import { ReelRating } from '../UI'
import { tmdb } from '../../tmdb'

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
    const totalHours = Math.floor(profileLogs.length * 115 / 60)
    // Logging streak: count consecutive days logged (up to today)
    const streakCount = (() => {
        const logDates = [...new Set(profileLogs
            .map((l: any) => l.date || l.loggedAt)
            .filter(Boolean)
            .map(d => new Date(d).toISOString().slice(0, 10))
        )].sort().reverse()
        if (!logDates.length) return 0
        const today = new Date().toISOString().slice(0, 10)
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
        // Streak must include today or yesterday
        if (logDates[0] !== today && logDates[0] !== yesterday) return 0
        let streak = 1
        for (let i = 1; i < logDates.length; i++) {
            const prev: any = new Date(logDates[i - 1])
            const curr: any = new Date(logDates[i])
            const diff = (prev - curr) / 86400000
            if (diff === 1) streak++
            else break
        }
        return streak
    })()

    return (
        <div className="profile-analytics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            <div className="card" style={{ padding: '1.75rem' }}>
                <div className="section-title" style={{ marginBottom: '1.25rem' }}>RATINGS REGISTER</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {ratingBuckets.reverse().map(({ star, count }) => (
                        <div key={star} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--flicker)', width: 28, flexShrink: 0, textAlign: 'right' }}>{'✦'.repeat(star)}</div>
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
            <div className="card" style={{ padding: '1.75rem' }}>
                <div className="section-title" style={{ marginBottom: '1.25rem' }}>CATALOG METRICS</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    {[
                        ...(streakCount > 0 ? [{ label: '🔥 LOGGING STREAK', value: `${streakCount} day${streakCount !== 1 ? 's' : ''}` }] : []),
                        { label: 'ESTIMATED RUNTIME', value: `${totalHours.toLocaleString()} hrs` }, { label: 'TOTAL FILMS LOGGED', value: profileLogs.length }, { label: 'WATCHLIST QUEUED', value: profileWatchlist.length }, { label: 'LISTS CURATED', value: profileLists.length }, { label: 'RATED 5 REELS', value: profileLogs.filter(l => l.rating === 5).length }, { label: 'WRITTEN REVIEWS', value: profileLogs.filter(l => l.review?.length > 10).length }].map(({ label, value }) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.5rem' }}>
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>{label}</span>
                            <span style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--bone)' }}>{value}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
