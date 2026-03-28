import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import Buster from '../components/Buster'
import PageSEO from '../components/PageSEO'

export default function CinemasPage() {
    return (
        <div style={{ minHeight: '100dvh', paddingTop: '120px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--ink)', position: 'relative', overflow: 'hidden' }}>
            <PageSEO title="The Cinemas — Coming Soon" description="The Atlas of Temples is under construction." />
            {/* Atmospheric glow */}
            <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', height: '60%', background: 'radial-gradient(ellipse at top, rgba(139,105,20,0.09) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />
            
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                style={{ textAlign: 'center', maxWidth: 600, padding: '2rem' }}
            >
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem', opacity: 0.8 }}>
                    <Buster size={120} mood="peeking" />
                </div>
                
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.4em', color: 'var(--sepia)', marginBottom: '1rem' }}>
                    THE ATLAS OF TEMPLES
                </div>
                
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.5rem, 6vw, 4rem)', color: 'var(--parchment)', lineHeight: 1, marginBottom: '1.5rem' }}>
                    Coming Soon
                </h1>
                
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '1rem', color: 'var(--fog)', lineHeight: 1.6, marginBottom: '3rem' }}>
                    We are currently building the global registry of independent cinemas.<br/>Our scouts are mapping the projection rooms and curating the perfect architectural temples for the archive.<br/><br/>The doors remain locked, for now.
                </p>

                <Link to="/" className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', padding: '0.8rem 2rem' }}>
                    <ArrowLeft size={16} /> Return to Lobby
                </Link>
            </motion.div>
        </div>
    )
}
