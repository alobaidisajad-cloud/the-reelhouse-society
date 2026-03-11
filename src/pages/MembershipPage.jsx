import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Crown, Star, Key, EyeOff, LayoutTemplate, Database, Upload } from 'lucide-react'
import { useAuthStore, useUIStore } from '../store'
import Buster from '../components/Buster'
import LetterboxdImport from '../components/LetterboxdImport'
import toast from 'react-hot-toast'

const features = [
    { icon: Key, title: 'The Vault', description: 'Unlock the "Cutting Room Floor" for private notes and thoughts.' },
    { icon: LayoutTemplate, title: 'Poster Glow', description: 'Immersive glowing posters on your profile for ultimate aesthetics.' },
    { icon: EyeOff, title: 'Ad-Free Theatre', description: 'The purist experience. No distractions, just cinema.' },
    { icon: Crown, title: 'Auteur Status', description: 'Exclusive gold foil badge across the platform.' },
    { icon: Database, title: 'Archival Export', description: 'Full CSV export of your entire cinematic history.' },
    { icon: Star, title: 'Profile Heatmap', description: 'The Projectionist\'s Calendar for tracking your viewing habits over 365 days.' }
]

export default function MembershipPage() {
    const { isAuthenticated, user } = useAuthStore()
    const { openSignupModal } = useUIStore()
    const [letterboxdOpen, setLetterboxdOpen] = useState(false)

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    }

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { type: 'spring', damping: 20 } }
    }

    const [isRedirecting, setIsRedirecting] = useState(false)

    const handleAscend = async (tier) => {
        if (!isAuthenticated) return openSignupModal(tier)
        if (user?.role === tier || (tier === 'archivist' && user?.role === 'auteur')) return

        try {
            setIsRedirecting(true)
            toast.loading('Preparing your Patronage ledger...', { id: 'checkout' })

            const backendUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paytabs-handler/create`

            const response = await fetch(backendUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user.id, tier })
            })

            const data = await response.json()

            if (data.redirect_url) {
                toast.dismiss('checkout')
                window.location.href = data.redirect_url
            } else {
                toast.error('Could not initialize checkout. Please try again.', { id: 'checkout' })
                setIsRedirecting(false)
            }
        } catch (error) {
            console.error(error)
            toast.error('Network error reaching secure checkout.', { id: 'checkout' })
            setIsRedirecting(false)
        }
    }

    return (
        <div style={{ minHeight: '100vh', paddingTop: '80px', paddingBottom: '4rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="container" style={{ maxWidth: 1000 }}>
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    style={{ textAlign: 'center', marginBottom: '4rem' }}
                >
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                        <Buster size={80} mood="smiling" />
                    </div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8rem', letterSpacing: '0.3em', color: 'var(--sepia)', marginBottom: '1rem' }}>
                        ELEVATE YOUR DEVOTION
                    </div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.5rem, 5vw, 4.5rem)', color: 'var(--parchment)', lineHeight: 1.1 }}>
                        The ReelHouse Society
                    </h1>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '1.1rem', color: 'var(--bone)', marginTop: '1.5rem', maxWidth: 600, marginInline: 'auto', lineHeight: 1.6 }}>
                        Ascend the ranks of The Society. Embrace the aesthetic. Wield the ultimate cinematic toolkit.
                    </p>

                    {/* Letterboxd Import CTA for logged-in users (more visible here) */}
                    {isAuthenticated && (
                        <button
                            onClick={() => setLetterboxdOpen(true)}
                            className="btn btn-ghost"
                            style={{ marginTop: '1.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.65rem', letterSpacing: '0.15em' }}
                        >
                            <Upload size={13} /> MIGRATE FROM LETTERBOXD
                        </button>
                    )}
                </motion.div>

                {/* Tiers Grid */}
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', marginBottom: '4rem', marginTop: '1.5rem' }}
                >
                    {/* The Free Tier */}
                    <motion.div variants={itemVariants} className="card card-tier" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', background: 'rgba(18,14,9,0.95)', border: 'none' }}>
                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--parchment)', marginBottom: '0.5rem' }}>The<br/>Cinephile</h3>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.15em', color: 'var(--fog)', marginBottom: '2rem', opacity: 0.7 }}>BASIC ACCESS</div>

                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.2rem', marginBottom: '2rem' }}>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', color: 'var(--bone)' }}>Free</span>
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>FOREVER</span>
                        </div>

                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2.5rem' }}>
                            {['Log & Rate Films', 'The Diary & Watchlist', 'Basic Profile', 'Unlimited Custom Lists'].map((feature, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ width: 4, height: 4, background: 'var(--fog)', borderRadius: '50%' }} />
                                    <span style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--bone)', opacity: 0.9 }}>{feature}</span>
                                </div>
                            ))}
                        </div>

                        {isAuthenticated ? (
                            <div style={{ textAlign: 'center', fontFamily: 'var(--font-ui)', fontSize: '0.8rem', color: 'var(--fog)', padding: '1rem', border: '1px solid var(--ash)', borderRadius: 'var(--radius-card)' }}>YOUR CURRENT TIER</div>
                        ) : (
                            <button className="btn btn-ghost" style={{ width: '100%', justifyContet: 'center', padding: '1rem', fontSize: '0.8rem', letterSpacing: '0.2em' }} onClick={() => openSignupModal('cinephile')}>
                                JOIN FREE
                            </button>
                        )}
                    </motion.div>

                    {/* The Pro Tier */}
                    <motion.div variants={itemVariants} className="card card-tier" style={{ padding: '3.5rem 2.5rem 2.5rem', display: 'flex', flexDirection: 'column', border: '1px solid var(--sepia)', background: 'rgba(18,14,9,0.95)', position: 'relative', borderRadius: 'var(--radius-card)' }}>
                        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--sepia)', color: 'var(--ink)', padding: '0.4rem 1.2rem', fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em', borderRadius: '100px', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
                            MOST POPULAR
                        </div>

                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--parchment)', marginBottom: '0.5rem', lineHeight: 1.1 }}>The<br/>Archivist</h3>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '2rem' }}>PREMIUM TOOLS</div>

                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.2rem', marginBottom: '0.5rem' }}>
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '1.5rem', color: 'var(--parchment)' }}>$</span>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '4.5rem', color: 'var(--parchment)', lineHeight: 1 }}>1.99</span>
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>/ MO</span>
                        </div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--fog)', marginBottom: '2rem', letterSpacing: '0.1em', opacity: 0.7 }}>BILLED ANNUALLY ($19.99/YR)</div>

                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '2.5rem' }}>
                            <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: 'var(--sepia)', fontStyle: 'italic', marginBottom: '0.5rem' }}>Everything in Free, plus:</div>
                            
                            <div style={{ padding: '1rem', background: 'rgba(25,20,13,0.95)', border: '1px solid rgba(139,105,20,0.15)', borderRadius: 'var(--radius-card)', marginBottom: '0.5rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                <div style={{ width: 4, height: 4, background: 'var(--parchment)', borderRadius: '50%', marginTop: '0.5rem', flexShrink: 0 }} />
                                <div>
                                    <div style={{ fontFamily: 'var(--font-sub)', fontSize: '1.05rem', color: 'var(--parchment)', marginBottom: '0.4rem', fontWeight: 'bold' }}>The Editorial<br/>Desk</div>
                                    <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.85rem', color: 'var(--bone)', lineHeight: 1.5, opacity: 0.9 }}>Pro-level review formatting. Inject movie stills, pull-quotes, and drop caps into your logs.</div>
                                </div>
                            </div>
                            
                            {[
                                'The Physical Archive\n(Track 4K/Blu-Ray/VHS)', 
                                'The Vault (Private Notes)', 
                                'The Splicer (Edit Logs)', 
                                'Archival Record (.CSV\nExport)', 
                                'The Projectionist\'s\nCalendar'
                            ].map((feature, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                                    <div style={{ width: 4, height: 4, background: 'var(--bone)', borderRadius: '50%', marginTop: '0.4rem', flexShrink: 0 }} />
                                    <span style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--bone)', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{feature}</span>
                                </div>
                            ))}
                        </div>

                        <button
                            className="btn btn-primary"
                            style={{ width: '100%', justifyContent: 'center', padding: '1rem', fontSize: '0.85rem', letterSpacing: '0.15em', opacity: isRedirecting ? 0.7 : 1 }}
                            disabled={isRedirecting}
                            onClick={() => handleAscend('archivist')}
                        >
                            {isRedirecting ? 'INITIALIZING...' : isAuthenticated ? (user?.role === 'archivist' || user?.role === 'auteur' ? 'CURRENT RANK' : 'ASCEND TO ARCHIVIST') : 'CLAIM ARCHIVIST\nSTATUS'}
                        </button>
                    </motion.div>

                    {/* The Patron Tier */}
                    <motion.div variants={itemVariants} className="card card-tier" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', border: '1px solid #7d1f1f', background: 'rgba(18,14,9,0.95)', borderRadius: 'var(--radius-card)' }}>
                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: '#7d1f1f', marginBottom: '0.5rem' }}>The Auteur</h3>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.15em', color: '#7d1f1f', marginBottom: '2rem' }}>ULTIMATE PATRONAGE</div>

                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.2rem', marginBottom: '0.5rem' }}>
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '1.5rem', color: 'var(--parchment)' }}>$</span>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '4.5rem', color: 'var(--parchment)', lineHeight: 1 }}>4.99</span>
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>/ MO</span>
                        </div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--fog)', marginBottom: '2rem', letterSpacing: '0.1em', opacity: 0.7 }}>BILLED ANNUALLY ($49.99/YR)</div>

                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '2.5rem' }}>
                            <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: '#7d1f1f', fontStyle: 'italic', marginBottom: '0.5rem' }}>Everything in Archivist, plus:</div>
                            
                            <div style={{ padding: '1rem', background: 'rgba(25,20,13,0.95)', border: '1px solid rgba(125,31,31,0.2)', borderRadius: 'var(--radius-card)', marginBottom: '0.5rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                <div style={{ width: 4, height: 4, background: '#7d1f1f', borderRadius: '50%', marginTop: '0.5rem', flexShrink: 0 }} />
                                <div>
                                    <div style={{ fontFamily: 'var(--font-sub)', fontSize: '1.05rem', color: '#7d1f1f', marginBottom: '0.4rem', fontWeight: 'bold' }}>The Breakdown<br/>Engine</div>
                                    <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.85rem', color: 'var(--bone)', lineHeight: 1.5, opacity: 0.9 }}>Break down films across 5 specific axes. Attach gorgeous, dynamic radar charts to your reviews.</div>
                                </div>
                            </div>

                            {[
                                'Publish Essays to The\nDispatch', 
                                'Curatorial Control\n(Select Alternative TMDB\nPosters)', 
                                'Poster Glow Profile\nAesthetics', 
                                'Gold Foil "Auteur" Badge', 
                                'Early Access to New\nFeatures'
                            ].map((feature, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                                    <div style={{ width: 8, height: 8, marginTop: '0.3rem', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#7d1f1f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                                    </div>
                                    <span style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--bone)', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{feature}</span>
                                </div>
                            ))}
                        </div>

                        <button
                            className="btn btn-primary"
                            style={{ width: '100%', justifyContent: 'center', padding: '1rem', background: '#7d1f1f', color: 'var(--parchment)', border: 'none', fontSize: '0.85rem', letterSpacing: '0.15em', opacity: isRedirecting ? 0.7 : 1 }}
                            disabled={isRedirecting}
                            onClick={() => handleAscend('auteur')}
                        >
                            {isRedirecting ? 'INITIALIZING...' : isAuthenticated ? (user?.role === 'auteur' ? 'CURRENT RANK' : 'ASCEND TO AUTEUR') : 'BECOME A PATRON'}
                        </button>
                    </motion.div>
                </motion.div>

                {/* â”€â”€ FOUNDING MEMBERS BANNER â”€â”€ */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7 }}
                    style={{
                        position: 'relative', overflow: 'hidden',
                        border: '1px solid rgba(139,105,20,0.4)',
                        borderRadius: 'var(--radius-card)',
                        padding: '3rem',
                        marginBottom: '6rem',
                        background: 'linear-gradient(135deg, rgba(139,105,20,0.08) 0%, rgba(10,7,3,0) 60%)',
                        textAlign: 'center',
                    }}
                >
                    {/* Background texture */}
                    <div style={{
                        position: 'absolute', inset: 0, pointerEvents: 'none',
                        backgroundImage: 'repeating-linear-gradient(90deg, rgba(139,105,20,0.03) 0px, transparent 1px, transparent 40px)',
                    }} />

                    {/* Wax seal badge */}
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 64, height: 64, borderRadius: '50%',
                        border: '2px solid var(--sepia)',
                        background: 'rgba(139,105,20,0.12)',
                        marginBottom: '1.5rem',
                        fontSize: '1.8rem',
                    }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                    </div>

                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.4em', color: 'var(--sepia)', marginBottom: '1rem' }}>
                        LIMITED OFFER Â· CLASS OF 1924
                    </div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 4vw, 3rem)', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '1rem' }}>
                        Founding Members
                    </h2>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '1rem', color: 'var(--bone)', maxWidth: 560, marginInline: 'auto', lineHeight: 1.7, marginBottom: '2rem' }}>
                        The first 100 members to join The Society receive <em>Archivist access for life</em> â€” permanently, with no recurring charges, ever. A single entry in the ledger. A permanent seat in the house.
                    </p>

                    {/* Price display */}
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '0.3rem', marginBottom: '0.5rem' }}>
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '1.2rem', color: 'var(--sepia)' }}>$</span>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '3.5rem', color: 'var(--flicker)', lineHeight: 1 }}>49</span>
                        <div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>ONE TIME</div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--sepia)', letterSpacing: '0.1em' }}>NO RENEWALS</div>
                        </div>
                    </div>

                    <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: 'var(--fog)', marginBottom: '2.5rem', fontStyle: 'italic' }}>
                        Compare to $19.99/yr recurring â€” this pays for itself in under 3 years and never charges again.
                    </div>

                    <button
                        className="btn btn-primary"
                        style={{ padding: '1rem 3rem', fontSize: '0.8rem', letterSpacing: '0.25em' }}
                        onClick={() => isAuthenticated ? handleAscend('archivist') : openSignupModal('archivist')}
                    >
                        CLAIM A FOUNDING SEAT
                    </button>

                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--fog)', marginTop: '1rem', opacity: 0.6 }}>
                        POWERED BY PAYTAB Â· SECURE CHECKOUT Â· SEATS FILLING FAST
                    </div>
                </motion.div>

                {/* Philosophy */}
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    style={{ textAlign: 'center', borderTop: '1px dashed var(--ash)', paddingTop: '4rem', maxWidth: 800, marginInline: 'auto' }}
                >
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.3em', color: 'var(--sepia)', marginBottom: '1.5rem' }}>
                        OUR PHILOSOPHY
                    </div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', color: 'var(--parchment)', marginBottom: '1.5rem' }}>
                        Built for the Love of Cinema.
                    </h2>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '1.1rem', color: 'var(--bone)', lineHeight: 1.8, marginBottom: '2rem', fontStyle: 'italic' }}>
                        We believe that software should feel like a physical artifactâ€”a curated, brutalist space free from corporate bloat. By ascending within The Society, you preserve this aesthetic and command the most premium cinematic ledger ever forged.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                        <div style={{ width: '40px', height: '1px', background: 'var(--flicker)', alignSelf: 'center' }} />
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--flicker)' }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                        <div style={{ width: '40px', height: '1px', background: 'var(--flicker)', alignSelf: 'center' }} />
                    </div>
                </motion.div>
            </div>

            {/* Letterboxd Import modal */}
            {letterboxdOpen && <LetterboxdImport onClose={() => setLetterboxdOpen(false)} />}
        </div>
    )
}
