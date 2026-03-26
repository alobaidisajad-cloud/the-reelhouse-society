/**
 * DebugPanel — Admin / QA testing page.
 * Shows live system state: badges, streaks, analytics, tier, profile data.
 * Only accessible at /admin — hidden from main navigation.
 */
import { Check, Circle, X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAuthStore, useFilmStore } from '../store'
import { useAchievements, BADGE_DEFS } from '../hooks/useAchievements'
import { useStreak } from '../hooks/useStreak'
import { supabase, isSupabaseConfigured } from '../supabaseClient'
import PageSEO from '../components/PageSEO'
import Buster from '../components/Buster'

export default function DebugPanel() {
    const { user, isAuthenticated } = useAuthStore()
    const { logs, watchlist, lists, stubs } = useFilmStore()
    const { badges } = useAchievements(user?.id, logs)
    const { currentStreak, longestStreak } = useStreak(logs)
    const [analyticsCount, setAnalyticsCount] = useState<number | null>(null)
    const [profileData, setProfileData] = useState<any>(null)
    const [buildInfo, setBuildInfo] = useState({ size: '303KB', date: new Date().toISOString().slice(0, 10) })

    // Fetch analytics count from Supabase
    useEffect(() => {
        if (!isSupabaseConfigured || !user?.id) return
        supabase.from('analytics_events').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
            .then(({ count }) => setAnalyticsCount(count || 0))
    }, [user?.id])

    // Fetch raw profile data
    useEffect(() => {
        if (!isSupabaseConfigured || !user?.id) return
        supabase.from('profiles').select('*').eq('id', user.id).single()
            .then(({ data }) => setProfileData(data))
    }, [user?.id])

    if (!isAuthenticated) {
        return (
            <div className="page-top" style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', padding: '3rem', border: '1px solid var(--ash)', background: 'var(--soot)', maxWidth: 400 }}>
                    <Buster mood="neutral" size={64} />
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--parchment)', margin: '1rem 0 0.5rem' }}>Restricted Access</div>
                    <p style={{ fontFamily: 'var(--font-body)', color: 'var(--fog)', fontSize: '0.85rem' }}>Sign in to access the debug panel.</p>
                </div>
            </div>
        )
    }

    const sectionStyle: React.CSSProperties = {
        background: 'var(--soot)', border: '1px solid var(--ash)', borderRadius: '4px',
        padding: '1.5rem', marginBottom: '1.5rem',
    }
    const titleStyle: React.CSSProperties = {
        fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em',
        color: 'var(--sepia)', marginBottom: '1rem', paddingBottom: '0.5rem',
        borderBottom: '1px solid var(--ash)',
    }
    const rowStyle: React.CSSProperties = {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
    }
    const labelStyle: React.CSSProperties = {
        fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--fog)',
    }
    const valueStyle: React.CSSProperties = {
        fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--parchment)',
    }

    const coreStats = [
        { label: 'USER ID', value: user?.id || '—' },
        { label: 'USERNAME', value: user?.username || '—' },
        { label: 'TIER', value: (profileData?.tier || 'free').toUpperCase() },
        { label: 'ROLE', value: user?.role || '—' },
        { label: 'MEMBER SINCE', value: profileData?.created_at ? new Date(profileData.created_at).toLocaleDateString() : '—' },
        { label: 'DISPLAY NAME', value: profileData?.display_name || '(not set)' },
        { label: 'SOCIAL VISIBILITY', value: profileData?.social_visibility || 'public' },
    ]

    const dataStats = [
        { label: 'FILM LOGS', value: logs.length },
        { label: 'WATCHLIST', value: watchlist.length },
        { label: 'LISTS', value: lists.length },
        { label: 'TICKET STUBS', value: stubs?.length || 0 },
        { label: 'CURRENT STREAK', value: `${currentStreak} day${currentStreak !== 1 ? 's' : ''} 🔥` },
        { label: 'LONGEST STREAK', value: `${longestStreak} day${longestStreak !== 1 ? 's' : ''}` },
        { label: 'FOLLOWERS', value: profileData?.followers_count || 0 },
        { label: 'FOLLOWING', value: profileData?.following_count || 0 },
        { label: 'ANALYTICS EVENTS', value: analyticsCount !== null ? analyticsCount : 'loading…' },
    ]

    return (
        <div className="page-top">
            <PageSEO title="Debug Panel" description="Internal QA & testing panel" />
            <div className="container" style={{ paddingTop: '6rem', paddingBottom: '4rem', maxWidth: 700 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                    <Buster mood="peeking" size={40} />
                    <div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)' }}>Projectionist's Console</div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>INTERNAL QA · DEBUG · DIAGNOSTICS</div>
                    </div>
                </div>

                {/* Profile & Identity */}
                <div style={sectionStyle}>
                    <div style={titleStyle}>① IDENTITY & ACCOUNT</div>
                    {coreStats.map(({ label, value }) => (
                        <div key={label} style={rowStyle}>
                            <span style={labelStyle}>{label}</span>
                            <span style={{ ...valueStyle, fontFamily: label === 'USER ID' ? 'monospace' : 'var(--font-body)', fontSize: label === 'USER ID' ? '0.6rem' : '0.8rem' }}>{value}</span>
                        </div>
                    ))}
                </div>

                {/* Data Stats */}
                <div style={sectionStyle}>
                    <div style={titleStyle}>② DATA & ACTIVITY</div>
                    {dataStats.map(({ label, value }) => (
                        <div key={label} style={rowStyle}>
                            <span style={labelStyle}>{label}</span>
                            <span style={valueStyle}>{String(value)}</span>
                        </div>
                    ))}
                </div>

                {/* Badges */}
                <div style={sectionStyle}>
                    <div style={titleStyle}>③ ACHIEVEMENT BADGES ({badges.length}/{BADGE_DEFS.length} UNLOCKED)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
                        {BADGE_DEFS.map(badge => {
                            const earned = badges.some(b => b.key === badge.key)
                            return (
                                <div key={badge.key} style={{
                                    padding: '0.75rem', borderRadius: '4px',
                                    border: `1px solid ${earned ? 'var(--sepia)' : 'var(--ash)'}`,
                                    background: earned ? 'rgba(139,105,20,0.08)' : 'transparent',
                                    opacity: earned ? 1 : 0.4,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                                        <span style={{ fontSize: '1rem', color: earned ? 'var(--flicker)' : 'var(--fog)' }}>{badge.glyph}</span>
                                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: earned ? 'var(--parchment)' : 'var(--fog)' }}>{badge.label}</span>
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--fog)' }}>{badge.description}</div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', color: earned ? 'var(--sepia)' : 'var(--ash)', marginTop: '0.3rem' }}>
                                        {earned ? <><Check size={12} style={{ display: "inline-block", verticalAlign: "middle" }} /> UNLOCKED</> : <><Circle size={10} style={{ display: "inline-block", verticalAlign: "middle" }} /> LOCKED</>}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Raw Profile JSON */}
                <div style={sectionStyle}>
                    <div style={titleStyle}>④ RAW PROFILE DATA</div>
                    <pre style={{
                        fontFamily: 'monospace', fontSize: '0.65rem', color: 'var(--bone)',
                        background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '4px',
                        overflow: 'auto', maxHeight: 300, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                    }}>
                        {profileData ? JSON.stringify(profileData, null, 2) : 'Loading…'}
                    </pre>
                </div>

                {/* Build Info */}
                <div style={sectionStyle}>
                    <div style={titleStyle}>⑤ BUILD & ENVIRONMENT</div>
                    {[
                        { label: 'BUNDLE SIZE', value: buildInfo.size },
                        { label: 'BUILD DATE', value: buildInfo.date },
                        { label: 'SUPABASE', value: isSupabaseConfigured ? <><Check size={12} style={{ display: "inline-block", verticalAlign: "middle" }} /> CONNECTED</> : <><X size={12} style={{ display: "inline-block", verticalAlign: "middle" }} /> NOT CONFIGURED</> },
                        { label: 'SERVICE WORKER', value: 'serviceWorker' in navigator ? <><Check size={12} style={{ display: "inline-block", verticalAlign: "middle" }} /> REGISTERED</> : <><X size={12} style={{ display: "inline-block", verticalAlign: "middle" }} /> UNAVAILABLE</> },
                        { label: 'SCREEN', value: `${window.innerWidth}×${window.innerHeight}` },
                        { label: 'TOUCH DEVICE', value: window.matchMedia('(any-pointer: coarse)').matches ? 'YES' : 'NO' },
                        { label: 'DO NOT TRACK', value: navigator.doNotTrack === '1' ? 'ENABLED' : 'DISABLED' },
                    ].map(({ label, value }) => (
                        <div key={label} style={rowStyle}>
                            <span style={labelStyle}>{label}</span>
                            <span style={valueStyle}>{value}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
