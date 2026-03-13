import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, X } from 'lucide-react'

export default function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState(null)
    const [showPrompt, setShowPrompt] = useState(false)

    useEffect(() => {
        const handler = (e) => {
            e.preventDefault()
            setDeferredPrompt(e)
            const timer = setTimeout(() => setShowPrompt(true), 5000)
            return () => clearTimeout(timer)
        }

        // ── Fix #7: clean up both listeners on unmount ──
        const onInstalled = () => {
            setDeferredPrompt(null)
            setShowPrompt(false)
        }

        window.addEventListener('beforeinstallprompt', handler)
        window.addEventListener('appinstalled', onInstalled)

        return () => {
            window.removeEventListener('beforeinstallprompt', handler)
            window.removeEventListener('appinstalled', onInstalled)
        }
    }, [])

    const handleInstall = async () => {
        if (!deferredPrompt) return

        // Hide the prompt immediately
        setShowPrompt(false)

        // Show the install prompt
        deferredPrompt.prompt()

        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice
        console.log(`User response to the install prompt: ${outcome}`)

        // We've used the prompt, and can't use it again, throw it away
        setDeferredPrompt(null)
    }

    if (!showPrompt) return null

    return (
        <AnimatePresence>
            <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                style={{
                    position: 'fixed',
                    bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
                    right: '1rem',
                    maxWidth: 340,
                    zIndex: 8900, // below mobile menu (9000) and back-to-top (9000)
                    background: 'var(--ink)',
                    border: '1px solid var(--sepia)',
                    borderLeft: '4px solid var(--flicker)',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
                    borderRadius: 'var(--radius-card)',
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                }}
            >
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--parchment)', marginBottom: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        The Archive Awaits
                    </div>
                    <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.75rem', color: 'var(--fog)', fontStyle: 'italic' }}>
                        Install The ReelHouse Society as a native app.
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    <button
                        onClick={handleInstall}
                        className="btn btn-primary"
                        style={{ padding: '0.5rem 0.75rem', fontSize: '0.65rem' }}
                    >
                        <Download size={14} style={{ marginRight: '0.3rem' }} /> INSTALL
                    </button>
                    <button
                        onClick={() => setShowPrompt(false)}
                        style={{ background: 'none', border: 'none', color: 'var(--fog)', padding: '0.25rem', minWidth: 32, minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <X size={18} />
                    </button>
                </div>
            </motion.div>
        </AnimatePresence>
    )
}
