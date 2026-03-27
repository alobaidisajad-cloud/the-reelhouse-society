import { Clock } from 'lucide-react'
import NitrateCalendar from '../NitrateCalendar'

interface LogDateSelectorProps {
    date: string
    setDate: (date: string) => void
    calendarOpen: boolean
    setCalendarOpen: (open: boolean) => void
}

export default function LogDateSelector({ date, setDate, calendarOpen, setCalendarOpen }: LogDateSelectorProps) {
    return (
        <div>
            <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', display: 'block', marginBottom: '0.5rem' }}>
                <Clock size={10} style={{ display: 'inline', marginRight: '0.25rem' }} />
                DATE WATCHED
            </label>
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
                <button 
                    type="button" 
                    onClick={() => { setDate(new Date().toISOString().slice(0, 10)); setCalendarOpen(false) }} 
                    className={`btn ${date === new Date().toISOString().slice(0, 10) ? 'btn-primary' : 'btn-ghost'}`} 
                    style={{ padding: '0.3em 0.8em', fontSize: '0.55rem' }}
                >
                    TODAY
                </button>
                <button 
                    type="button" 
                    onClick={() => { const d = new Date(); d.setDate(d.getDate() - 1); setDate(d.toISOString().slice(0, 10)); setCalendarOpen(false) }} 
                    className={`btn ${date === new Date(Date.now() - 86400000).toISOString().slice(0, 10) ? 'btn-primary' : 'btn-ghost'}`} 
                    style={{ padding: '0.3em 0.8em', fontSize: '0.55rem' }}
                >
                    YESTERDAY
                </button>
            </div>
            {/* Clickable date display */}
            <button
                type="button"
                onClick={() => setCalendarOpen(!calendarOpen)}
                style={{
                    width: '100%', padding: '0.65rem 1rem',
                    background: 'rgba(10, 7, 3, 0.8)', border: '1px solid var(--ash)',
                    borderRadius: 'var(--radius-wobbly)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    transition: 'border-color 0.2s',
                    borderColor: calendarOpen ? 'var(--sepia)' : 'var(--ash)',
                }}
            >
                <span style={{ fontFamily: 'var(--font-sub)', fontSize: '0.85rem', color: 'var(--parchment)' }}>
                    {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: calendarOpen ? 'var(--sepia)' : 'var(--fog)' }}>
                    {calendarOpen ? '▲ CLOSE' : '▼ CHANGE'}
                </span>
            </button>
            {calendarOpen && (
                <div style={{ marginTop: '0.5rem' }}>
                    <NitrateCalendar value={date} onChange={(v) => { setDate(v); setCalendarOpen(false) }} />
                </div>
            )}
        </div>
    )
}
