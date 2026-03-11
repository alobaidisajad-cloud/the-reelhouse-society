import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuthStore } from '../store'
import { motion } from 'framer-motion'
import { CheckCircle2, XCircle, Loader } from 'lucide-react'

// ── AUTH CALLBACK PAGE ──
// Supabase sends users here after clicking the confirmation email link.
// URL format: /auth/callback?token_hash=xxx&type=signup
export default function AuthCallbackPage() {
    const navigate = useNavigate()
    const [status, setStatus] = useState('verifying') // verifying | success | error
    const [errorMsg, setErrorMsg] = useState('')

    useEffect(() => {
        async function handleCallback() {
            try {
                const params = new URLSearchParams(window.location.search)
                const tokenHash = params.get('token_hash')
                const type = params.get('type') // 'signup' | 'recovery' | 'email_change'

                // Supabase PKCE flow — exchange the token for a real session
                if (tokenHash && type) {
                    const { data, error } = await supabase.auth.verifyOtp({
                        token_hash: tokenHash,
                        type,
                    })
                    if (error) throw error

                    if (data?.session) {
                        // Fetch the user profile and set auth state
                        const { data: profile } = await supabase
                            .from('profiles')
                            .select('*')
                            .eq('id', data.session.user.id)
                            .single()

                        useAuthStore.setState({
                            user: { ...data.session.user, ...profile },
                            isAuthenticated: true,
                        })

                        // Hydrate user data in the background
                        const [films, content] = await Promise.all([
                            import('../stores/films'),
                            import('../stores/content'),
                        ])
                        Promise.all([
                            films.useFilmStore.getState().fetchLogs(),
                            films.useFilmStore.getState().fetchWatchlist(),
                            films.useFilmStore.getState().fetchVault(),
                            films.useFilmStore.getState().fetchLists(),
                            content.useProgrammeStore.getState().fetchProgrammes(),
                        ])

                        setStatus('success')
                        setTimeout(() => navigate('/'), 2000)
                    }
                } else {
                    // Fallback: try to get session from current URL hash (legacy flow)
                    const { data: sessionData } = await supabase.auth.getSession()
                    if (sessionData?.session) {
                        setStatus('success')
                        setTimeout(() => navigate('/'), 2000)
                    } else {
                        throw new Error('No valid token found in this link. It may have expired.')
                    }
                }
            } catch (err) {
                setErrorMsg(err.message || 'Verification failed. The link may have expired.')
                setStatus('error')
            }
        }

        handleCallback()
    }, [navigate])

    return (
        <div style={{
            minHeight: '100vh', background: 'var(--ink)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '2rem',
        }}>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                style={{
                    background: 'var(--soot)', border: '1px solid var(--ash)',
                    borderRadius: '4px', padding: '3rem 2rem', maxWidth: 440,
                    width: '100%', textAlign: 'center',
                    boxShadow: '0 0 40px rgba(139,105,20,0.1)',
                }}
            >
                {status === 'verifying' && (
                    <>
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                            style={{ display: 'inline-flex', marginBottom: '1.5rem' }}
                        >
                            <Loader size={40} color="var(--sepia)" />
                        </motion.div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.75rem' }}>
                            VERIFYING CLEARANCE
                        </div>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--parchment)', lineHeight: 1.1 }}>
                            Decrypting your dossier...
                        </h2>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <motion.div
                            initial={{ scale: 0 }} animate={{ scale: 1 }}
                            transition={{ type: 'spring', damping: 18, stiffness: 300 }}
                            style={{ display: 'inline-flex', marginBottom: '1.5rem' }}
                        >
                            <CheckCircle2 size={48} color="var(--sepia)" />
                        </motion.div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.75rem' }}>
                            CLEARANCE GRANTED
                        </div>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '1rem' }}>
                            Welcome to The Society.
                        </h2>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--bone)', lineHeight: 1.6 }}>
                            Your identity has been verified. Initiating access...
                        </p>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <div style={{ display: 'inline-flex', marginBottom: '1.5rem' }}>
                            <XCircle size={48} color="var(--blood-reel)" />
                        </div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--blood-reel)', marginBottom: '0.75rem' }}>
                            VERIFICATION FAILED
                        </div>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '1rem' }}>
                            Link Expired or Invalid
                        </h2>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--fog)', lineHeight: 1.6, marginBottom: '2rem' }}>
                            {errorMsg}
                        </p>
                        <button
                            className="btn btn-primary"
                            onClick={() => navigate('/')}
                            style={{ width: '100%', justifyContent: 'center' }}
                        >
                            Return to The Lobby
                        </button>
                    </>
                )}
            </motion.div>
        </div>
    )
}
