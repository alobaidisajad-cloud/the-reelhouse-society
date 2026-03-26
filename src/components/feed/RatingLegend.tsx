import { X } from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '../../store'

export default function RatingLegend() {
    const [visible, setVisible] = useState(() => {
        // Check Supabase preference first, fall back to legacy localStorage
        const prefs = useAuthStore.getState().user?.preferences
        if (prefs?.legend_dismissed) return false
        try { return !localStorage.getItem('reel-legend-v1') } catch { return true }
    })
    if (!visible) return null
    const dismiss = () => {
        useAuthStore.getState().setPreference('legend_dismissed', true)
        try { localStorage.setItem('reel-legend-v1', '1') } catch {}
        setVisible(false)
    }
    const scale = [
        { reels: 1, label: 'DREADFUL' },
        { reels: 2, label: 'FORGETTABLE' },
        { reels: 3, label: 'WATCHABLE' },
        { reels: 4, label: 'BRILLIANT' },
        { reels: 5, label: 'CANON' },
    ]
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
            fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.14em',
            color: 'var(--fog)',
            border: '1px dashed rgba(139,105,20,0.25)',
            borderRadius: '2px',
            padding: '0.6rem 0.9rem',
            marginBottom: '1.5rem',
            background: 'rgba(10,7,3,0.5)',
        }}>
            <span style={{ color: 'var(--sepia)', whiteSpace: 'nowrap', opacity: 0.8 }}>REEL GUIDE —</span>
            {scale.map((s, i) => (
                <span key={s.reels} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--sepia)', letterSpacing: '0.05em' }}>{'\u2726'.repeat(s.reels)}</span>
                    <span style={{ color: 'var(--bone)' }}>{s.label}</span>
                    {i < 4 && <span style={{ color: 'var(--ash)', margin: '0 0.15rem' }}>·</span>}
                </span>
            ))}
            <button
                onClick={dismiss}
                style={{
                    marginLeft: 'auto', background: 'none', border: 'none',
                    color: 'var(--fog)', cursor: 'pointer', padding: '0 0.2rem',
                    fontFamily: 'var(--font-ui)', fontSize: '0.6rem', opacity: 0.5,
                    transition: 'opacity 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
                title="Got it"
                aria-label="Dismiss rating guide"
            ><X size={12} style={{ display: "inline-block", verticalAlign: "middle" }} /></button>
        </div>
    )
}
