import { useState } from 'react'
import { motion } from 'framer-motion'
import { Edit2, Check, X, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

const FORMAT_OPTIONS = ['35mm', 'DCP 4K', 'DCP 2K', '70mm', 'Blu-ray', '16mm', 'VHS (Special)']

import { ShowtimeSlot } from '../../types'

// ── SLOT EDITOR ROW ──
interface SlotEditorProps {
    slot: ShowtimeSlot;
    stId: string;
    onRemove: (stId: string, slotId: string) => void;
    onUpdate: (stId: string, slotId: string, updates: Partial<ShowtimeSlot>) => void;
}
export default function SlotEditor({ slot, stId, onRemove, onUpdate }: SlotEditorProps) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState({ time: slot.time, format: slot.format, notes: slot.notes || '' })
    const pct = Math.round(((slot.bookedSeats?.length || 0) / 150) * 100)
    const lowestPrice = Math.min(...(slot.ticketTypes?.map((t: { price: number }) => t.price) || [0]))
    if (editing) return (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(139,105,20,0.08)', borderBottom: '1px solid var(--ash)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginBottom: '0.4rem' }}>
                <input className="input" type="time" value={draft.time} onChange={e => setDraft(p => ({ ...p, time: e.target.value }))} />
                <select className="input" value={draft.format} onChange={e => setDraft(p => ({ ...p, format: e.target.value }))}>
                    {FORMAT_OPTIONS.map(f => <option key={f}>{f}</option>)}
                </select>
            </div>
            <input className="input" placeholder="Notes" value={draft.notes} onChange={e => setDraft(p => ({ ...p, notes: e.target.value }))} style={{ marginBottom: '0.4rem', width: '100%' }} />
            <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button className="btn btn-primary" style={{ fontSize: '0.55rem' }} onClick={() => { onUpdate(stId, slot.id, draft); setEditing(false); toast.success('Slot updated') }}><Check size={11} /> Save</button>
                <button className="btn btn-ghost" style={{ fontSize: '0.55rem' }} onClick={() => setEditing(false)}><X size={11} /> Cancel</button>
            </div>
        </div>
    )
    return (
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--ash)', background: 'var(--soot)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', flex: 1 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: 'var(--flicker)', background: 'var(--ink)', border: '1px solid var(--sepia)', padding: '2px 8px' }}>{slot.time}</span>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.48rem', color: 'var(--fog)', letterSpacing: '0.08em' }}>{slot.format}</span>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.48rem', color: 'var(--sepia)' }}>from ${lowestPrice}</span>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.46rem', color: pct > 80 ? 'var(--blood-reel)' : 'var(--fog)' }}>{slot.bookedSeats?.length || 0}/150 seats</span>
            </div>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button className="slot-action-btn" onClick={() => setEditing(true)} style={{ background: 'none', border: '1px solid var(--ash)', color: 'var(--fog)', padding: '0.25rem 0.5rem', cursor: 'pointer', borderRadius: 2, fontSize: '0.5rem' }}><Edit2 size={12} /></button>
                <button className="slot-action-btn" onClick={() => onRemove(stId, slot.id)} style={{ background: 'none', border: '1px solid rgba(92,26,11,0.4)', color: 'var(--blood-reel)', padding: '0.25rem 0.5rem', cursor: 'pointer', borderRadius: 2 }}><Trash2 size={12} /></button>
            </div>
        </div>
    )
}
