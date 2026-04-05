/**
 * ModalShell — Reusable modal container with Nitrate Noir styling.
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides:
 *  • Backdrop with blur + click-to-close
 *  • Centered card with spring animation
 *  • Escape key to close
 *  • Focus trap (optional)
 *  • Android hardware back support (optional)
 *  • Portal rendering
 *  • Consistent z-index layering
 *
 * Usage:
 *   <ModalShell open={isOpen} onClose={handleClose} maxWidth={500}>
 *       <h2>My Modal Content</h2>
 *   </ModalShell>
 */

import { useEffect, useCallback, useRef, type ReactNode, type CSSProperties } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Portal } from './UI'

interface ModalShellProps {
    /** Whether the modal is visible */
    open: boolean
    /** Called when the user requests to close (backdrop click, Escape, etc.) */
    onClose: () => void
    /** Modal content */
    children: ReactNode
    /** Maximum width of the modal card (default 480) */
    maxWidth?: number
    /** z-index for the overlay (default 10000) */
    zIndex?: number
    /** Whether to enable focus trapping (default false — opt-in for accessibility) */
    trapFocus?: boolean
    /** Additional styles for the card container */
    cardStyle?: CSSProperties
    /** Additional className for the card */
    cardClassName?: string
    /** If true, card has no default padding (useful for custom layouts) */
    noPadding?: boolean
    /** Whether to use the Portal wrapper (default true) */
    usePortal?: boolean
}

// Spring animation config — consistent across all modals
const BACKDROP_VARIANTS = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
}

const CARD_VARIANTS = {
    hidden: { opacity: 0, scale: 0.95, y: 20 },
    visible: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: 15 },
}

const SPRING_TRANSITION = {
    type: 'spring' as const,
    damping: 28,
    stiffness: 320,
}

export default function ModalShell({
    open,
    onClose,
    children,
    maxWidth = 480,
    zIndex = 10000,
    trapFocus = false,
    cardStyle,
    cardClassName,
    noPadding = false,
    usePortal = true,
}: ModalShellProps) {
    const cardRef = useRef<HTMLDivElement>(null)

    // ── Escape key ──
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
            }
        },
        [onClose]
    )

    useEffect(() => {
        if (!open) return
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [open, handleKeyDown])

    // ── Optional focus trap ──
    useEffect(() => {
        if (!open || !trapFocus || !cardRef.current) return

        const focusable = cardRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length === 0) return

        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        const trapHandler = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return
            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault()
                    last.focus()
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault()
                    first.focus()
                }
            }
        }

        // Auto-focus first element
        first.focus()

        document.addEventListener('keydown', trapHandler)
        return () => document.removeEventListener('keydown', trapHandler)
    }, [open, trapFocus])

    // ── Body scroll lock ──
    useEffect(() => {
        if (!open) return
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = prev
        }
    }, [open])

    const content = (
        <AnimatePresence>
            {open && (
                <motion.div
                    variants={BACKDROP_VARIANTS}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={{ duration: 0.2 }}
                    onClick={onClose}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex,
                        background: 'rgba(5, 3, 1, 0.88)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem',
                    }}
                >
                    <motion.div
                        ref={cardRef}
                        variants={CARD_VARIANTS}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        transition={SPRING_TRANSITION}
                        onClick={(e) => e.stopPropagation()}
                        className={cardClassName}
                        style={{
                            background: 'var(--ink, #0a0703)',
                            border: '1px solid rgba(139, 105, 20, 0.25)',
                            borderRadius: '6px',
                            maxWidth,
                            width: '100%',
                            maxHeight: '90vh',
                            overflowY: 'auto',
                            boxShadow:
                                '0 40px 100px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(139, 105, 20, 0.15)',
                            scrollbarWidth: 'thin',
                            scrollbarColor: 'var(--ash) transparent',
                            ...(noPadding ? {} : { padding: '1.5rem' }),
                            ...cardStyle,
                        }}
                    >
                        {children}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )

    if (usePortal) {
        return <Portal>{content}</Portal>
    }

    return content
}
