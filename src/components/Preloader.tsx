import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function Preloader({ onComplete }: { onComplete: () => void }) {
    const [count, setCount] = useState(3)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (count > 0) {
            const timer = setTimeout(() => setCount(count - 1), 200)
            return () => clearTimeout(timer)
        } else {
            const timer = setTimeout(() => setLoading(false), 200)
            return () => clearTimeout(timer)
        }
    }, [count])

    return (
        <AnimatePresence onExitComplete={onComplete}>
            {loading && (
                <motion.div
                    exit={{ opacity: 0 }}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 100000,
                        background: 'var(--ink)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden'
                    }}
                >
                    {/* Circle frame */}
                    <div style={{
                        width: '300px',
                        height: '300px',
                        border: '2px solid var(--sepia)',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative'
                    }}>
                        {/* Spinning hair line */}
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                width: '150px',
                                height: '1px',
                                background: 'rgba(139,105,20,0.4)',
                                transformOrigin: 'left center'
                            }}
                        />

                        {/* Crosshair */}
                        <div style={{ position: 'absolute', top: '50%', left: -20, right: -20, height: '1px', background: 'rgba(139,105,20,0.2)' }} />
                        <div style={{ position: 'absolute', left: '50%', top: -20, bottom: -20, width: '1px', background: 'rgba(139,105,20,0.2)' }} />

                        <motion.div
                            key={count}
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            style={{
                                fontFamily: 'var(--font-display)',
                                fontSize: '8rem',
                                color: 'var(--parchment)',
                                textShadow: '0 0 30px rgba(232,223,200,0.5)'
                            }}
                        >
                            {count > 0 ? count : '●'}
                        </motion.div>
                    </div>

                    <div style={{
                        marginTop: '2rem',
                        fontFamily: 'var(--font-ui)',
                        fontSize: '0.7rem',
                        letterSpacing: '0.4em',
                        color: 'var(--sepia)'
                    }}>
                        THREADING PROJECTOR...
                    </div>

                    {/* Film burn flash on exit */}
                    {count === 0 && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0, 1, 0] }}
                            transition={{ duration: 0.5 }}
                            style={{
                                position: 'absolute',
                                inset: 0,
                                background: 'var(--flicker)',
                                zIndex: 100001
                            }}
                        />
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    )
}
