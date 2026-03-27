import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore } from '../store'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { Portal } from './UI'

const IconClose = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
)

export default function HandbookModal() {
    const { handbookOpen, closeHandbook } = useUIStore()
    const focusTrapRef = useFocusTrap(handbookOpen, closeHandbook)

    return (
        <Portal>
        <AnimatePresence>
            {handbookOpen && (
                <motion.div
                    className="handbook-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={closeHandbook}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Society Handbook"
                >
                    <motion.div
                        className="handbook-content"
                        initial={{ y: 30, opacity: 0, scale: 0.95 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 30, opacity: 0, scale: 0.95 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button className="handbook-close" onClick={closeHandbook}>
                            <IconClose />
                        </button>

                        <div className="handbook-header">
                            <div className="hb-badge">THE SOCIETY</div>
                            <h2 className="hb-title">Handbook</h2>
                            <p className="hb-subtitle">A brief glossary of terms for the newly initiated cinephile.</p>
                        </div>

                        <div className="handbook-grid">
                            <div className="hb-item">
                                <h3>The Lobby</h3>
                                <p>The central hub. Featuring curated film selections, current trends, and the architectural foundation of our society.</p>
                            </div>

                            <div className="hb-item">
                                <h3>The Reel</h3>
                                <p>The live cardiovascular system of the community. See what other devotees are logging in real-time, and certify transmissions from fellow cinephiles.</p>
                            </div>

                            <div className="hb-item">
                                <h3>The Darkroom</h3>
                                <p>Our expansive discovery engine. Step inside to develop films by emotional resonance, decade, genre, and aesthetic mood.</p>
                            </div>

                            <div className="hb-item">
                                <h3>Ticket Stubs</h3>
                                <p>Physical proof of attendance. When you book a seat at a Society-affiliated Palace, your stub is preserved here — a permanent record of where you were and what you witnessed.</p>
                            </div>

                            <div className="hb-item">
                                <h3>The Ledger / Vault</h3>
                                <p>Your personal profile. View your logged films, custom curations, and analyze your <strong>Taste DNA</strong> generated from your autopsies.</p>
                            </div>

                            <div className="hb-item">
                                <h3>The Dispatch</h3>
                                <p>The official newsletter of the Society. Read original dossiers filed by our premium Auteur members.</p>
                            </div>

                            <div className="hb-item">
                                <h3>The Atlas</h3>
                                <p>A directory of associated physical cinemas, theaters, and temples of the silver screen worldwide.</p>
                            </div>
                        </div>

                    </motion.div>
                </motion.div>
            )}

        </AnimatePresence>
        </Portal>
    )
}
