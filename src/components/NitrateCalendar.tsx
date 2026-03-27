import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

interface NitrateCalendarProps {
    value: string           // 'YYYY-MM-DD'
    onChange: (v: string) => void
}

export default function NitrateCalendar({ value, onChange }: NitrateCalendarProps) {
    const selected = value ? new Date(value + 'T12:00:00') : new Date()
    const [viewYear, setViewYear] = useState(selected.getFullYear())
    const [viewMonth, setViewMonth] = useState(selected.getMonth())

    const today = useMemo(() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }, [])

    // Build the grid: ISO week starts on Monday
    const days = useMemo(() => {
        const first = new Date(viewYear, viewMonth, 1)
        const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate()
        // getDay(): 0=Sun, we want 0=Mon
        let startOffset = first.getDay() - 1
        if (startOffset < 0) startOffset = 6

        const cells: (number | null)[] = []
        for (let i = 0; i < startOffset; i++) cells.push(null)
        for (let d = 1; d <= lastDay; d++) cells.push(d)
        // Pad to full rows
        while (cells.length % 7 !== 0) cells.push(null)
        return cells
    }, [viewYear, viewMonth])

    const prevMonth = () => {
        if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
        else setViewMonth(m => m - 1)
    }
    const nextMonth = () => {
        if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
        else setViewMonth(m => m + 1)
    }

    const selectDay = (day: number) => {
        const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        onChange(iso)
    }

    const isFuture = (day: number) => {
        const check = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        return check > today
    }

    return (
        <div style={{
            background: 'linear-gradient(180deg, #100D08 0%, #0A0703 100%)',
            border: '1px solid rgba(139, 105, 20, 0.25)',
            borderRadius: '6px',
            padding: '1rem',
            fontFamily: 'var(--font-ui)',
        }}>
            {/* ── Header: Month navigator ── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '0.75rem', padding: '0 0.25rem',
            }}>
                <button onClick={prevMonth} type="button" style={{
                    background: 'none', border: 'none', color: 'var(--sepia)',
                    cursor: 'pointer', padding: '0.35rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: '4px', transition: 'background 0.2s',
                }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,105,20,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                    <ChevronLeft size={16} />
                </button>

                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        fontSize: '0.8rem', letterSpacing: '0.15em',
                        color: 'var(--parchment)', fontWeight: 600,
                    }}>
                        {MONTH_NAMES[viewMonth].toUpperCase()}
                    </div>
                    <div style={{
                        fontSize: '0.5rem', letterSpacing: '0.3em',
                        color: 'var(--fog)', marginTop: '0.15rem',
                    }}>
                        {viewYear}
                    </div>
                </div>

                <button onClick={nextMonth} type="button" style={{
                    background: 'none', border: 'none', color: 'var(--sepia)',
                    cursor: 'pointer', padding: '0.35rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: '4px', transition: 'background 0.2s',
                }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,105,20,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                    <ChevronRight size={16} />
                </button>
            </div>

            {/* ── Day-of-week labels ── */}
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
                gap: '2px', marginBottom: '0.35rem',
            }}>
                {DAY_LABELS.map(d => (
                    <div key={d} style={{
                        textAlign: 'center', fontSize: '0.45rem',
                        letterSpacing: '0.12em', color: 'var(--fog)',
                        padding: '0.25rem 0', opacity: 0.6,
                    }}>
                        {d}
                    </div>
                ))}
            </div>

            {/* ── Day grid ── */}
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
                gap: '2px',
            }}>
                {days.map((day, i) => {
                    if (day === null) return <div key={`e-${i}`} />

                    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const isSelected = iso === value
                    const isToday = iso === today
                    const future = isFuture(day)

                    return (
                        <button
                            key={i}
                            type="button"
                            disabled={future}
                            onClick={() => selectDay(day)}
                            style={{
                                position: 'relative',
                                width: '100%', aspectRatio: '1',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: 'none', borderRadius: '50%',
                                fontSize: '0.7rem', fontFamily: 'var(--font-sub)',
                                cursor: future ? 'default' : 'pointer',
                                transition: 'all 0.15s ease',

                                background: isSelected
                                    ? 'linear-gradient(135deg, var(--sepia), #c29b38)'
                                    : isToday
                                        ? 'rgba(139, 105, 20, 0.12)'
                                        : 'transparent',

                                color: isSelected
                                    ? 'var(--ink)'
                                    : future
                                        ? 'rgba(196,184,152,0.2)'
                                        : isToday
                                            ? 'var(--flicker)'
                                            : 'var(--bone)',

                                fontWeight: isSelected || isToday ? 700 : 400,

                                boxShadow: isSelected
                                    ? '0 2px 10px rgba(139, 105, 20, 0.4), 0 0 16px rgba(242, 232, 160, 0.15)'
                                    : 'none',

                                outline: isToday && !isSelected
                                    ? '1px solid rgba(139, 105, 20, 0.35)'
                                    : 'none',
                            }}
                            onMouseEnter={e => {
                                if (!future && !isSelected) {
                                    e.currentTarget.style.background = 'rgba(139, 105, 20, 0.15)'
                                }
                            }}
                            onMouseLeave={e => {
                                if (!future && !isSelected) {
                                    e.currentTarget.style.background = isToday ? 'rgba(139, 105, 20, 0.12)' : 'transparent'
                                }
                            }}
                        >
                            {day}
                        </button>
                    )
                })}
            </div>

            {/* ── Selected date display ── */}
            {value && (
                <div style={{
                    marginTop: '0.75rem', textAlign: 'center',
                    padding: '0.5rem', borderTop: '1px solid rgba(139,105,20,0.15)',
                }}>
                    <span style={{
                        fontSize: '0.55rem', letterSpacing: '0.2em',
                        color: 'var(--sepia)',
                    }}>
                        {new Date(value + 'T12:00:00').toLocaleDateString('en-US', {
                            weekday: 'short', day: 'numeric', month: 'long', year: 'numeric'
                        }).toUpperCase()}
                    </span>
                </div>
            )}
        </div>
    )
}
