import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { Crown, Star, Upload } from 'lucide-react'
import { useAuthStore, useUIStore } from '../store'
import Buster from '../components/Buster'
import CSVImport from '../components/CSVImport'
import reelToast from '../utils/reelToast'
import { supabase } from '../supabaseClient'
import '../styles/membership.css'
import PageSEO from '../components/PageSEO'

export default function MembershipPage() {
    const { isAuthenticated, user } = useAuthStore()
    const navigate = useNavigate()
    const [csvImportOpen, setCsvImportOpen] = useState(false)

    // ── Founding seat cap ──────────────────────────────────────
    const [foundingCount, setFoundingCount] = useState<number | null>(null)
    useEffect(() => {
        supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('is_founding', true)
            .then(({ count }) => setFoundingCount(count ?? 0))
    }, [])

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

    // Tier hierarchy for CTA logic — prevents dead-end buttons and accidental downgrades.
    // Mirrors the mobile membership.tsx TIER_RANK system.
    const userRole = (user?.role as string) ?? 'cinephile'
    const TIER_RANK: Record<string, number> = { cinephile: 0, archivist: 1, auteur: 2 }
    const userRank = TIER_RANK[userRole] ?? 0
    const isCurrentTier = (id: string) => {
        if (id === 'cinephile') return userRank === 0
        return userRole === id
    }
    const isLowerTier = (id: string) => userRank > (TIER_RANK[id] ?? 0)

    const handleCheckout = async (tier: string) => {
        if (!isAuthenticated || !user) { navigate('/join'); return }
        setIsRedirecting(true)
        try {
            const { data, error } = await supabase.functions.invoke('paytabs-handler/create', {
                body: { checkout_type: 'membership', user_id: user.id, tier }
            })
            if (error || !data?.redirect_url) throw error
            window.location.href = data.redirect_url
        } catch (err) {
            reelToast.error('Checkout unavailable right now. Try again.')
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
                            {/* Kept level with mobile/src/constants/membership.ts, which carries
                                the reasoning: the old list described a spreadsheet with posters
                                and never mentioned that a Cinephile may FILE to the Dispatch —
                                takes, seekings and wires — nor critique, certify or vote. */}
                            {['Log, rate and review every film', 'The Diary, Watchlist and lists', 'Import and export your archive', 'File takes, seekings and wires', 'Critique, certify and vote', 'Listen in on the open salons'].map((feature, i) => (
                                <div key={i} className="feature-item">
                                    <div className="feature-dot feature-dot--free" />
                                    <span className="feature-text feature-text--free">{feature}</span>
                                </div>
                            ))}
                        </div>

                        {isAuthenticated && isCurrentTier('cinephile') ? (
                            <div className="current-rank">YOUR CURRENT RANK</div>
                        ) : isAuthenticated && isLowerTier('cinephile') ? (
                            <div className="current-rank" style={{ borderColor: 'rgba(139,105,20,0.15)', color: 'var(--fog)', opacity: 0.6 }}>INCLUDED IN YOUR RANK</div>
                        ) : (
                            <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', padding: '1rem', fontSize: '0.8rem', letterSpacing: '0.2em' }} onClick={() => navigate('/join')}>
                                JOIN FREE
                            </button>
                        )}
                    </motion.div>

                    {/* The Pro Tier */}
                    <motion.div variants={itemVariants as any} className="card card-tier tier-card tier-card--archivist">
                        {/* "MOST POPULAR" was printed here over a rank nobody had yet bought.
                            The app says what is true instead: the house recommends it. */}
                        <div className="popular-badge">THE HOUSE RECOMMENDS</div>

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
                                    <div className="featured-feature-desc">Dress a review with a film still, a pull-quote and a drop cap.</div>
                                </div>
                            </div>
                            
                            {/* NO GILDED FRAME. It promised "Exclusive Animated Gold Borders"
                                and there was no such thing — it existed in the two sales lists
                                and nowhere else in either codebase. We were charging for it.
                                THE ARCHIVE replaces it because that one is real and was being
                                withheld from members without ever being offered to them. */}
                            {[
                                'The Vault',
                                'The Lounge',
                                'The Physical Archive',
                                'The Archive',
                                'The Archivist’s Mark'
                            ].map((feature, i) => (
                                <div key={i} className="feature-item feature-item--pro">
                                    <div className="feature-dot feature-dot--archivist" />
                                    <span className="feature-text">{feature}</span>
                                </div>
                            ))}
                        </div>

                        {isAuthenticated && isCurrentTier('archivist') ? (
                            <div className="current-rank" style={{ borderColor: 'var(--sepia)', color: 'var(--sepia)' }}>✦ YOUR CURRENT RANK ✦</div>
                        ) : isAuthenticated && isLowerTier('archivist') ? (
                            <div className="current-rank" style={{ borderColor: 'rgba(139,105,20,0.15)', color: 'var(--fog)', opacity: 0.6 }}>INCLUDED IN YOUR RANK</div>
                        ) : (
                            <button
                                className="btn btn-primary tier-btn"
                                style={{ width: '100%', justifyContent: 'center', padding: '1rem', fontSize: '0.75rem', letterSpacing: '0.2em', opacity: isRedirecting ? 0.7 : 1 }}
                                disabled={isRedirecting}
                                onClick={() => handleCheckout('archivist')}
                            >
                                {isRedirecting ? 'SECURING LEDGER...' : 'BECOME AN ARCHIVIST'}
                            </button>
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
                                    <div className="featured-feature-desc">Score a film on six counts: story, script, acting, cinematography, editing, sound.</div>
                                </div>
                            </div>

                            {/* NO GOLD FOIL BADGE. Mobile dropped that line deliberately: the
                                card DRAWS the real mark, and a sentence describing it is a
                                second copy of one fact — the copy being the one that goes
                                stale. It already had. The mark is not gold.
                                And "Poster Glow" named nothing anybody could find; the feature
                                is the profile Backdrop, which is real and already built. */}
                            {[
                                'Essays & Ballots',
                                'Curatorial Control',
                                'The Backdrop',
                                // Sold on mobile since founding a private room became the
                                // Auteur's (tr_tier_gate_private_lounges). The database
                                // enforces it for this client too, so this page sold a rank
                                // that withheld something it never mentioned.
                                'Private Screening Rooms',
                                // "Early Access to New Features" was sold here and kept by
                                // nothing — no mechanism gave anyone early access to anything.
                                'The Auteur’s Plate'
                            ].map((feature, i) => (
                                <div key={i} className="feature-item feature-item--pro">
                                    <div className="auteur-star">
                                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#7d1f1f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                                    </div>
                                    <span className="feature-text">{feature}</span>
                                </div>
                            ))}
                        </div>

                        {isAuthenticated && isCurrentTier('auteur') ? (
                            <div className="current-rank" style={{ borderColor: '#7d1f1f', color: '#7d1f1f' }}>★ YOUR CURRENT RANK ★</div>
                        ) : isAuthenticated && isLowerTier('auteur') ? (
                            <div className="current-rank" style={{ borderColor: 'rgba(139,105,20,0.15)', color: 'var(--fog)', opacity: 0.6 }}>INCLUDED IN YOUR RANK</div>
                        ) : (
                            <button
                                className="btn btn-primary tier-btn tier-btn--auteur"
                                style={{ width: '100%', justifyContent: 'center', padding: '1rem', fontSize: '0.75rem', letterSpacing: '0.2em', opacity: isRedirecting ? 0.7 : 1 }}
                                disabled={isRedirecting}
                                onClick={() => handleCheckout('auteur')}
                            >
                                {isRedirecting ? 'SECURING LEDGER...' : 'BECOME AN AUTEUR'}
                            </button>
                        )}
                    </motion.div>
                </motion.div>

                {/* —— FOUNDING MEMBERS BANNER (visible until 100 seats filled) —— */}
                {foundingCount !== null && foundingCount < 100 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7 }}
                    className="founding-banner"
                >
                    <div className="founding-texture" />

                    {/* A certificate is signed with the house's own mark, never a stand-in star. */}
                    <img className="founding-mark" src="/reelhouse-logo-transparent.png" alt="The ReelHouse Society" width={64} height={64} />

                    {/* The limit, never the count: "N seats remaining" told every visitor how many
                        had joined. The count still decides whether this banner shows at all. */}
                    <div className="founding-tag">LIMITED TO THE FIRST 100 MEMBERS</div>
                    <h2 className="founding-title">Founding Members</h2>
                    <p className="founding-desc">
                        The first 100 members to join The Society receive <em>Auteur access for life</em> — permanently, with no recurring charges, ever. A single entry in the ledger. A permanent seat in the house.
                    </p>

                    <div className="founding-price">
                        <span className="founding-price-currency">$</span>
                        <span className="founding-price-amount">49</span>
                        <div>
                            <div className="founding-price-label">ONE TIME</div>
                            <div className="founding-price-sub">NO RENEWALS</div>
                        </div>
                    </div>

                    {/* It compared the seat with $19.99 — the ARCHIVIST's year — when the seat
                        is the AUTEUR rank ($49.99 a year). Against the rank it actually is, $49
                        once costs less than a single year of it. */}
                    <div className="founding-compare">
                        It costs less than a single year of the Auteur, and lasts somewhat longer.
                    </div>

                    <button
                        className="btn btn-primary founding-btn"
                        style={{ opacity: isRedirecting ? 0.7 : 1 }}
                        disabled={isRedirecting}
                        onClick={async () => {
                            if (!isAuthenticated || !user) { navigate('/join'); return }
                            setIsRedirecting(true)
                            try {
                                const { data, error } = await supabase.functions.invoke('paytabs-handler/create', {
                                    body: { checkout_type: 'membership', user_id: user.id, tier: 'founding' }
                                })
                                if (error || !data?.redirect_url) throw error
                                window.location.href = data.redirect_url
                            } catch (err) {
                                reelToast.error('Checkout unavailable right now.')
                                setIsRedirecting(false)
                            }
                        }}
                    >
                        {isRedirecting ? 'SECURING LEDGER...' : 'CLAIM A FOUNDING SEAT'}
                    </button>

                    <div className="founding-footer">
                        ONE PAYMENT · NEVER RENEWS
                    </div>
                </motion.div>
                )}

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
