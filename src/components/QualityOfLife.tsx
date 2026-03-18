import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUp, WifiOff } from 'lucide-react'
import { useUIStore } from '../store'

export default function QualityOfLife() {
    const [showBackToTop, setShowBackToTop] = useState(false)
    const [isOffline, setIsOffline] = useState(false)
    const openLogModal = useUIStore(state => state.openLogModal)

    useEffect(() => {
        // 1. Back to Top Visibility Tracker
        const handleScroll = () => {
            if (window.scrollY > 500) {
                setShowBackToTop(true)
            } else {
                setShowBackToTop(false)
            }
        }
        window.addEventListener('scroll', handleScroll, { passive: true })

        // 2. Network Status Tracker
        const handleOffline = () => setIsOffline(true)
        const handleOnline = () => setIsOffline(false)
        if (!navigator.onLine) setIsOffline(true)
        window.addEventListener('offline', handleOffline)
        window.addEventListener('online', handleOnline)

        // 3. Global Hotkeys Tracker
        const handleKeyDown = (e: any) => {
            // Ignore keystrokes if the user is typing in an input or textarea
            if (['INPUT', 'TEXTAREA'].includes((document.activeElement as any)?.tagName)) return

            // L -> Quick Log Film
            if (e.key === 'l' || e.key === 'L') {
                e.preventDefault()
                openLogModal()
            }

        }
        window.addEventListener('keydown', handleKeyDown)

        return () => {
            window.removeEventListener('scroll', handleScroll)
            window.removeEventListener('offline', handleOffline)
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [openLogModal])

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    return (
        <>
            {/* OFFLINE STATUS BANNER */}
            <AnimatePresence>
                {isOffline && (
                    <motion.div
                        initial={{ y: -50, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -50, opacity: 0 }}
                        style={{
                            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
                            background: 'var(--blood-reel)', color: 'var(--parchment)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '0.4rem', gap: '0.5rem', fontFamily: 'var(--font-ui)',
                            fontSize: '0.65rem', letterSpacing: '0.2em'
                        }}
                    >
                        <WifiOff size={14} /> TRANSMISSION LINK SEVERED — OPERATING ON LOCAL ARCHIVE
                    </motion.div>
                )}
            </AnimatePresence>

            {/* BACK TO TOP FLOATING BUTTON */}
            <AnimatePresence>
                {showBackToTop && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: 20 }}
                        onClick={scrollToTop}
                        className="back-to-top-btn"
                        style={{
                            position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 9000,
                            width: 50, height: 50, borderRadius: '50%',
                            background: 'var(--soot)', border: '1px solid var(--sepia)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--sepia)', cursor: 'pointer',
                            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
                            backdropFilter: 'blur(4px)'
                        }}
                        whileHover={{ scale: 1.1, background: 'var(--ink)' }}
                        whileTap={{ scale: 0.95 }}
                        title="Return to surface"
                    >
                        <ArrowUp size={20} />
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    )
}
