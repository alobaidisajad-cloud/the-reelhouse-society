import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store'
import { FileSearch, ShieldCheck, Film, ArrowRight, CheckCircle2 } from 'lucide-react'

export default function BootcampModal() {
    const { user, updateUser } = useAuthStore()
    const [step, setStep] = useState(0)

    if (!user || user.hasCompletedBootcamp) return null

    const finishBootcamp = () => {
        updateUser({ hasCompletedBootcamp: true })
    }

    const nextStep = () => {
        if (step < 2) setStep(step + 1)
        else finishBootcamp()
    }

    const steps = [
        {
            title: "WELCOME TO THE REELHOUSE",
            subtitle: "Declassifying the Jargon",
            icon: <FileSearch size={32} color="var(--sepia)" />,
            text: "The ReelHouse Society operates differently. Here is your translation manual:\n\n• THE AUTOPSY: A deep-dive analytical review.\n• THE VAULT: Your private sequence of unseen films.\n• PHYSICAL MEDIA: Track your 4K, Blu-Ray, and VHS archive.\n• DOSSIER: A film's complete classified intel."
        },
        {
            title: "THE INTELLIGENCE NETWORK",
            subtitle: "Not a Social Media Platform",
            icon: <ShieldCheck size={32} color="var(--sepia)" />,
            text: "We don't do 'likes' or 'retweets'. You 'Endorse' a log or attach a 'Dossier Note'.\n\nYour profile is an archive, not a billboard. Follow trusted Devotees to curate your intelligence feed."
        },
        {
            title: "PREMIUM CLEARANCE",
            subtitle: "The Archivist Tier",
            icon: <Film size={32} color="var(--sepia)" />,
            text: "The ReelHouse Society is ad-free by design. Power users can upgrade to the 'Archivist' or 'Auteur' tiers to unlock advanced radar charts, venue check-ins, and physical media tracking.\n\nYou are clear to proceed."
        }
    ]

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ position: 'fixed', inset: 0, background: 'rgba(10, 7, 3, 0.95)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(8px)' }}
            >
                <motion.div
                    key={step}
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 1.05, opacity: 0, y: -20 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    style={{ background: 'var(--ink)', border: '1px solid var(--sepia)', borderRadius: '4px', maxWidth: 500, width: '100%', padding: '2.5rem 2rem', position: 'relative', boxShadow: '0 0 40px rgba(139,105,20,0.15)' }}
                >
                    {/* Progress Pips */}
                    <div style={{ display: 'flex', gap: '0.5rem', position: 'absolute', top: '1.5rem', left: '2rem' }}>
                        {[0, 1, 2].map(i => (
                            <div key={i} style={{ width: 12, height: 4, background: i <= step ? 'var(--sepia)' : 'var(--ash)', borderRadius: 2 }} />
                        ))}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: '1.5rem' }}>
                        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(139,105,20,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem', border: '1px solid var(--sepia)' }}>
                            {steps[step].icon}
                        </div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--fog)', marginBottom: '0.5rem' }}>
                            {steps[step].subtitle.toUpperCase()}
                        </div>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--parchment)', marginBottom: '1rem', lineHeight: 1.1 }}>
                            {steps[step].title}
                        </h2>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--bone)', lineHeight: 1.6, whiteSpace: 'pre-line', textAlign: 'left', background: 'var(--soot)', padding: '1.5rem', borderRadius: '4px', borderLeft: '2px solid var(--ash)', width: '100%' }}>
                            {steps[step].text}
                        </div>
                    </div>

                    <div style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                        <button onClick={finishBootcamp} style={{ background: 'none', border: 'none', color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', cursor: 'pointer' }}>
                            SKIP BRIEFING
                        </button>
                        <button className="btn btn-primary" onClick={nextStep} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {step < 2 ? (
                                <>PROCEED <ArrowRight size={14} /></>
                            ) : (
                                <>ACKNOWLEDGED <CheckCircle2 size={14} /></>
                            )}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
