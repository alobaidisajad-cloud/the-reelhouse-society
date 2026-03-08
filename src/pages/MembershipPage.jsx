import React from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Crown, Star, Key, EyeOff, LayoutTemplate, Database } from 'lucide-react'
import { useAuthStore, useUIStore } from '../store'
import Buster from '../components/Buster'

const features = [
    { icon: Key, title: 'The Vault', description: 'Unlock the "Cutting Room Floor" for private notes and thoughts.' },
    { icon: LayoutTemplate, title: 'Celluloid Bleed', description: 'Immersive glowing posters on your profile for ultimate aesthetics.' },
    { icon: EyeOff, title: 'Ad-Free Theatre', description: 'The purist experience. No distractions, just cinema.' },
    { icon: Crown, title: 'Auteur Status', description: 'Exclusive gold foil badge across the platform.' },
    { icon: Database, title: 'Archival Export', description: 'Full CSV export of your entire cinematic history.' },
    { icon: Star, title: 'Profile Heatmap', description: 'The Projectionist\'s Calendar for tracking your viewing habits over 365 days.' }
]

export default function MembershipPage() {
    const { isAuthenticated, user } = useAuthStore()
    const { openSignupModal } = useUIStore()

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
                </motion.div>

                {/* Tiers Grid */}
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', marginBottom: '4rem' }}
                >
                    {/* The Free Tier */}
                    <motion.div variants={itemVariants} className="card" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--parchment)', marginBottom: '0.5rem' }}>The Cinephile</h3>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.15em', color: 'var(--fog)', marginBottom: '2rem' }}>BASIC ACCESS</div>

                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.2rem', marginBottom: '2rem' }}>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', color: 'var(--bone)' }}>Free</span>
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8rem', color: 'var(--fog)' }}>forever</span>
                        </div>

                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2.5rem' }}>
                            {['Log & Rate Films', 'The Diary & Watchlist', 'Basic Profile', 'Unlimited Custom Lists'].map((feature, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ width: 6, height: 6, background: 'var(--ash)', borderRadius: '50%' }} />
                                    <span style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--bone)' }}>{feature}</span>
                                </div>
                            ))}
                        </div>

                        {isAuthenticated ? (
                            <div style={{ textAlign: 'center', fontFamily: 'var(--font-ui)', fontSize: '0.8rem', color: 'var(--fog)', padding: '1rem', border: '1px solid var(--ash)', borderRadius: 'var(--radius-card)' }}>YOUR CURRENT TIER</div>
                        ) : (
                            <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => openSignupModal('cinephile')}>
                                Join Free
                            </button>
                        )}
                    </motion.div>

                    {/* The Pro Tier */}
                    <motion.div variants={itemVariants} className="card" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', border: '2px solid rgba(139,105,20,0.5)', background: 'linear-gradient(180deg, rgba(139,105,20,0.08) 0%, transparent 100%)', position: 'relative' }}>
                        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--sepia)', color: 'var(--ink)', padding: '0.3rem 1rem', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', borderRadius: '100px', fontWeight: 'bold' }}>
                            MOST POPULAR
                        </div>

                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--flicker)', marginBottom: '0.5rem' }}>The Archivist</h3>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '2rem' }}>PREMIUM TOOLS</div>

                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.2rem', marginBottom: '0.5rem' }}>
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '1.5rem', color: 'var(--parchment)' }}>$</span>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '4rem', color: 'var(--parchment)', lineHeight: 1 }}>1.99</span>
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8rem', color: 'var(--fog)' }}>/ mo</span>
                        </div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--fog)', marginBottom: '2rem', letterSpacing: '0.1em' }}>BILLED ANNUALLY ($19.99/YR)</div>

                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2.5rem' }}>
                            <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: 'var(--sepia)', fontStyle: 'italic', marginBottom: '0.5rem' }}>Everything in Free, plus:</div>
                            <div style={{ padding: '0.75rem', background: 'rgba(139,105,20,0.1)', border: '1px solid rgba(139,105,20,0.3)', borderRadius: 'var(--radius-card)', marginBottom: '0.5rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--flicker)' }}>✦</div>
                                <div>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--flicker)', marginBottom: '0.2rem' }}>The Editorial Desk</div>
                                    <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: 'var(--parchment)', lineHeight: 1.4 }}>Pro-level review formatting. Inject movie stills, pull-quotes, and drop caps into your logs.</div>
                                </div>
                            </div>
                            {['The Physical Archive (Track 4K/Blu-Ray/VHS)', 'The Vault (Private Notes)', 'The Splicer (Edit Logs)', 'Archival Record (.CSV Export)', 'The Projectionist\'s Calendar'].map((feature, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ width: 6, height: 6, background: 'var(--flicker)', borderRadius: '50%', boxShadow: '0 0 8px var(--flicker)' }} />
                                    <span style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--parchment)' }}>{feature}</span>
                                </div>
                            ))}
                        </div>

                        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '1rem' }} onClick={() => !isAuthenticated ? openSignupModal('archivist') : useAuthStore.getState().updateUser({ role: 'archivist' })}>
                            {isAuthenticated ? (user?.role === 'archivist' || user?.role === 'auteur' ? 'CURRENT RANK' : 'Ascend to Archivist') : 'Claim Archivist Status'}
                        </button>
                    </motion.div>

                    {/* The Patron Tier */}
                    <motion.div variants={itemVariants} className="card" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', border: '1px solid var(--blood-reel)', background: 'linear-gradient(135deg, rgba(162,36,36,0.1) 0%, transparent 100%)', boxShadow: '0 0 40px rgba(162,36,36,0.1)' }}>
                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--blood-reel)', marginBottom: '0.5rem' }}>The Auteur</h3>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.15em', color: 'var(--blood-reel)', marginBottom: '2rem', opacity: 0.8 }}>ULTIMATE PATRONAGE</div>

                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.2rem', marginBottom: '0.5rem' }}>
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '1.5rem', color: 'var(--bone)' }}>$</span>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '4rem', color: 'var(--bone)', lineHeight: 1 }}>4.99</span>
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8rem', color: 'var(--fog)' }}>/ mo</span>
                        </div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--fog)', marginBottom: '2rem', letterSpacing: '0.1em' }}>BILLED ANNUALLY ($49.99/YR)</div>

                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2.5rem' }}>
                            <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: 'var(--blood-reel)', fontStyle: 'italic', marginBottom: '0.5rem' }}>Everything in Archivist, plus:</div>
                            <div style={{ padding: '0.75rem', background: 'rgba(162,36,36,0.1)', border: '1px solid rgba(162,36,36,0.3)', borderRadius: 'var(--radius-card)', marginBottom: '0.5rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--blood-reel)' }}>✦</div>
                                <div>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--blood-reel)', marginBottom: '0.2rem' }}>The Autopsy Engine</div>
                                    <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: 'var(--bone)', lineHeight: 1.4 }}>Break down films across 5 specific axes. Attach gorgeous, dynamic radar charts to your reviews.</div>
                                </div>
                            </div>
                            {['Curatorial Control (Select Alternative TMDB Posters)', 'Celluloid Bleed Profile Aesthetics', 'Gold Foil "Auteur" Badge', 'Early Access to New Features'].map((feature, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <Star size={12} color="var(--blood-reel)" style={{ flexShrink: 0 }} />
                                    <span style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--bone)' }}>{feature}</span>
                                </div>
                            ))}
                        </div>

                        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '1rem', background: 'var(--blood-reel)', color: 'var(--bone)', border: 'none' }} onClick={() => !isAuthenticated ? openSignupModal('auteur') : useAuthStore.getState().updateUser({ role: 'auteur' })}>
                            {isAuthenticated ? (user?.role === 'auteur' ? 'CURRENT RANK' : 'Ascend to Auteur') : 'Become a Patron'}
                        </button>
                    </motion.div>
                </motion.div>

                {/* FAQ / Manifesto */}
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    style={{ textAlign: 'center', marginTop: '6rem', borderTop: '1px dashed var(--ash)', paddingTop: '4rem', maxWidth: 800, marginInline: 'auto' }}
                >
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.3em', color: 'var(--sepia)', marginBottom: '1.5rem' }}>
                        OUR PHILOSOPHY
                    </div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', color: 'var(--parchment)', marginBottom: '1.5rem' }}>
                        Built for the Love of Cinema.
                    </h2>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '1.1rem', color: 'var(--bone)', lineHeight: 1.8, marginBottom: '2rem', fontStyle: 'italic' }}>
                        We believe that software should feel like a physical artifact—a curated, brutalist space free from corporate bloat. By ascending within The Society, you preserve this aesthetic and command the most premium cinematic ledger ever forged.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                        <div style={{ width: '40px', height: '1px', background: 'var(--flicker)', alignSelf: 'center' }} />
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--flicker)' }}>✦</div>
                        <div style={{ width: '40px', height: '1px', background: 'var(--flicker)', alignSelf: 'center' }} />
                    </div>
                </motion.div>
            </div>
        </div>
    )
}
