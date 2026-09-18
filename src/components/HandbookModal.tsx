import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore } from '../store'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useAndroidHardwareBack } from '../hooks/useAndroidHardwareBack'
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
    useAndroidHardwareBack(handbookOpen, closeHandbook)

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

                            {/* Every entry names a room a member can actually enter. This
                                glossary described The Atlas and Ticket Stubs, which do not
                                exist, called the profile "The Ledger / Vault", and never
                                mentioned The Stacks, The Lounge or The Society. */}
                            <div className="hb-item">
                                <h3>The Darkroom</h3>
                                <p>Our discovery engine. Step inside to develop films by mood, decade and genre.</p>
                            </div>

                            <div className="hb-item">
                                <h3>The Dispatch</h3>
                                <p>The official newsletter of the Society. Read original dossiers filed by our Auteur members.</p>
                            </div>

                            <div className="hb-item">
                                <h3>The Stacks</h3>
                                <p>Curated collections of films — ranked or unranked, kept private or shared with the Society.</p>
                            </div>

                            <div className="hb-item">
                                <h3>The Lounge</h3>
                                <p>Chat rooms for members who take cinema seriously. Open to the Archivist rank and above.</p>
                            </div>

                            <div className="hb-item">
                                <h3>Your File</h3>
                                <p>Your profile. The Archive holds every film you have watched, The Ledger your logs in the order you watched them, and The Physical Archive the copies on your shelf. Your <strong>Taste DNA</strong> is drawn from your autopsies.</p>
                            </div>

                            <div className="hb-item">
                                <h3>The Vault</h3>
                                <p>A private note on each viewing of a film, seen by you alone. Writing one is an Archivist privilege; reading and removing your own never is.</p>
                            </div>

                            <div className="hb-item">
                                <h3>The Society</h3>
                                <p>The ranks — Cinephile, Archivist and Auteur — and what each one opens.</p>
                            </div>
                        </div>

                    </motion.div>
                </motion.div>
            )}

        </AnimatePresence>
        </Portal>
    )
}
