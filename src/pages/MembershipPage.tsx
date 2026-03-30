import { useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Crown, Star, Upload, Video } from 'lucide-react'
import { useAuthStore, useUIStore } from '../store'
import Buster from '../components/Buster'
import CSVImport from '../components/CSVImport'
import toast from 'react-hot-toast'
import { supabase } from '../supabaseClient'
import '../styles/membership.css'
import PageSEO from '../components/PageSEO'

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
    // Per-tier email state — each input is independent so typing in one never clears another
    const [archivistEmail, setArchivistEmail] = useState('')
    const [auteurEmail, setAuteurEmail] = useState('')
    const [projectionistEmail, setProjectionistEmail] = useState('')
    // Per-tier waitlist flags — submitting one tier's form doesn't hide the others
    const [archivistWaitlistSent, setArchivistWaitlistSent] = useState(false)
    const [auteurWaitlistSent, setAuteurWaitlistSent] = useState(false)
    const [projectionistWaitlistSent, setProjectionistWaitlistSent] = useState(false)

    // Role detection for "YOUR CURRENT RANK" badges
    const userRole = user?.role as string
    const isCurrentArchivist = userRole === 'archivist'
    const isCurrentAuteur = userRole === 'auteur'
    const isCurrentProjectionist = userRole === 'projectionist'

    const handleWaitlist = async (tier: string, email: string) => {
        const trimmed = email.trim()
        if (!trimmed || !trimmed.includes('@')) {
            toast.error('Enter a valid email address.')
            return
        }
        try {
            setIsRedirecting(true)
            await supabase.from('waitlist').insert({ email: trimmed, tier, created_at: new Date().toISOString() })
            toast.success('You\'re on the list. We\'ll be in touch.', { icon: '✦' })
            if (tier === 'archivist') setArchivistWaitlistSent(true)
            else if (tier === 'auteur') setAuteurWaitlistSent(true)
            else if (tier === 'projectionist') setProjectionistWaitlistSent(true)
        } catch {
            toast.error('Something went wrong. Try again.')
        } finally {
            setIsRedirecting(false)
        }
    }

    return (
        <div className="membership-page">
            <div className="container" style={{ maxWidth: 1200 }}>
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
                                'Priority Support &\nEarly Access', 
                                'The Nightly Programme\n(Curate Double Features)'
                            ].map((feature, i) => (
                                <div key={i} className="feature-item feature-item--pro">
                                    <div className="feature-dot feature-dot--archivist" />
                                    <span className="feature-text">{feature}</span>
                                </div>
                            ))}
                        </div>

                        {isAuthenticated && isCurrentArchivist ? (
                            <div className="current-rank" style={{ borderColor: 'var(--sepia)', color: 'var(--sepia)' }}>✦ YOUR CURRENT RANK ✦</div>
                        ) : archivistWaitlistSent ? (
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', padding: '0.75rem 0' }}>
                                ✦ YOU'RE ON THE LIST ✦
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', marginTop: '0.5rem' }}>
                                <input
                                    type="email"
                                    className="input"
                                    placeholder="your@email.com"
                                    value={archivistEmail}
                                    onChange={e => setArchivistEmail(e.target.value)}
                                    style={{ textAlign: 'center', fontSize: '0.75rem' }}
                                />
                                <button
                                    className="btn btn-primary tier-btn"
                                    style={{ opacity: isRedirecting ? 0.7 : 1 }}
                                    disabled={isRedirecting}
                                    onClick={() => handleWaitlist('archivist', archivistEmail)}
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
                                    <div className="featured-feature-desc">Break down films across 6 specific axes — Story, Script, Acting, Cinematography, Editing & Sound. Attach gorgeous, dynamic radar charts to your reviews.</div>
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

                        {isAuthenticated && isCurrentAuteur ? (
                            <div className="current-rank" style={{ borderColor: '#7d1f1f', color: '#7d1f1f' }}>★ YOUR CURRENT RANK ★</div>
                        ) : auteurWaitlistSent ? (
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', padding: '0.75rem 0' }}>
                                ✦ YOU'RE ON THE LIST ✦
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', marginTop: '0.5rem' }}>
                                <input
                                    type="email"
                                    className="input"
                                    placeholder="your@email.com"
                                    value={auteurEmail}
                                    onChange={e => setAuteurEmail(e.target.value)}
                                    style={{ textAlign: 'center', fontSize: '0.75rem' }}
                                />
                                <button
                                    className="btn btn-primary tier-btn tier-btn--auteur"
                                    style={{ opacity: isRedirecting ? 0.7 : 1 }}
                                    disabled={isRedirecting}
                                    onClick={() => handleWaitlist('auteur', auteurEmail)}
                                >
                                    {isRedirecting ? 'JOINING...' : 'JOIN THE AUTEUR WAITLIST'}
                                </button>
                            </div>
                        )}
                    </motion.div>

                    {/* The Creator Tier */}
                    <motion.div variants={itemVariants as any} className="card card-tier tier-card tier-card--projectionist">
                        <div className="new-badge">COMING SOON</div>

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
                                'Audience Support &\nDirect Earnings', 
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

                        {isAuthenticated && isCurrentProjectionist ? (
                            <div className="current-rank" style={{ borderColor: '#c4872a', color: '#c4872a' }}>◈ YOUR CURRENT RANK ◈</div>
                        ) : projectionistWaitlistSent ? (
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', padding: '0.75rem 0' }}>
                                ✦ YOU'RE ON THE LIST ✦
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', marginTop: '0.5rem' }}>
                                <input
                                    type="email"
                                    className="input"
                                    placeholder="your@email.com"
                                    value={projectionistEmail}
                                    onChange={e => setProjectionistEmail(e.target.value)}
                                    style={{ textAlign: 'center', fontSize: '0.75rem' }}
                                />
                                <button
                                    className="btn btn-primary tier-btn tier-btn--projectionist"
                                    style={{ opacity: isRedirecting ? 0.7 : 1 }}
                                    disabled={isRedirecting}
                                    onClick={() => handleWaitlist('projectionist', projectionistEmail)}
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
                        style={{ opacity: isRedirecting ? 0.7 : 1 }}
                        disabled={isRedirecting}
                        onClick={async () => {
                            if (!isAuthenticated || !user) { openSignupModal('founding'); return }
                            setIsRedirecting(true)
                            try {
                                const { data, error } = await supabase.functions.invoke('paytabs-handler/create', {
                                    body: { checkout_type: 'membership', user_id: user.id, tier: 'founding' }
                                })
                                if (error || !data?.redirect_url) throw error
                                window.location.href = data.redirect_url
                            } catch (err) {
                                toast.error('Checkout unavailable right now.')
                                setIsRedirecting(false)
                            }
                        }}
                    >
                        {isRedirecting ? 'SECURING LEDGER...' : 'CLAIM A FOUNDING SEAT'}
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
