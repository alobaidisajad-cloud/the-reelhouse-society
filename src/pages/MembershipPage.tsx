import { useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Crown, Star, Key, EyeOff, LayoutTemplate, Database, Upload, Video } from 'lucide-react'
import { useAuthStore, useUIStore } from '../store'
import Buster from '../components/Buster'
import CSVImport from '../components/CSVImport'
import toast from 'react-hot-toast'
import { supabase } from '../supabaseClient'
import '../styles/membership.css'
import PageSEO from '../components/PageSEO'

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
    const [csvImportOpen, setCsvImportOpen] = useState(false)

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
    const [waitlistEmail, setWaitlistEmail] = useState('')
    const [waitlistTier, setWaitlistTier] = useState('')
    const [waitlistSent, setWaitlistSent] = useState(false)

    const handleWaitlist = async (tier: string) => {
        const email = waitlistEmail.trim()
        if (!email || !email.includes('@')) {
            toast.error('Enter a valid email address.')
            return
        }
        try {
            setIsRedirecting(true)
            await supabase.from('waitlist').insert({ email, tier, created_at: new Date().toISOString() })
            toast.success('You\'re on the list. We\'ll be in touch.', { icon: '✦' })
            setWaitlistSent(true)
            setWaitlistEmail('')
        } catch {
            toast.error('Something went wrong. Try again.')
        } finally {
            setIsRedirecting(false)
        }
    }

    return (
        <div className="membership-page">
            <div className="container" style={{ maxWidth: 1000 }}>
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="membership-header"
                >
                    <div className="buster-wrap">
                        <Buster size={80} mood="smiling" />
                    </div>
                    <div className="membership-label">ELEVATE YOUR DEVOTION</div>
                    <h1 className="membership-title">The ReelHouse Society</h1>
                    <p className="membership-subtitle">
                        Ascend the ranks of The Society. Embrace the aesthetic. Wield the ultimate cinematic toolkit.
                    </p>

                    {isAuthenticated && (
                        <button
                            onClick={() => setCsvImportOpen(true)}
                            className="btn btn-ghost membership-import-btn"
                        >
                            <Upload size={13} /> IMPORT YOUR ARCHIVE
                        </button>
                    )}
                </motion.div>

                {/* Tiers Grid */}
                <motion.div
                    variants={containerVariants as any}
                    initial="hidden"
                    animate="visible"
                    className="tiers-grid"
                >
                    {/* The Free Tier */}
                    <motion.div variants={itemVariants as any} className="card card-tier tier-card" style={{ border: 'none' }}>
                        <h3 className="tier-name">The<br/>Cinephile</h3>
                        <div className="tier-label tier-label--free">BASIC ACCESS</div>

                        <div className="tier-price tier-price--free">
                            <span className="price-amount price-amount--free">Free</span>
                            <span className="price-period">FOREVER</span>
                        </div>

                        <div className="tier-features">
                            {['Log & Rate Films', 'The Diary & Watchlist', 'Basic Profile', 'Unlimited Custom Lists', 'Import & Export Archive'].map((feature, i) => (
                                <div key={i} className="feature-item">
                                    <div className="feature-dot feature-dot--free" />
                                    <span className="feature-text feature-text--free">{feature}</span>
                                </div>
                            ))}
                        </div>

                        {isAuthenticated && (!user?.role || (user?.role as string) === 'cinephile') ? (
                            <div className="current-rank">YOUR CURRENT RANK</div>
                        ) : (
                            <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', padding: '1rem', fontSize: '0.8rem', letterSpacing: '0.2em' }} onClick={() => openSignupModal('cinephile')}>
                                JOIN FREE
                            </button>
                        )}
                    </motion.div>

                    {/* The Pro Tier */}
                    <motion.div variants={itemVariants as any} className="card card-tier tier-card tier-card--archivist">
                        <div className="popular-badge">MOST POPULAR</div>

                        <h3 className="tier-name tier-name--archivist">The<br/>Archivist</h3>
                        <div className="tier-label tier-label--archivist">PREMIUM TOOLS</div>

                        <div className="tier-price">
                            <span className="price-currency">$</span>
                            <span className="price-amount">1.99</span>
                            <span className="price-period">/ MO</span>
                        </div>
                        <div className="price-billing">BILLED ANNUALLY ($19.99/YR)</div>

                        <div className="tier-features tier-features--pro">
                            <div className="tier-includes tier-includes--archivist">Everything in Free, plus:</div>
                            
                            <div className="featured-feature featured-feature--archivist">
                                <div className="feature-dot feature-dot--archivist" />
                                <div>
                                    <div className="featured-feature-title featured-feature-title--archivist">The Editorial<br/>Desk</div>
                                    <div className="featured-feature-desc">Pro-level review formatting. Inject movie stills, pull-quotes, and drop caps into your logs.</div>
                                </div>
                            </div>
                            
                            {[
                                'The Physical Archive\n(Track 4K/Blu-Ray/VHS)', 
                                'The Vault (Private Notes)', 
                                'Ad-Free Experience', 
                                'Priority Support &\nEarly Access', 
                                'The Projectionist\'s\nCalendar'
                            ].map((feature, i) => (
                                <div key={i} className="feature-item feature-item--pro">
                                    <div className="feature-dot feature-dot--archivist" />
                                    <span className="feature-text">{feature}</span>
                                </div>
                            ))}
                        </div>

                        {waitlistSent ? (
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', padding: '0.75rem 0' }}>
                                ✦ YOU'RE ON THE LIST ✦
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', marginTop: '0.5rem' }}>
                                <input
                                    type="email"
                                    className="input"
                                    placeholder="your@email.com"
                                    value={waitlistTier === 'archivist' ? waitlistEmail : ''}
                                    onFocus={() => setWaitlistTier('archivist')}
                                    onChange={e => { setWaitlistTier('archivist'); setWaitlistEmail(e.target.value) }}
                                    style={{ textAlign: 'center', fontSize: '0.75rem' }}
                                />
                                <button
                                    className="btn btn-primary tier-btn"
                                    style={{ opacity: isRedirecting ? 0.7 : 1 }}
                                    disabled={isRedirecting}
                                    onClick={() => handleWaitlist('archivist')}
                                >
                                    {isRedirecting ? 'JOINING...' : 'JOIN THE ARCHIVIST WAITLIST'}
                                </button>
                            </div>
                        )}
                    </motion.div>

                    {/* The Patron Tier */}
                    <motion.div variants={itemVariants as any} className="card card-tier tier-card tier-card--auteur">
                        <h3 className="tier-name tier-name--auteur">The Auteur</h3>
                        <div className="tier-label tier-label--auteur">ULTIMATE PATRONAGE</div>

                        <div className="tier-price">
                            <span className="price-currency">$</span>
                            <span className="price-amount">4.99</span>
                            <span className="price-period">/ MO</span>
                        </div>
                        <div className="price-billing">BILLED ANNUALLY ($49.99/YR)</div>

                        <div className="tier-features tier-features--pro">
                            <div className="tier-includes tier-includes--auteur">Everything in Archivist, plus:</div>
                            
                            <div className="featured-feature featured-feature--auteur">
                                <div className="feature-dot feature-dot--auteur" />
                                <div>
                                    <div className="featured-feature-title featured-feature-title--auteur">The Breakdown<br/>Engine</div>
                                    <div className="featured-feature-desc">Break down films across 5 specific axes. Attach gorgeous, dynamic radar charts to your reviews.</div>
                                </div>
                            </div>

                            {[
                                'Publish Essays to The\nDispatch', 
                                'Curatorial Control\n(Select Alternative TMDB\nPosters)', 
                                'Poster Glow Profile\nAesthetics', 
                                'Gold Foil "Auteur" Badge', 
                                'Early Access to New\nFeatures'
                            ].map((feature, i) => (
                                <div key={i} className="feature-item feature-item--pro">
                                    <div className="auteur-star">
                                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#7d1f1f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                                    </div>
                                    <span className="feature-text">{feature}</span>
                                </div>
                            ))}
                        </div>

                        {waitlistSent ? (
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', padding: '0.75rem 0' }}>
                                ✦ YOU'RE ON THE LIST ✦
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', marginTop: '0.5rem' }}>
                                <input
                                    type="email"
                                    className="input"
                                    placeholder="your@email.com"
                                    value={waitlistTier === 'auteur' ? waitlistEmail : ''}
                                    onFocus={() => setWaitlistTier('auteur')}
                                    onChange={e => { setWaitlistTier('auteur'); setWaitlistEmail(e.target.value) }}
                                    style={{ textAlign: 'center', fontSize: '0.75rem' }}
                                />
                                <button
                                    className="btn btn-primary tier-btn tier-btn--auteur"
                                    style={{ opacity: isRedirecting ? 0.7 : 1 }}
                                    disabled={isRedirecting}
                                    onClick={() => handleWaitlist('auteur')}
                                >
                                    {isRedirecting ? 'JOINING...' : 'JOIN THE AUTEUR WAITLIST'}
                                </button>
                            </div>
                        )}
                    </motion.div>

                    {/* The Creator Tier */}
                    <motion.div variants={itemVariants as any} className="card card-tier tier-card tier-card--projectionist">
                        <div className="new-badge">NEW</div>

                        <h3 className="tier-name tier-name--projectionist">The<br/>Projectionist</h3>
                        <div className="tier-label tier-label--projectionist">CREATOR ECONOMY</div>

                        <div className="tier-price">
                            <span className="price-currency">$</span>
                            <span className="price-amount">9.99</span>
                            <span className="price-period">/ MO</span>
                        </div>
                        <div className="price-billing">BILLED ANNUALLY ($99.99/YR)</div>

                        <div className="tier-features tier-features--pro">
                            <div className="tier-includes tier-includes--projectionist">Everything in Auteur, plus:</div>
                            
                            <div className="featured-feature featured-feature--projectionist">
                                <div className="feature-dot feature-dot--projectionist" />
                                <div>
                                    <div className="featured-feature-title featured-feature-title--projectionist">The Screening<br/>Room</div>
                                    <div className="featured-feature-desc">Upload video reviews up to 10 minutes in 1080p. Build your audience and earn directly from your critics.</div>
                                </div>
                            </div>

                            {[
                                'Video Upload Studio\n(Up to 10 Min / 1080p)', 
                                'Audience Tips &\nDirect Earnings', 
                                'Creator Analytics\nDashboard', 
                                'Priority Homepage\nPlacement', 
                                'Exclusive "Projectionist"\nProfile Badge',
                            ].map((feature, i) => (
                                <div key={i} className="feature-item feature-item--pro">
                                    <div className="projectionist-icon">
                                        <Video size={8} color="#c4872a" />
                                    </div>
                                    <span className="feature-text">{feature}</span>
                                </div>
                            ))}
                        </div>

                        {waitlistSent ? (
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', padding: '0.75rem 0' }}>
                                ✦ YOU'RE ON THE LIST ✦
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', marginTop: '0.5rem' }}>
                                <input
                                    type="email"
                                    className="input"
                                    placeholder="your@email.com"
                                    value={waitlistTier === 'projectionist' ? waitlistEmail : ''}
                                    onFocus={() => setWaitlistTier('projectionist')}
                                    onChange={e => { setWaitlistTier('projectionist'); setWaitlistEmail(e.target.value) }}
                                    style={{ textAlign: 'center', fontSize: '0.75rem' }}
                                />
                                <button
                                    className="btn btn-primary tier-btn tier-btn--projectionist"
                                    style={{ opacity: isRedirecting ? 0.7 : 1 }}
                                    disabled={isRedirecting}
                                    onClick={() => handleWaitlist('projectionist')}
                                >
                                    {isRedirecting ? 'JOINING...' : 'JOIN THE PROJECTIONISTS'}
                                </button>
                            </div>
                        )}
                    </motion.div>
                </motion.div>

                {/* —— FOUNDING MEMBERS BANNER —— */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7 }}
                    className="founding-banner"
                >
                    <div className="founding-texture" />

                    <div className="founding-seal">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                    </div>

                    <div className="founding-tag">LIMITED OFFER · CLASS OF 1924</div>
                    <h2 className="founding-title">Founding Members</h2>
                    <p className="founding-desc">
                        The first 100 members to join The Society receive <em>Archivist access for life</em> — permanently, with no recurring charges, ever. A single entry in the ledger. A permanent seat in the house.
                    </p>

                    <div className="founding-price">
                        <span className="founding-price-currency">$</span>
                        <span className="founding-price-amount">49</span>
                        <div>
                            <div className="founding-price-label">ONE TIME</div>
                            <div className="founding-price-sub">NO RENEWALS</div>
                        </div>
                    </div>

                    <div className="founding-compare">
                        Compare to $19.99/yr recurring — this pays for itself in under 3 years and never charges again.
                    </div>

                    <button
                        className="btn btn-primary founding-btn"
                        onClick={() => {
                            const el = document.querySelector('.tier-card input[type=email]') as HTMLInputElement
                            if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus() }
                        }}
                    >
                        CLAIM A FOUNDING SEAT
                    </button>

                    <div className="founding-footer">
                        POWERED BY PAYTABS · SECURE CHECKOUT · SEATS FILLING FAST
                    </div>
                </motion.div>

                {/* Philosophy */}
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="philosophy-section"
                >
                    <div className="philosophy-label">OUR PHILOSOPHY</div>
                    <h2 className="philosophy-title">Built for the Love of Cinema.</h2>
                    <p className="philosophy-body">
                        We believe that software should feel like a physical artifact—a curated, brutalist space free from corporate bloat. By ascending within The Society, you preserve this aesthetic and command the most premium cinematic ledger ever forged.
                    </p>
                    <div className="philosophy-divider">
                        <div className="philosophy-line" />
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--flicker)' }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                        <div className="philosophy-line" />
                    </div>
                </motion.div>
            </div>

            {/* CSV Import modal */}
            {csvImportOpen && <CSVImport onClose={() => setCsvImportOpen(false)} />}
        </div>
    )
}
