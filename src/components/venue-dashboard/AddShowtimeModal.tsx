import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Plus } from 'lucide-react'
import toast from 'react-hot-toast'

import { Screen, Showtime } from '../../types'

interface AddShowtimeModalProps {
    onClose: () => void;
    onAdd: (st: Partial<Showtime>) => Promise<void> | void;
    defaultDate?: string;
    screens?: Screen[];
}

export default function AddShowtimeModal({ onClose, onAdd, defaultDate = '', screens = [] }: AddShowtimeModalProps) {
    const [film, setFilm] = useState('')
    const [date, setDate] = useState(defaultDate)
    const [screenName, setScreenName] = useState(screens[0]?.name || 'Screen 1')
    const [durationMins, setDurationMins] = useState<number | ''>(120)
    
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,3,1,0.95)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                style={{ background: 'var(--soot)', border: '1px solid var(--sepia)', width: '100%', maxWidth: 480, maxHeight: '100dvh', overflowY: 'auto', padding: '2rem', paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))', borderRadius: 2, position: 'relative' }}>
                <button onClick={onClose} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer' }}><X size={20} /></button>
                <div className="section-title-sm" style={{ color: 'var(--sepia)', marginBottom: '0.4rem' }}>NEW FILM</div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)', marginBottom: '1.25rem' }}>Add to Schedule</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <input className="input" placeholder="Film title *" value={film} onChange={e => setFilm(e.target.value)} autoFocus />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                        <div>
                            <div className="ui-micro" style={{ color: 'var(--sepia)', marginBottom: '0.35rem' }}>SCREENING DATE</div>
                            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
                        </div>
                        <div>
                            <div className="ui-micro" style={{ color: 'var(--sepia)', marginBottom: '0.35rem' }}>DURATION (MINS)</div>
                            <input className="input" type="number" min={30} max={480} value={durationMins} onChange={e => setDurationMins(e.target.value === '' ? '' : (parseInt(e.target.value) || ''))} />
                        </div>
                    </div>
                    <div>
                        <div className="ui-micro" style={{ color: 'var(--sepia)', marginBottom: '0.35rem' }}>SCREEN</div>
                        {screens.length > 0 ? (
                            <select className="input" value={screenName} onChange={e => setScreenName(e.target.value)}>
                                {screens.map(sc => <option key={sc.id} value={sc.name}>{sc.name}</option>)}
                            </select>
                        ) : (
                            <input className="input" placeholder="Screen 1" value={screenName} onChange={e => setScreenName(e.target.value)} />
                        )}
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--fog)', fontStyle: 'italic' }}>
                        Add time slots and ticket prices after creating the entry.
                    </div>
                    <button className="btn btn-primary" style={{ justifyContent: 'center', marginTop: '0.25rem' }}
                        onClick={() => {
                            if (!film || !date) { toast.error('Film title and date are required'); return }
                            onAdd({ film, date, screenName, durationMins: durationMins === '' ? 120 : durationMins })
                            toast.success(`${film} added to schedule`)
                            onClose()
                        }}>
                        <Plus size={14} /> Add to Calendar
                    </button>
                </div>
            </motion.div>
        </div>
    )
}
