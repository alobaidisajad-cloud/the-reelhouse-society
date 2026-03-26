import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Calendar, Clock, MapPin, Check } from 'lucide-react'
import { useAuthStore, useVenueStore, useUIStore } from '../store'
import { useFilmStore } from '../store'
import SeatSelector from './SeatSelector'
import TicketStubGallery from './TicketStubGallery'
import toast from 'react-hot-toast'

export default function TicketFlow({ showtime, slot, onClose, venueSeatLayout }: any) {
    const { isAuthenticated } = useAuthStore()
    const { openSignupModal } = useUIStore()
    const { venue, bookSeat } = useVenueStore()

    const [step, setStep] = useState(1) // 1=type, 2=seat, 3=confirm, 4=success
    const [ticketType, setTicketType] = useState<any>(null)
    const [selectedSeat, setSelectedSeat] = useState<any>(null)
    const [createdStub, setCreatedStub] = useState<any>(null)

    const seatLayout = venueSeatLayout || venue.seatLayout || { rows: 10, cols: 15, vipRows: 2, aisleAfterCol: 7 }
    const totalSeats = (seatLayout.rows || 10) * (seatLayout.cols || 15)
    const takenSeats = slot.bookedSeats?.length || 0
    const availableSeats = totalSeats - takenSeats
    const BOOKING_FEE = 1.50

    const handleSeatSelect = (seatId: string, _seatKind: string) => {
        if (ticketType?.type === 'VIP') {
            const vipRowCount = seatLayout.vipRows || 2
            const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
            const vipRows = new Set(rowLabels.slice(0, vipRowCount))
            if (!vipRows.has(seatId[0])) {
                toast.error('VIP tickets are reserved for rows A & B only')
                return
            }
        }
        if (ticketType?.type === 'Student' || ticketType?.type === 'Standard') {
            const vipRowCount = seatLayout.vipRows || 2
            const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
            const vipRows = new Set(rowLabels.slice(0, vipRowCount))
            if (vipRows.has(seatId[0]) && ticketType?.type !== 'VIP') {
                toast(`Seat ${seatId} is VIP-reserved. Pick another row or upgrade.`, { icon: '⭐' })
                return
            }
        }
        setSelectedSeat(seatId)
    }


    const handlePurchase = async () => {
        if (!selectedSeat || !ticketType) return
        if (!isAuthenticated) { openSignupModal(); return }
        bookSeat(showtime.id, slot.id, selectedSeat)
        const stub = {
            showtimeId: showtime.dbId || showtime.id || null,   // real Supabase UUID if available
            slotId: slot.id || 'default',
            filmId: showtime.id,
            title: showtime.film,
            date: showtime.date,
            time: slot.time,
            venue: venue.name,
            screen: showtime.screenName || slot.screenName || 'Main Screen',
            screenName: showtime.screenName || slot.screenName || null,
            seat: selectedSeat,
            ticketType: ticketType.type,
            price: ticketType.price,
            amount: ticketType.price + BOOKING_FEE,
            format: slot.format,
            qrCode: null,
        }
        // Rigidly persist to Supabase; do not use fake local stubs.
        try {
            const dbId = await useFilmStore.getState().saveStub(stub)
            if (dbId) {
                useFilmStore.setState(s => ({
                    stubs: [{ ...stub, id: dbId }, ...s.stubs.filter(x => x.id !== dbId)]
                }))
            } else {
                toast.error('Transaction Failed: Rejected by Core System')
                return
            }
        } catch {
            toast.error('Transaction Failed: Connection Interrupted')
            return
        }
        setCreatedStub(stub)
        setStep(4)
    }

    const stepLabels = ['', 'Choose Ticket Type', 'Pick Your Seat', 'Confirm & Pay', '']

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,3,1,0.97)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}>
            <motion.div
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                style={{ background: 'var(--soot)', border: '1px solid var(--sepia)', width: '100%', maxWidth: step === 2 ? 720 : 480, borderRadius: '2px', maxHeight: '92vh', overflowY: 'auto', position: 'relative' }}
            >
                {/* Sticky header */}
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--ash)', position: 'sticky', top: 0, background: 'var(--soot)', zIndex: 2 }}>
                    <button onClick={onClose} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer' }}><X size={20} /></button>
                    {step < 4 && <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.3em', color: 'var(--sepia)', marginBottom: '0.3rem' }}>{stepLabels[step]}</div>}
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--parchment)', lineHeight: 1.1 }}>{showtime.film}</div>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                        {[
                            { Icon: Calendar, val: showtime.date },
                            { Icon: Clock, val: slot.time },
                            { Icon: MapPin, val: venue.name },
                        ].map(({ Icon, val }) => (
                            <span key={val} style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.08em' }}>
                                <Icon size={9} />{val}
                            </span>
                        ))}
                    </div>
                    {step < 4 && (
                        <div style={{ display: 'flex', gap: '0.3rem', marginTop: '1rem' }}>
                            {[1, 2, 3].map(s => (
                                <div key={s} style={{ flex: 1, height: 2, background: s <= step ? 'var(--sepia)' : 'var(--ash)', borderRadius: 2, transition: 'background 0.3s' }} />
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ padding: '1.5rem' }}>

                    {/* STEP 1 — Ticket Type */}
                    {step === 1 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)', letterSpacing: '0.15em', marginBottom: '0.25rem' }}>
                                {availableSeats} SEATS AVAILABLE
                            </div>
                            {slot.ticketTypes?.map((tt: any) => (
                                <div
                                    key={tt.id}
                                    onClick={() => setTicketType(tt)}
                                    style={{
                                        background: ticketType?.id === tt.id ? 'rgba(139,105,20,0.12)' : 'var(--ink)',
                                        border: `1px solid ${ticketType?.id === tt.id ? 'var(--sepia)' : 'var(--ash)'}`,
                                        borderLeft: `3px solid ${tt.type === 'VIP' ? 'var(--flicker)' : tt.type === 'Student' ? 'var(--fog)' : 'var(--sepia)'}`,
                                        padding: '1.1rem 1.25rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: '1rem',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    <div>
                                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: tt.type === 'VIP' ? 'var(--flicker)' : 'var(--parchment)', marginBottom: '0.2rem' }}>
                                            {tt.type}
                                        </div>
                                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--fog)', fontStyle: 'italic' }}>{tt.perks}</div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--flicker)' }}>${tt.price}</div>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.42rem', color: 'var(--fog)', letterSpacing: '0.08em' }}>+ $1.50 booking fee</div>
                                    </div>
                                </div>
                            ))}
                            <button className="btn btn-primary" disabled={!ticketType} onClick={() => setStep(2)} style={{ marginTop: '0.5rem', justifyContent: 'center', opacity: ticketType ? 1 : 0.4 }}>
                                Continue → Pick Your Seat
                            </button>
                        </div>
                    )}

                    {/* STEP 2 — Seat Picker */}
                    {step === 2 && (
                        <div>
                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--bone)', marginBottom: '1.25rem', fontStyle: 'italic' }}>
                                <strong style={{ color: ticketType?.type === 'VIP' ? 'var(--flicker)' : 'var(--parchment)' }}>{ticketType?.type}</strong> ticket at ${ticketType?.price}.
                                {ticketType?.type === 'VIP' ? ' Choose a seat in rows A or B.' : ticketType?.type === 'Student' ? ' Show your student ID at the door.' : ' Choose any available seat.'}
                            </div>
                            <SeatSelector slot={slot} seatLayout={venue.seatLayout} selectedSeat={selectedSeat} onSeatSelect={handleSeatSelect} />
                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                                <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
                                <button className="btn btn-primary" disabled={!selectedSeat} onClick={() => setStep(3)} style={{ flex: 1, justifyContent: 'center', opacity: selectedSeat ? 1 : 0.4 }}>
                                    Continue → Confirm
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 3 — Confirm */}
                    {step === 3 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ background: 'var(--ink)', border: '1px solid var(--ash)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.25rem' }}>ORDER SUMMARY</div>
                                {[
                                    ['Film', showtime.film],
                                    ['Date', showtime.date],
                                    ['Time', slot.time],
                                    ['Screen', showtime.screenName || 'Main Screen'],
                                    ['Format', slot.format],
                                    ['Seat', selectedSeat],
                                    ['Ticket Type', ticketType?.type],
                                    ['Venue', venue.name],
                                ].map(([label, val]) => (
                                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.45rem', borderBottom: '1px solid var(--ash)' }}>
                                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>{label.toUpperCase()}</span>
                                        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--bone)' }}>{val}</span>
                                    </div>
                                ))}
                                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.25rem' }}>
                                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)' }}>BOOKING FEE</span>
                                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--bone)' }}>${BOOKING_FEE.toFixed(2)}</span>
                                </div>
                                <div style={{ height: 1, background: 'var(--sepia)', margin: '0.3rem 0' }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--parchment)' }}>TOTAL</span>
                                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', color: 'var(--flicker)' }}>${((ticketType?.price || 0) + BOOKING_FEE).toFixed(2)}</span>
                                </div>
                            </div>
                            {!venue.paymentConnected && (
                                <div style={{ background: 'rgba(139,105,20,0.1)', border: '1px solid var(--sepia)', padding: '0.75rem 1rem', fontFamily: 'var(--font-body)', fontSize: '0.73rem', color: 'var(--bone)', fontStyle: 'italic' }}>
                                    Demo mode — no real payment is processed. Your seat will be reserved.
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button className="btn btn-ghost" onClick={() => setStep(2)}>← Back</button>
                                <button className="btn btn-primary" onClick={handlePurchase} style={{ flex: 1, justifyContent: 'center' }}>
                                    Confirm Purchase
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 4 — Success */}
                    {step === 4 && createdStub && (
                        <TicketStubGallery stub={createdStub} onClose={onClose} />
                    )}
                </div>
            </motion.div>
        </div>
    )
}
