import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Users, Bell, Settings } from 'lucide-react'
import { useAuthStore, useUIStore } from '../../store'
import Buster from '../Buster'

const NAV_LINKS = [
    { path: '/', label: 'The Lobby' },
    { path: '/discover', label: 'The Darkroom' },
    { path: '/feed', label: 'The Reel' },
    { path: '/dispatch', label: 'The Dispatch' },
    { path: '/lists', label: 'The Stacks' },
    { path: '/cinemas', label: 'The Cinemas' },
    { path: '/society', label: 'The Society' },
]

export default function MobileNavDrawer({ isOpen, onClose, onOpenNotifications }: { isOpen: boolean; onClose: () => void; onOpenNotifications?: () => void }) {
    const user = useAuthStore(state => state.user)
    const isAuthenticated = useAuthStore(state => state.isAuthenticated)
    const openLogModal = useUIStore(state => state.openLogModal)
    const openSignupModal = useUIStore(state => state.openSignupModal)
    const openHandbook = useUIStore(state => state.openHandbook)

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="mobile-menu"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                    <button
                        className="nav-icon-btn"
                        onClick={onClose}
                        style={{ position: 'absolute', top: '1.5rem', right: '1.5rem' }}
                    >
                        <X size={24} />
                    </button>
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.1, type: 'spring' as const, damping: 15, stiffness: 200 }}
                    >
                        <Buster size={80} mood="smiling" />
                    </motion.div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' }}>
                        {NAV_LINKS.map(({ path, label }, i) => (
                            <motion.div
                                key={path}
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.15 + i * 0.06, type: 'spring' as const, damping: 20, stiffness: 120 }}
                            >
                                <Link to={path} className="mobile-nav-link" onClick={onClose}>
                                    {label}
                                </Link>
                            </motion.div>
                        ))}

                        {isAuthenticated ? (
                            <>
                                <div style={{ width: '40px', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(139,105,20,0.4), transparent)', margin: '0.5rem 0' }} />
                                <Link to={`/user/${user?.username}`} className="mobile-nav-link" onClick={onClose} style={{ fontSize: '1.2rem', color: 'var(--bone)' }}>
                                    My Profile
                                </Link>
                                {onOpenNotifications && (
                                    <button
                                        className="mobile-nav-link"
                                        onClick={() => { onOpenNotifications(); onClose() }}
                                        style={{ color: 'var(--sepia)', background: 'none', border: 'none', padding: 0, fontFamily: 'var(--font-ui)', letterSpacing: '0.15em', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
                                    >
                                        <Bell size={14} /> TRANSMISSIONS
                                    </button>
                                )}
                                <Link to="/settings" className="mobile-nav-link" onClick={onClose} style={{ fontSize: '1.2rem', color: 'var(--fog)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Settings size={14} /> Settings
                                </Link>
                                <button className="btn btn-primary" onClick={() => { openLogModal(); onClose() }}>
                                    + Log a Film
                                </button>
                            </>
                        ) : (
                            <button
                                className="btn btn-primary"
                                onClick={() => { openSignupModal('cinephile'); onClose() }}
                                style={{ marginTop: '1rem' }}
                            >
                                Enter The House
                            </button>
                        )}

                        {/* Mobile Handbook Link */}
                        <div style={{ width: '40px', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(139,105,20,0.4), transparent)', margin: '0.5rem 0' }} />
                        <button
                            className="mobile-nav-link"
                            onClick={() => { openHandbook(); onClose() }}
                            style={{ color: 'var(--sepia)', background: 'none', border: 'none', padding: 0, fontFamily: 'var(--font-ui)', letterSpacing: '0.15em' }}
                        >
                            SOCIETY HANDBOOK
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
