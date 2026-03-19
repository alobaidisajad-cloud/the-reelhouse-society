import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Trash2, Check, X } from 'lucide-react'
import toast from 'react-hot-toast'
import SlotEditor from './SlotEditor'

const FORMAT_OPTIONS = ['35mm', 'DCP 4K', 'DCP 2K', '70mm', 'Blu-ray', '16mm', 'VHS (Special)']

interface FilmEditPanelProps { showtime: any; onClose: any; onRemove: any; onAddSlot: any; onRemoveSlot: any; onUpdate: any; }

export default function FilmEditPanel({ showtime, onClose, onRemove, onAddSlot, onRemoveSlot, onUpdate }: FilmEditPanelProps) {
    const [addingSlot, setAddingSlot] = useState(false)
    const [slotForm, setSlotForm] = useState({ time: '20:00', format: '35mm', notes: '' })
    const totalBooked = showtime.slots.reduce((a: any, s: any) => a + (s.bookedSeats?.length || 0), 0)

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 30000, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(5,3,1,0.6)', pointerEvents: 'auto', backdropFilter: 'blur(2px)' }} onClick={onClose} />
            <motion.div initial={{ opacity: 0, x: 100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 100 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                style={{ position: 'absolute', top: 0, right: 0, bottom: 0, background: 'var(--soot)', borderLeft: '3px solid var(--sepia)', width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', overflowY: 'auto', pointerEvents: 'auto', boxShadow: '-10px 0 40px rgba(0,0,0,0.5)' }}>
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--ash)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'rgba(139,105,20,0.07)', position: 'sticky', top: 0, zIndex: 2 }}>
                    <div>
                        <div className="ui-micro" style={{ color: 'var(--sepia)', marginBottom: '0.2rem' }}>FILM DETAILS</div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--parchment)', lineHeight: 1.2 }}>{showtime.film}</div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.46rem', color: 'var(--fog)', marginTop: 3 }}>{showtime.date} · {totalBooked} seats sold</div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.1rem' }}>
                        <button onClick={() => { onRemove(showtime.id); onClose() }} style={{ background: 'none', border: '1px solid rgba(92,26,11,0.4)', color: 'var(--blood-reel)', padding: '0.3rem', cursor: 'pointer', borderRadius: 2 }}><Trash2 size={12} /></button>
                        <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--ash)', color: 'var(--fog)', padding: '0.3rem', cursor: 'pointer', borderRadius: 2 }}><X size={12} /></button>
                    </div>
                </div>
                <div className="ui-micro" style={{ color: 'var(--sepia)', padding: '0.75rem 1.25rem 0.4rem' }}>TIME SLOTS</div>
                <div>
                    {showtime.slots.map((sl: any) => (
                        <SlotEditor key={sl.id} slot={sl} stId={showtime.id} onRemove={onRemoveSlot} onUpdate={onUpdate} />
                    ))}
                    {showtime.slots.length === 0 && (
                        <div className="ui-label" style={{ padding: '1rem 1.25rem', color: 'var(--fog)' }}>No slots yet. Add one below.</div>
                    )}
                </div>
                {addingSlot ? (
                    <div style={{ padding: '0.75rem 1.25rem', background: 'rgba(139,105,20,0.07)', borderTop: '1px dashed var(--ash)' }}>
                        <div className="ui-micro" style={{ color: 'var(--sepia)', marginBottom: '0.5rem' }}>NEW TIME SLOT</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginBottom: '0.4rem' }}>
                            <input className="input" type="time" value={slotForm.time} onChange={e => setSlotForm(p => ({ ...p, time: e.target.value }))} />
                            <select className="input" value={slotForm.format} onChange={e => setSlotForm(p => ({ ...p, format: e.target.value }))}>
                                {FORMAT_OPTIONS.map(f => <option key={f}>{f}</option>)}
                            </select>
                        </div>
                        <input className="input" placeholder="Notes (optional)" value={slotForm.notes} onChange={e => setSlotForm(p => ({ ...p, notes: e.target.value }))} style={{ marginBottom: '0.5rem', width: '100%' }} />
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button className="btn btn-primary" style={{ fontSize: '0.55rem' }} onClick={() => {
                                onAddSlot(showtime.id, {
                                    ...slotForm, ticketTypes: [
                                        { id: 'tt-std-' + Date.now(), type: 'Standard', price: 15, perks: 'General seating' },
                                        { id: 'tt-vip-' + Date.now(), type: 'VIP', price: 28, perks: 'Priority rows A-B + drink' },
                                    ]
                                })
                                setAddingSlot(false); setSlotForm({ time: '20:00', format: '35mm', notes: '' })
                                toast.success('Slot added')
                            }}><Check size={11} /> Add Slot</button>
                            <button className="btn btn-ghost" style={{ fontSize: '0.55rem' }} onClick={() => setAddingSlot(false)}><X size={11} /> Cancel</button>
                        </div>
                    </div>
                ) : (
                    <button className="btn btn-ghost" onClick={() => setAddingSlot(true)} style={{ borderRadius: 0, borderTop: '1px dashed var(--ash)', justifyContent: 'center', gap: '0.4rem', fontSize: '0.58rem' }}>
                        <Plus size={12} /> Add Time Slot
                    </button>
                )}
            </motion.div>
        </div>
    )
}
