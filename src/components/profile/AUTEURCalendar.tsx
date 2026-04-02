import { useMemo, useState } from 'react'
import { Lock } from 'lucide-react'
import { Link } from 'react-router-dom'

interface CalendarLog {
    watchedDate?: string
    createdAt?: string
    title?: string
    [key: string]: any
}

interface TooltipData {
    x: number
    y: number
    date: string
    films: string[]
    count: number
}

interface DayCell {
    date: string
    count: number
    films: string[]
    isFuture: boolean
    display: Date
}

// ΓöÇΓöÇ The Calendar ΓöÇΓöÇ
// GitHub-style 52-week film activity heatmap, Archivist tier
export function AUTEURCalendar({ logs = [], isPremium = false }: { logs?: CalendarLog[]; isPremium?: boolean }) {
    const [tooltip, setTooltip] = useState<TooltipData | null>(null)

    // Build a map of date -> films watched
    const activityMap = useMemo(() => {
        const map: Record<string, string[]> = {}
        for (const log of logs) {
            const raw = log.watchedDate || log.createdAt
            if (!raw) continue
            const d = new Date(raw)
            if (isNaN(d.getTime())) continue
            const key = d.toISOString().slice(0, 10) // 'YYYY-MM-DD'
            if (!map[key]) map[key] = []
            map[key].push(log.title || 'Untitled')
        }
        return map
    }, [logs])

    // Build the 52-week grid starting from today going back
    const { weeks, monthLabels } = useMemo(() => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        // Start from the Sunday 52 weeks ago
        const start = new Date(today)
        start.setDate(today.getDate() - 52 * 7)
        // Roll back to the nearest Sunday
        start.setDate(start.getDate() - start.getDay())

        const weeks: DayCell[][] = []
        const monthLabels: { weekIndex: number; label: string }[] = []
        let lastMonth = -1

        let cursor = new Date(start)
        for (let w = 0; w < 53; w++) {
            const week: DayCell[] = []
            for (let d = 0; d < 7; d++) {
                const dateKey = cursor.toISOString().slice(0, 10)
                const isFuture = cursor.getTime() > today.getTime()
                week.push({
                    date: dateKey,
                    count: isFuture ? -1 : (activityMap[dateKey]?.length || 0),
                    films: activityMap[dateKey] || [],
                    isFuture,
                    display: new Date(cursor),
                })
                cursor.setDate(cursor.getDate() + 1)
            }
            // Track month label changes (use first day of week)
            const weekMonth = week[0].display.getMonth()
            if (weekMonth !== lastMonth && !week[0].isFuture) {
                monthLabels.push({
                    weekIndex: w,
                    label: week[0].display.toLocaleString('en-US', { month: 'short' }),
                })
                lastMonth = weekMonth
            }
            weeks.push(week)
        }
        return { weeks, monthLabels }
    }, [activityMap])

    const maxCount = useMemo(() => {
        let max = 0
        for (const films of Object.values(activityMap)) max = Math.max(max, (films as string[]).length)
        return Math.max(max, 1)
    }, [activityMap])

    const totalFilmsThisYear = useMemo(() => {
        const yearAgo = new Date()
        yearAgo.setFullYear(yearAgo.getFullYear() - 1)
        return Object.entries(activityMap).filter(([date]) => new Date(date) >= yearAgo).reduce((s, [, films]) => s + (films as string[]).length, 0)
    }, [activityMap])

    const activeDays = Object.keys(activityMap).length

    const getCellColor = (count: number) => {
        if (count <= 0) return 'rgba(255,255,255,0.04)'
        const intensity = Math.min(count / maxCount, 1)
        if (intensity < 0.25) return 'rgba(139,105,20,0.25)'
        if (intensity < 0.5) return 'rgba(139,105,20,0.5)'
        if (intensity < 0.75) return 'rgba(139,105,20,0.75)'
        return 'var(--sepia)'
    }

    const CELL = 12
    const GAP = 2
    const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']

    if (!isPremium) {
        return (
            <div style={{
                padding: '3rem', border: '1px solid var(--sepia)', borderRadius: 'var(--radius-card)',
                background: 'rgba(139,105,20,0.03)', textAlign: 'center', display: 'flex',
                flexDirection: 'column', alignItems: 'center', gap: '1.25rem'
            }}>
                <Lock size={28} color="var(--sepia)" />
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)' }}>
                    The The Calendar
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--fog)', maxWidth: 380, lineHeight: 1.6 }}>
                    Your complete visual history of film activity ΓÇö every film, every day, across an entire year.
                    Available with the Archivist membership.
                </div>
                <Link to="/society" style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)', border: '1px solid var(--sepia)', padding: '0.6rem 1.4rem', borderRadius: '2px', textDecoration: 'none', transition: 'background 0.2s', display: 'inline-block' }}>
                    JOIN THE SOCIETY
                </Link>
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Stats row */}
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                {[
                    { label: 'FILMS THIS YEAR', value: totalFilmsThisYear },
                    { label: 'ACTIVE DAYS', value: activeDays },
                    { label: 'LONGEST STREAK', value: `${computeStreak(activityMap)} days` },
                ].map(({ label, value }) => (
                    <div key={label}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--sepia)' }}>{value}</div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>{label}</div>
                    </div>
                ))}
            </div>

            {/* Calendar grid */}
            <div style={{ overflowX: 'auto', paddingBottom: '0.5rem' }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                    {/* Month labels */}
                    <div style={{ display: 'flex', marginLeft: 28, marginBottom: 4, position: 'relative', height: 16 }}>
                        {monthLabels.map(({ weekIndex, label }) => (
                            <div key={label + weekIndex} style={{
                                position: 'absolute',
                                left: weekIndex * (CELL + GAP),
                                fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em',
                                color: 'var(--fog)', whiteSpace: 'nowrap',
                            }}>
                                {label}
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: GAP }}>
                        {/* Day-of-week labels */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, marginRight: 4 }}>
                            {DAY_LABELS.map((label, i) => (
                                <div key={i} style={{
                                    height: CELL, width: 20,
                                    fontFamily: 'var(--font-ui)', fontSize: '0.4rem', color: 'var(--ash)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                                }}>
                                    {label}
                                </div>
                            ))}
                        </div>

                        {/* Week columns */}
                        {weeks.map((week, wi) => (
                            <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
                                {week.map((day, di) => (
                                    <div
                                        key={di}
                                        onMouseEnter={(e) => {
                                            if (day.isFuture || day.count < 0) return
                                            const rect = (e.target as HTMLElement).getBoundingClientRect()
                                            setTooltip({
                                                x: rect.left,
                                                y: rect.top,
                                                date: day.display.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
                                                films: day.films,
                                                count: day.count,
                                            })
                                        }}
                                        onMouseLeave={() => setTooltip(null)}
                                        style={{
                                            width: CELL, height: CELL,
                                            borderRadius: 2,
                                            background: day.isFuture ? 'transparent' : getCellColor(day.count),
                                            border: day.isFuture ? 'none' : '1px solid rgba(255,255,255,0.04)',
                                            cursor: day.count > 0 ? 'pointer' : 'default',
                                            transition: 'transform 0.1s',
                                            flexShrink: 0,
                                        }}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>

                    {/* Legend */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', marginLeft: 28 }}>
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--ash)', letterSpacing: '0.1em' }}>LESS</span>
                        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
                            <div key={v} style={{ width: CELL, height: CELL, borderRadius: 2, background: getCellColor(v > 0 ? Math.ceil(v * maxCount) : 0), border: '1px solid rgba(255,255,255,0.04)' }} />
                        ))}
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--ash)', letterSpacing: '0.1em' }}>MORE</span>
                    </div>
                </div>

                {/* Tooltip */}
                {tooltip && (
                    <div style={{
                        position: 'fixed',
                        left: tooltip.x + 16,
                        top: tooltip.y - 8,
                        zIndex: 99999,
                        background: 'var(--soot)',
                        border: '1px solid var(--sepia)',
                        borderRadius: 'var(--radius-card)',
                        padding: '0.75rem 1rem',
                        maxWidth: 220,
                        pointerEvents: 'none',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                    }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--sepia)', marginBottom: '0.4rem' }}>
                            {tooltip.date}
                        </div>
                        {tooltip.count === 0 ? (
                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--fog)', fontStyle: 'italic' }}>No films recorded</div>
                        ) : (
                            <>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--bone)', marginBottom: '0.3rem' }}>
                                    {tooltip.count} film{tooltip.count !== 1 ? 's' : ''} watched
                                </div>
                                {tooltip.films.slice(0, 3).map((title: string, i: number) => (
                                    <div key={i} style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--fog)', fontStyle: 'italic', lineHeight: 1.4 }}>
                                        ┬╖ {title}
                                    </div>
                                ))}
                                {tooltip.films.length > 3 && (
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--ash)', marginTop: '0.2rem' }}>
                                        +{tooltip.films.length - 3} more
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

// Compute longest streak (consecutive days with at least 1 film)
function computeStreak(activityMap: Record<string, string[]>): number {
    const dates = Object.keys(activityMap).sort()
    if (dates.length === 0) return 0
    let maxStreak = 1, cur = 1
    for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i - 1])
        const curr = new Date(dates[i])
        const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
        if (diff === 1) { cur++; maxStreak = Math.max(maxStreak, cur) }
        else cur = 1
    }
    return maxStreak
}
