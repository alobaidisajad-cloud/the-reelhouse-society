import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import SlotEditor from './SlotEditor'
import FilmEditPanel from './FilmEditPanel'

function getWeekDates(offset = 0): string[] {
    const now = new Date()
    const day = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7)
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday)
        d.setDate(monday.getDate() + i)
        return d.toISOString().slice(0, 10)
    })
}

import { Showtime, Screen, ShowtimeSlot } from '../../types'

interface WeeklyCalendarProps {
    showtimes: Showtime[];
    screens?: Screen[];
    onRemove: (id: string) => void;
    onAddSlot: (stId: string, slot: Partial<ShowtimeSlot>) => void;
    onRemoveSlot: (stId: string, slotId: string) => void;
    onUpdateSlot: (stId: string, slotId: string, updates: Partial<ShowtimeSlot>) => void;
    onAddFilmToDate: (date: string) => void;
}

export default function WeeklyCalendar({ showtimes, onRemove, onAddSlot, onRemoveSlot, onUpdateSlot, onAddFilmToDate }: WeeklyCalendarProps) {
    const [weekOffset, setWeekOffset] = useState(0)
    const [selectedFilm, setSelectedFilm] = useState<Showtime | null>(null)
    const weekDates = getWeekDates(weekOffset)
    const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

    const byDate: Record<string, Showtime[]> = {}
    showtimes.forEach(st => {
        if (!byDate[st.date]) byDate[st.date] = []
        byDate[st.date].push(st)
    })

    const totalSlots = showtimes.reduce((a: number, s: Showtime) => a + s.slots.length, 0)
    const totalBooked = showtimes.reduce((a: number, s: Showtime) => a + s.slots.reduce((b: number, sl: ShowtimeSlot) => b + (sl.bookedSeats?.length || 0), 0), 0)

    return (
        <div>
            {/* Week navigator */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button className="btn btn-ghost" style={{ padding: '0.35rem 0.6rem' }} onClick={() => setWeekOffset(w => w - 1)}><ChevronLeft size={14} /></button>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.12em', color: 'var(--fog)', whiteSpace: 'nowrap' }}>
                        {new Date(weekDates[0] + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} –
                        {' '}{new Date(weekDates[6] + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <button className="btn btn-ghost" style={{ padding: '0.35rem 0.6rem' }} onClick={() => setWeekOffset(w => w + 1)}><ChevronRight size={14} /></button>
                    {weekOffset !== 0 && <button className="btn btn-ghost" style={{ fontSize: '0.52rem' }} onClick={() => setWeekOffset(0)}>Today</button>}
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    {[['FILMS', showtimes.length], ['SLOTS', totalSlots], ['SOLD', totalBooked]].map(([l, v]) => (
                        <div key={l as string} style={{ textAlign: 'center' }}>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--flicker)', lineHeight: 1 }}>{v}</div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.42rem', color: 'var(--fog)', letterSpacing: '0.12em' }}>{l}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', position: 'relative' }}>
                {/* Calendar grid */}
                <div className="hide-scroll" style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(260px, 1fr))', gap: '0.75rem', overflowX: 'auto', scrollSnapType: 'x mandatory', paddingBottom: '1rem', WebkitOverflowScrolling: 'touch' }}>
                    {weekDates.map((date, di) => {
                        const films = byDate[date] || []
                        const isToday = date === new Date().toISOString().slice(0, 10)
                        return (
                            <div key={date} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minHeight: 120, scrollSnapAlign: 'start' }}>
                                <div style={{ textAlign: 'center', padding: '0.4rem 0.25rem', background: isToday ? 'rgba(139,105,20,0.2)' : 'var(--soot)', border: `1px solid ${isToday ? 'var(--sepia)' : 'var(--ash)'}`, borderRadius: 2 }}>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: isToday ? 'var(--flicker)' : 'var(--fog)', letterSpacing: '0.1em' }}>{DAY_NAMES[di]}</div>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', color: isToday ? 'var(--parchment)' : 'var(--fog)', lineHeight: 1.1 }}>
                                        {new Date(date + 'T12:00').getDate()}
                                    </div>
                                </div>
                                {films.map((st: Showtime) => (
                                    <button key={st.id} onClick={() => setSelectedFilm(selectedFilm?.id === st.id ? null : st)}
                                        style={{
                                            background: selectedFilm?.id === st.id ? 'rgba(139,105,20,0.2)' : 'var(--ink)',
                                            border: `1px solid ${selectedFilm?.id === st.id ? 'var(--sepia)' : 'var(--ash)'}`,
                                            borderLeft: `3px solid ${selectedFilm?.id === st.id ? 'var(--flicker)' : 'var(--sepia)'}`,
                                            padding: '0.4rem 0.5rem', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.15s',
                                        }}>
                                        <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.62rem', color: 'var(--parchment)', lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{st.film}</div>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.42rem', color: 'var(--fog)', marginTop: 3, letterSpacing: '0.06em' }}>{st.slots.length} slot{st.slots.length !== 1 ? 's' : ''}</div>
                                    </button>
                                ))}
                                <button onClick={() => onAddFilmToDate(date)}
                                    style={{ background: 'none', border: '1px dashed var(--ash)', color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.48rem', padding: '0.35rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem', transition: 'all 0.15s', letterSpacing: '0.05em' }}
                                    onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.borderColor = 'var(--sepia)'; e.currentTarget.style.color = 'var(--sepia)' }}
                                    onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.borderColor = 'var(--ash)'; e.currentTarget.style.color = 'var(--fog)' }}
                                >
                                    <Plus size={10} /> Add
                                </button>
                            </div>
                        )
                    })}
                </div>

                <AnimatePresence>
                    {selectedFilm && (
                        <FilmEditPanel
                            showtime={selectedFilm}
                            onClose={() => setSelectedFilm(null)}
                            onRemove={(id: string) => { onRemove(id); setSelectedFilm(null) }}
                            onAddSlot={onAddSlot}
                            onRemoveSlot={onRemoveSlot}
                            onUpdate={onUpdateSlot}
                        />
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}
