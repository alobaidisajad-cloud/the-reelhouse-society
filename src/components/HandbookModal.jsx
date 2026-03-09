import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore } from '../store'

const IconClose = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
)

export default function HandbookModal() {
    const { handbookOpen, closeHandbook } = useUIStore()

    return (
        <AnimatePresence>
            {handbookOpen && (
                <motion.div
                    className="handbook-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={closeHandbook}
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
                                <h3>The Pulse</h3>
                                <p>The live cardiovascular system of the community. See what other devotees are logging in real-time.</p>
                            </div>

                            <div className="hb-item">
                                <h3>The Dark Room</h3>
                                <p>Our expansive discovery engine. Step inside to develop films by emotional resonance, decade, genre, and aesthetic mood.</p>
                            </div>

                            <div className="hb-item">
                                <h3>The Ticket Booth</h3>
                                <p>Where films are committed to the archive. Home to the <strong>Autopsy Engine</strong>: a tool for evaluating the architectural (story), aesthetic (visual), and aural (sound) dimensions of cinema.</p>
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

            <style>{`
                .handbook-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 9999;
                    background: rgba(5, 3, 1, 0.85); /* Deep 'ink' tint */
                    backdrop-filter: blur(8px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 1rem;
                }

                .handbook-content {
                    background: #110E0C; /* Dark, rich paper */
                    width: 100%;
                    max-width: 600px;
                    border: 1px solid rgba(139, 105, 20, 0.3); /* Sepia edge */
                    border-radius: 4px;
                    padding: 3rem;
                    position: relative;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
                    max-height: 90vh;
                    overflow-y: auto;
                }

                /* Custom Scrollbar for Handbook */
                .handbook-content::-webkit-scrollbar { width: 6px; }
                .handbook-content::-webkit-scrollbar-track { background: transparent; }
                .handbook-content::-webkit-scrollbar-thumb { background: rgba(139, 105, 20, 0.3); border-radius: 3px; }

                .handbook-close {
                    position: absolute;
                    top: 1.5rem;
                    right: 1.5rem;
                    background: none;
                    border: none;
                    color: var(--sepia);
                    opacity: 0.5;
                    cursor: pointer;
                    transition: opacity 0.2s, transform 0.2s;
                }
                .handbook-close:hover {
                    opacity: 1;
                    transform: scale(1.1);
                }

                .handbook-header {
                    text-align: center;
                    margin-bottom: 3rem;
                    border-bottom: 1px dashed rgba(139, 105, 20, 0.2);
                    padding-bottom: 2rem;
                }

                .hb-badge {
                    font-family: var(--font-ui);
                    font-size: 0.7rem;
                    letter-spacing: 0.3em;
                    color: var(--sepia);
                    opacity: 0.8;
                    margin-bottom: 1rem;
                }

                .hb-title {
                    font-family: var(--font-display);
                    font-size: 3.5rem;
                    color: var(--parchment);
                    line-height: 1;
                    margin-bottom: 0.5rem;
                }

                .hb-subtitle {
                    font-family: 'Georgia', serif;
                    font-style: italic;
                    color: var(--bone);
                    opacity: 0.6;
                    font-size: 1.1rem;
                }

                .handbook-grid {
                    display: flex;
                    flex-direction: column;
                    gap: 2rem;
                }

                .hb-item {
                    padding-left: 1.5rem;
                    border-left: 2px solid rgba(139, 105, 20, 0.2);
                }

                .hb-item h3 {
                    font-family: var(--font-display);
                    font-size: 1.5rem;
                    color: var(--parchment);
                    margin-bottom: 0.5rem;
                    letter-spacing: 0.05em;
                }

                .hb-item p {
                    font-family: var(--font-body);
                    font-size: 1.05rem;
                    line-height: 1.6;
                    color: var(--bone);
                    opacity: 0.8;
                }
                .hb-item p strong {
                    color: var(--sepia);
                    font-weight: normal;
                }
                
                @media (max-width: 600px) {
                    .handbook-content { padding: 2rem 1.5rem; }
                    .hb-title { font-size: 2.8rem; }
                }
            `}</style>
        </AnimatePresence>
    )
}
