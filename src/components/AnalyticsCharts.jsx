// Analytics Charts for Venue Dashboard
// Pure SVG / CSS charts — no external chart library needed
// WeeklyRevenueChart, OccupancyGauge, TopFilmsChart, TicketTypeBreakdown

import { useMemo } from 'react'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Weekly Revenue Bar Chart — SVG bars per day of week
export function WeeklyRevenueChart({ showtimes = [], events = [] }) {
    const data = useMemo(() => {
        const totals = Array(7).fill(0)
        showtimes.forEach(st => {
            const d = new Date(st.date + 'T12:00')
            const dayIdx = (d.getDay() + 6) % 7 // 0=Mon
            st.slots?.forEach(sl => {
                const lowestP = Math.min(...(sl.ticketTypes?.map(t => t.price) || [0]))
                totals[dayIdx] += sl.bookedSeats?.length * lowestP || 0
            })
        })
        events.forEach(ev => {
            const d = new Date(ev.date + 'T12:00')
            const dayIdx = (d.getDay() + 6) % 7
            totals[dayIdx] += (ev.totalTickets - (ev.ticketsLeft ?? ev.totalTickets)) * ev.price || 0
        })
        return totals
    }, [showtimes, events])

    const max = Math.max(...data, 1)
    const totalRevenue = data.reduce((a, b) => a + b, 0)
    const today = (new Date().getDay() + 6) % 7

    return (
        <div style={{ background: 'var(--soot)', border: '1px solid var(--ash)', padding: '1.5rem', borderTop: '3px solid var(--flicker)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                <div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.2em', color: 'var(--sepia)' }}>WEEKLY REVENUE</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--parchment)', lineHeight: 1.1, marginTop: 4 }}>
                        ${totalRevenue.toLocaleString()}
                    </div>
                </div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.48rem', color: 'var(--fog)', letterSpacing: '0.08em', textAlign: 'right' }}>
                    THIS WEEK<br />SHOWTIMES + EVENTS
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: 100 }}>
                {data.map((val, i) => {
                    const pct = max > 0 ? (val / max) * 100 : 0
                    const isToday = i === today
                    return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem', height: '100%', justifyContent: 'flex-end' }}>
                            <div
                                style={{
                                    width: '100%',
                                    height: `${Math.max(pct, 3)}%`,
                                    background: isToday
                                        ? 'linear-gradient(to top, var(--sepia), var(--flicker))'
                                        : 'linear-gradient(to top, rgba(139,105,20,0.4), rgba(139,105,20,0.2))',
                                    border: isToday ? '1px solid var(--flicker)' : '1px solid rgba(139,105,20,0.3)',
                                    borderRadius: '2px 2px 0 0',
                                    transition: 'height 0.5s ease',
                                    position: 'relative',
                                    minHeight: 3,
                                }}
                                title={`${DAY_LABELS[i]}: $${val}`}
                            />
                            {val > 0 && (
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.38rem', color: isToday ? 'var(--flicker)' : 'var(--fog)', letterSpacing: '0.05em' }}>
                                    ${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                                </div>
                            )}
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.42rem', color: isToday ? 'var(--parchment)' : 'var(--fog)', letterSpacing: '0.05em', fontWeight: isToday ? '700' : '400' }}>
                                {DAY_LABELS[i]}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// Circular Occupancy Gauge — SVG circle
export function OccupancyGauge({ showtimes = [] }) {
    const { booked, capacity, pct } = useMemo(() => {
        const booked = showtimes.reduce((a, st) => a + st.slots?.reduce((b, sl) => b + (sl.bookedSeats?.length || 0), 0), 0)
        const capacity = showtimes.reduce((a, st) => a + st.slots?.reduce((b, sl) => {
            const layout = sl.seatLayout || { rows: 10, cols: 15 }
            return b + (layout.rows * layout.cols - (sl.seatLayout?.blockedSeats?.length || 0))
        }, 0), 0) || showtimes.reduce((a, st) => a + st.slots?.length * 150, 0)
        const pct = capacity > 0 ? Math.round((booked / capacity) * 100) : 0
        return { booked, capacity, pct }
    }, [showtimes])

    const r = 44
    const circ = 2 * Math.PI * r
    const stroke = circ * (1 - pct / 100)
    const color = pct > 85 ? 'var(--blood-reel)' : pct > 60 ? 'var(--sepia)' : '#27913f'

    return (
        <div style={{ background: 'var(--soot)', border: '1px solid var(--ash)', padding: '1.5rem', borderTop: '3px solid var(--sepia)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.2em', color: 'var(--sepia)' }}>SEAT OCCUPANCY</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <svg width={110} height={110} viewBox="0 0 110 110" style={{ flexShrink: 0 }}>
                    <circle cx={55} cy={55} r={r} fill="none" stroke="var(--ash)" strokeWidth={10} />
                    <circle
                        cx={55} cy={55} r={r} fill="none"
                        stroke={color}
                        strokeWidth={10}
                        strokeLinecap="round"
                        strokeDasharray={circ}
                        strokeDashoffset={stroke}
                        transform="rotate(-90 55 55)"
                        style={{ transition: 'stroke-dashoffset 1s ease, stroke 0.5s ease' }}
                    />
                    <text x={55} y={52} textAnchor="middle" style={{ fontFamily: 'var(--font-display)', fontSize: 18, fill: 'var(--parchment)' }}>{pct}%</text>
                    <text x={55} y={66} textAnchor="middle" style={{ fontFamily: 'var(--font-ui)', fontSize: 7, fill: 'var(--fog)', letterSpacing: 2 }}>FILLED</text>
                </svg>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {[
                        ['SEATS SOLD', booked],
                        ['TOTAL CAPACITY', capacity],
                        ['AVAILABLE', capacity - booked],
                    ].map(([lbl, val]) => (
                        <div key={lbl}>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--parchment)', lineHeight: 1 }}>{val.toLocaleString()}</div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.42rem', color: 'var(--fog)', letterSpacing: '0.1em', marginTop: 1 }}>{lbl}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

// Top Films ranked by revenue with mini bars
export function TopFilmsChart({ showtimes = [] }) {
    const films = useMemo(() => {
        const map = {}
        showtimes.forEach(st => {
            const rev = st.slots?.reduce((a, sl) => {
                const p = Math.min(...(sl.ticketTypes?.map(t => t.price) || [0]))
                return a + (sl.bookedSeats?.length || 0) * p
            }, 0) || 0
            const sold = st.slots?.reduce((a, sl) => a + (sl.bookedSeats?.length || 0), 0) || 0
            map[st.film] = (map[st.film] || { rev: 0, sold: 0 })
            map[st.film].rev += rev
            map[st.film].sold += sold
        })
        return Object.entries(map)
            .map(([film, d]) => ({ film, ...d }))
            .sort((a, b) => b.rev - a.rev)
            .slice(0, 5)
    }, [showtimes])

    const maxRev = Math.max(...films.map(f => f.rev), 1)

    return (
        <div style={{ background: 'var(--soot)', border: '1px solid var(--ash)', padding: '1.5rem', borderTop: '3px solid var(--bone)' }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1.25rem' }}>TOP FILMS BY REVENUE</div>
            {films.length === 0 ? (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--fog)', fontStyle: 'italic' }}>No showtime revenue yet. Add films and sell tickets to see rankings.</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {films.map((f, i) => {
                        const pct = Math.round((f.rev / maxRev) * 100)
                        return (
                            <div key={f.film}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--sepia)', lineHeight: 1, flexShrink: 0 }}>{i + 1}</span>
                                        <span style={{ fontFamily: 'var(--font-sub)', fontSize: '0.82rem', color: 'var(--parchment)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.film}</span>
                                    </div>
                                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--flicker)', flexShrink: 0, marginLeft: '0.5rem' }}>${f.rev.toLocaleString()}</span>
                                </div>
                                <div style={{ height: 4, background: 'var(--ash)', borderRadius: 2 }}>
                                    <div style={{ height: '100%', width: `${pct}%`, background: i === 0 ? 'var(--flicker)' : 'var(--sepia)', borderRadius: 2, transition: 'width 0.6s ease', opacity: 1 - i * 0.15 }} />
                                </div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.42rem', color: 'var(--fog)', letterSpacing: '0.08em', marginTop: 2 }}>{f.sold} tickets sold</div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// Ticket Type Breakdown — horizontal stacked bar
export function TicketTypeBreakdown({ showtimes = [], events = [] }) {
    const breakdown = useMemo(() => {
        const map = {}
        showtimes.forEach(st => {
            st.slots?.forEach(sl => {
                sl.ticketTypes?.forEach(tt => {
                    // Count booked seats matching this type (approximation)
                    map[tt.type] = (map[tt.type] || { count: 0, rev: 0 })
                    // We can't know which seats are which type, so distribute proportionally
                    const share = Math.round((sl.bookedSeats?.length || 0) / (sl.ticketTypes?.length || 1))
                    map[tt.type].count += share
                    map[tt.type].rev += share * tt.price
                })
            })
        })
        events.forEach(ev => {
            const sold = ev.totalTickets - (ev.ticketsLeft ?? ev.totalTickets)
            map['Event'] = (map['Event'] || { count: 0, rev: 0 })
            map['Event'].count += sold
            map['Event'].rev += sold * ev.price
        })
        return Object.entries(map).map(([type, d]) => ({ type, ...d }))
    }, [showtimes, events])

    const total = breakdown.reduce((a, b) => a + b.count, 0)
    const TYPE_COLORS = { VIP: 'var(--flicker)', Standard: 'var(--sepia)', Student: 'var(--fog)', Event: 'var(--bone)' }

    if (total === 0) return null

    return (
        <div style={{ background: 'var(--soot)', border: '1px solid var(--ash)', padding: '1.5rem', borderTop: '3px solid var(--fog)' }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1rem' }}>TICKET BREAKDOWN</div>
            {/* Stacked bar */}
            <div style={{ display: 'flex', height: 14, borderRadius: 2, overflow: 'hidden', marginBottom: '1rem' }}>
                {breakdown.map(d => (
                    <div
                        key={d.type}
                        style={{ flex: d.count, background: TYPE_COLORS[d.type] || 'var(--ash)', transition: 'flex 0.6s ease', minWidth: d.count > 0 ? 2 : 0 }}
                        title={`${d.type}: ${d.count} tickets`}
                    />
                ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                {breakdown.map(d => (
                    <div key={d.type} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <div style={{ width: 10, height: 10, background: TYPE_COLORS[d.type] || 'var(--ash)', borderRadius: 1, flexShrink: 0 }} />
                        <div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.48rem', color: 'var(--fog)', letterSpacing: '0.08em' }}>{d.type.toUpperCase()}</div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', color: 'var(--parchment)', lineHeight: 1 }}>{d.count}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
