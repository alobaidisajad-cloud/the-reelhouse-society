import { useState } from 'react'
import { Shield, CreditCard } from 'lucide-react'
import toast from 'react-hot-toast'

interface RevenueBreakdownProps { pct: number; }

function RevenueBreakdown({ pct }: RevenueBreakdownProps) {
    const venueCut = 100 - pct
    return (
        <div style={{ background: 'var(--ink)', border: '1px solid var(--ash)', padding: '1.5rem' }}>
            <div className="section-title" style={{ marginBottom: '1.25rem' }}>REVENUE SPLIT PER TICKET SOLD</div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'stretch', marginBottom: '1rem' }}>
                <div style={{ flex: venueCut, background: 'rgba(139,105,20,0.15)', border: '2px solid var(--sepia)', padding: '1rem', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--flicker)' }}>{venueCut}%</div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.1em', marginTop: '0.25rem' }}>YOUR VENUE</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--bone)', marginTop: '0.4rem' }}>Goes directly to your account</div>
                </div>
                <div style={{ flex: pct, background: 'var(--soot)', border: '1px solid var(--ash)', padding: '1rem', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--parchment)' }}>{pct}%</div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.1em', marginTop: '0.25rem' }}>REELHOUSE</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--fog)', marginTop: '0.4rem' }}>Platform fee</div>
                </div>
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--fog)', fontStyle: 'italic', lineHeight: 1.7 }}>
                On a $20 ticket: you receive <strong style={{ color: 'var(--flicker)' }}>${(20 * (venueCut / 100)).toFixed(2)}</strong>,
                The ReelHouse Society receives <strong style={{ color: 'var(--parchment)' }}>${(20 * (pct / 100)).toFixed(2)}</strong> + the $1.50 booking fee.
                Payouts are processed every Monday.
            </div>
        </div>
    )
}

import { Venue } from '../../types'

interface PaymentTabProps {
    venue: Venue;
    onConnect: (info: { paymentAccountName: string; paymentLast4: string; paymentBrand: string }) => void;
}

export default function PaymentTab({ venue, onConnect }: PaymentTabProps) {
    const [form, setForm] = useState({ accountName: '', accountNumber: '', routingNumber: '', brand: 'visa' })
    const [submitted, setSubmitted] = useState(false)
    const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

    const handleConnect = (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.accountName || !form.accountNumber || !form.routingNumber) { toast.error('All fields required'); return }
        onConnect({ paymentAccountName: form.accountName, paymentLast4: form.accountNumber.slice(-4), paymentBrand: form.brand })
        toast.success('Payment account connected')
        setSubmitted(true)
    }

    if (venue.paymentConnected) {
        return (
            <div style={{ maxWidth: 560 }}>
                <div style={{ background: 'rgba(27,94,46,0.12)', border: '1px solid #27913f', padding: '1.5rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Shield size={24} color="#27913f" />
                    <div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--parchment)' }}>Account Connected</div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)', letterSpacing: '0.1em', marginTop: 2 }}>
                            {venue.paymentAccountName} · ending ····{venue.paymentLast4}
                        </div>
                    </div>
                </div>
                <RevenueBreakdown pct={venue.platformFeePercent} />
            </div>
        )
    }

    return (
        <div style={{ maxWidth: 560 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', color: 'var(--parchment)', marginBottom: '0.5rem' }}>Connect Your Account</div>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--fog)', lineHeight: 1.7, marginBottom: '2rem' }}>
                Enter your bank details to start receiving ticket revenue. The ReelHouse Society processes every transaction and deposits your cut directly to your account within 2 business days.
            </p>
            <RevenueBreakdown pct={venue.platformFeePercent} />
            <form onSubmit={handleConnect} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
                <div>
                    <div className="section-title-sm" style={{ color: 'var(--sepia)', marginBottom: '0.4rem' }}>ACCOUNT HOLDER NAME</div>
                    <input className="input" placeholder="Full legal name" value={form.accountName} onChange={e => set('accountName', e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                        <div className="section-title-sm" style={{ color: 'var(--sepia)', marginBottom: '0.4rem' }}>ROUTING NUMBER</div>
                        <input className="input" placeholder="9-digit routing number" maxLength={9} value={form.routingNumber} onChange={e => set('routingNumber', e.target.value.replace(/\D/g, ''))} />
                    </div>
                    <div>
                        <div className="section-title-sm" style={{ color: 'var(--sepia)', marginBottom: '0.4rem' }}>ACCOUNT NUMBER</div>
                        <input className="input" placeholder="Account number" value={form.accountNumber} onChange={e => set('accountNumber', e.target.value.replace(/\D/g, ''))} />
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'var(--ink)', border: '1px solid var(--ash)' }}>
                    <Shield size={14} color="var(--sepia)" />
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--fog)', fontStyle: 'italic' }}>
                        Demo mode — no real banking data is stored or transmitted.
                    </span>
                </div>
                <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center', marginTop: '0.25rem' }}>
                    <CreditCard size={14} /> Connect Account
                </button>
            </form>
        </div>
    )
}
