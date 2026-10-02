import { motion } from 'framer-motion'
import { X, Share2 } from 'lucide-react'
import Buster from '../Buster'
import { RadarChart } from '../UI'
import { stampsOf, type ProfileAnalytics } from '../../constants/honours'
import { standingFor } from '../../constants/standing'
import { dnaOf, DNA_FLOOR } from './dna'

/**
 * Cinema DNA Card — a shareable image of a member's cinematic identity, read
 * from their whole record (get_public_profile_analytics), as the app's card is:
 * the house's one ladder for the name, the measured obscurity index or "—".
 * Designed as a 9:16 Instagram Story-sized overlay. The profile offers it from
 * five films (DNA_FLOOR); below that, or unread, it is not drawn.
 */
export function CinemaDNACard({ analytics, user, onClose }: { analytics?: ProfileAnalytics | null; user: { username?: string } | null; onClose: () => void }) {
    const total = stampsOf(analytics)?.total_logs ?? 0
    if (total < DNA_FLOOR) return null

    const dna = dnaOf(analytics)
    const archetype = standingFor(total).level

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
                position: 'fixed', inset: 0, zIndex: 100005, background: 'rgba(10, 7, 3, 0.95)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '2rem',
            }}
        >
            <button onClick={onClose} className="btn btn-ghost" style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', zIndex: 100006 }}>
                {<X size={12} style={{ display: "inline-block", verticalAlign: "middle" }} />} CLOSE
            </button>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--fog)', letterSpacing: '0.1em', marginBottom: '1.5rem', textAlign: 'center' }}>
                SCREENSHOT TO SHARE YOUR CINEMA DNA
            </div>

            {/* The Share Card */}
            <div id="cinema-dna-card" style={{
                width: '100%', maxWidth: '360px', aspectRatio: '9/16',
                background: 'linear-gradient(180deg, #0a0703 0%, #120e08 40%, #0d0a06 100%)',
                position: 'relative', overflow: 'hidden',
                border: '1px solid var(--sepia)', boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
                display: 'flex', flexDirection: 'column',
            }}>
                {/* Background texture */}
                <div style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none',
                    backgroundImage: 'repeating-linear-gradient(90deg, rgba(139,105,20,0.04) 0px, transparent 1px, transparent 30px)',
                    opacity: 0.5,
                }} />
                {/* Radial glow */}
                <div style={{
                    position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)',
                    width: 400, height: 400, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(139,105,20,0.12) 0%, transparent 70%)',
                    pointerEvents: 'none',
                }} />

                <div style={{ position: 'relative', zIndex: 1, padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem' }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: '50%', background: 'var(--ash)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--sepia)',
                        }}>
                            <Buster size={24} mood="smiling" />
                        </div>
                        <div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.15em', color: 'var(--parchment)' }}>
                                @{user?.username || 'cinephile'}
                            </div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', color: 'var(--sepia)', marginTop: '0.15rem' }}>
                                THE REELHOUSE SOCIETY
                            </div>
                        </div>
                    </div>

                    {/* Title */}
                    <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.4em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>
                            CINEMATIC FINGERPRINT ANALYSIS
                        </div>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--parchment)', lineHeight: 1.1, margin: 0, letterSpacing: '0.02em' }}>
                            CINEMA DNA
                        </h2>
                    </div>

                    {/* Archetype Badge */}
                    <div style={{
                        textAlign: 'center', padding: '0.6rem 1rem', marginBottom: '1rem',
                        background: 'rgba(139,105,20,0.1)', border: '1px solid rgba(139,105,20,0.3)',
                        borderRadius: '2px',
                    }}>
                        <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--parchment)', fontWeight: 'bold' }}>
                            {archetype}
                        </div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginTop: '0.2rem' }}>
                            SCHOOL OF {dna.tones.toUpperCase()}
                        </div>
                    </div>

                    {/* Radar Chart (if available) */}
                    {dna.autopsy && (
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem', filter: 'drop-shadow(0 0 10px rgba(139,105,20,0.2))' }}>
                            <RadarChart autopsy={dna.autopsy} size={120} />
                        </div>
                    )}

                    {/* Stats Grid */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem',
                        marginBottom: '1rem',
                    }}>
                        {[
                            { label: 'FILMS', value: total },
                            { label: 'AVG RATING', value: dna.avgRating },
                        ].map(({ label, value }) => (
                            <div key={label} style={{ textAlign: 'center', padding: '0.5rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '2px' }}>
                                <div style={{ fontFamily: 'var(--font-display-alt)', fontSize: '1.3rem', color: 'var(--parchment)', lineHeight: 1 }}>{value}</div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.4rem', letterSpacing: '0.15em', color: 'var(--fog)', marginTop: '0.3rem' }}>{label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Top Decades */}
                    <div style={{ marginBottom: 'auto' }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>DOMINANT ERAS</div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {dna.topDecades.map(([decade, count]) => {
                                const pct = Math.round((count / total) * 100)
                                return (
                                    <div key={decade} style={{
                                        flex: 1, padding: '0.4rem 0.5rem', background: 'rgba(139,105,20,0.06)',
                                        border: '1px solid rgba(139,105,20,0.15)', borderRadius: '2px',
                                    }}>
                                        <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.75rem', color: 'var(--parchment)' }}>{decade}</div>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--sepia)' }}>{pct}%</div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Obscurity Index */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.5rem 0', borderTop: '1px solid rgba(139,105,20,0.15)', marginBottom: '0.75rem',
                    }}>
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>OBSCURITY INDEX</span>
                        <span style={{ fontFamily: 'var(--font-display-alt)', fontSize: '1.4rem', color: 'var(--sepia)' }}>{dna.obscurity}</span>
                    </div>

                    {/* Footer Branding */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                        borderTop: '1px solid var(--ash)', paddingTop: '1rem',
                    }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--sepia)', opacity: 0.9 }}>
                            REELHOUSE
                        </div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.4rem', color: 'var(--fog)', letterSpacing: '0.1em', textAlign: 'right' }}>
                            CINEMATIC FINGERPRINT<br />ANALYSIS №{String(total).padStart(4, '0')}
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}
