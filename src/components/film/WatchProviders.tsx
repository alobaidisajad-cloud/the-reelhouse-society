/**
 * WatchProviders — Streaming/rent/buy provider logos from TMDB/JustWatch data.
 */
import { useState } from 'react'
import { Tv } from 'lucide-react'

export default function WatchProviders({ providers }: any) {
    const countryData = providers ? (providers['US'] || providers[Object.keys(providers)[0]]) : null
    const flatrate = countryData?.flatrate || []
    const rent = countryData?.rent || []
    const buy = countryData?.buy || []
    const hasAny = flatrate.length > 0 || rent.length > 0 || buy.length > 0
    const link = countryData?.link

    const ProviderLogo = ({ p, link }: any) => (
        <a href={link} target="_blank" rel="noopener noreferrer" title={`Watch on ${p.provider_name}`} style={{ flexShrink: 0, textDecoration: 'none', transition: 'transform 0.2s', display: 'block', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
            {p.logo_path ? (
                <img src={`https://image.tmdb.org/t/p/original${p.logo_path}`} alt={p.provider_name} style={{ width: 38, height: 38, borderRadius: '8px', objectFit: 'cover', border: '1px solid rgba(139,105,20,0.3)', display: 'block', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }} />
            ) : (
                <div style={{ width: 38, height: 38, borderRadius: '8px', background: 'var(--ash)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.45rem', color: 'var(--fog)', textAlign: 'center', padding: '2px', border: '1px solid rgba(139,105,20,0.3)', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
                    {p.provider_name}
                </div>
            )}
        </a>
    )

    return (
        <div className="card glass-panel">
            <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Tv size={12} /> WHERE TO WATCH
            </div>
            {!hasAny ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', borderRadius: 'var(--radius-card)', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.05)' }}>
                    <Tv size={24} color="var(--fog)" style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--parchment)', marginBottom: '0.4rem' }}>Not Currently Streaming</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--fog)', lineHeight: 1.4, maxWidth: 300, margin: '0 auto' }}>This film isn't available on any streaming platform right now.</div>
                </div>
            ) : (
                <>
                    {flatrate.length > 0 && (
                        <div style={{ marginBottom: '1rem' }}>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.12em', color: 'var(--fog)', marginBottom: '0.6rem' }}>STREAM FREE</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>{flatrate.slice(0, 6).map((p: any) => <ProviderLogo key={p.provider_id} p={p} link={link} />)}</div>
                        </div>
                    )}
                    {rent.length > 0 && (
                        <div style={{ marginBottom: '1rem' }}>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.12em', color: 'var(--fog)', marginBottom: '0.6rem' }}>RENT</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>{rent.slice(0, 6).map((p: any) => <ProviderLogo key={p.provider_id} p={p} link={link} />)}</div>
                        </div>
                    )}
                    {buy.length > 0 && (
                        <div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.12em', color: 'var(--fog)', marginBottom: '0.6rem' }}>BUY</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>{buy.slice(0, 4).map((p: any) => <ProviderLogo key={p.provider_id} p={p} link={link} />)}</div>
                        </div>
                    )}
                    <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.05)', fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--fog)', letterSpacing: '0.08em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>DATA BY JUSTWATCH</span>
                        {link && <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sepia)', textDecoration: 'none' }}>VIEW ALL OPTIONS →</a>}
                    </div>
                </>
            )}
        </div>
    )
}
