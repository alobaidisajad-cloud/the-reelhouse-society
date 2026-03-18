import { memo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../supabaseClient'
import { SectionHeader } from '../UI'

const VenueSpotlight = memo(function VenueSpotlight() {
    const { data: featuredVenues = [], isLoading } = useQuery({
        queryKey: ['featured-venues-home'],
        queryFn: async () => {
            const { data } = await supabase
                .from('venues')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(3)
            return (data || []).map(v => ({ ...v, verified: v.is_verified }))
        },
        staleTime: 1000 * 60 * 10,
    })

    // Hide the entire section when no venues are registered yet
    if (isLoading || featuredVenues.length === 0) return null

    return (
        <section>
            <SectionHeader label="FEATURED VENUES" title="The Palaces" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {featuredVenues.map((v) => (
                    <Link key={v.id} to={`/venue/${v.id}`} style={{ textDecoration: 'none' }}>
                        <motion.div
                            className="card"
                            style={{ borderTop: '2px solid var(--sepia)' }}
                        >
                            <div style={{
                                fontFamily: 'var(--font-display)',
                                fontSize: '1.1rem',
                                color: 'var(--parchment)',
                                marginBottom: '0.4rem',
                                lineHeight: 1.2,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                flexWrap: 'wrap',
                            }}>
                                {v.name}
                                {v.verified && (
                                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--flicker)', letterSpacing: '0.1em', background: 'rgba(242,232,160,0.08)', padding: '0.15em 0.4em', border: '1px solid rgba(242,232,160,0.2)' }}>✦ VERIFIED</span>
                                )}
                            </div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--fog)', marginBottom: '0.75rem' }}>
                                ◈ {v.location || 'Location TBC'}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.75rem' }}>
                                {(v.vibes || []).slice(0, 3).map((vibe) => (
                                    <span key={vibe} className="tag tag-vibe" style={{ fontSize: '0.55rem' }}>⟡ {vibe}</span>
                                ))}
                            </div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--sepia)' }}>
                                VIEW VENUE →
                            </div>
                        </motion.div>
                    </Link>
                ))}
            </div>
        </section>
    )
})

export default VenueSpotlight
