import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Film, Lock, Mail, RefreshCw, Check, AlertCircle, Circle, ArrowLeft } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { useAuthStore } from '../store'
import reelToast from '../utils/reelToast'
import { isDisposableEmail, isValidEmailFormat } from '../utils/disposableEmails'
import { validateUsername } from '../utils/validateUsername'
import { useViewport } from '../hooks/useViewport'
import PageSEO from '../components/PageSEO'

const PERSONAS = [
    { id: 'The Midnight Devotee', desc: 'Haunts 3AM screenings. Darkness is your element.', color: '#5C1A0B' },
    { id: 'The Archivist', desc: 'Catalogues everything. Every film deserves a record.', color: '#8B6914' },
    { id: 'The Weeper', desc: 'Films hit you where it hurts. You enjoy it.', color: '#4A6B8A' },
    { id: 'The Contrarian', desc: 'Loved by critics? You\'re suspicious. Hated? Intrigued.', color: '#6B4A8A' },
    { id: 'The Completionist', desc: 'A director\'s filmography is a mission, not a suggestion.', color: '#1C5C1A' },
]

export default function AuthPage({ mode }: { mode: 'join' | 'login' | 'verify' | 'forgot-password' }) {
    const navigate = useNavigate()
    const location = useLocation()
    const { isTouch } = useViewport()
    const { login, signup, isAuthenticated } = useAuthStore()

    // Redirect if already authenticated
    useEffect(() => {
        if (isAuthenticated) {
            navigate('/', { replace: true })
        }
    }, [isAuthenticated, navigate])

    // ── Form State ──
    const [emailOrUsername, setEmailOrUsername] = useState('')
    const [password, setPassword] = useState('')
    const [username, setUsername] = useState('')
    const [persona, setPersona] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    // ── Username Debounce via AbortController (Elite Math) ──
    const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
    const abortControllerRef = useRef<AbortController | null>(null)
    const usernameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const checkUsernameAvailability = (value: string) => {
        if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current)
        const trimmed = value.trim().toLowerCase().replace(/\s+/g, '_')
        if (trimmed.length < 3) { setUsernameStatus('idle'); return }
        
        setUsernameStatus('checking')
        usernameCheckTimer.current = setTimeout(async () => {
            // Cancel any in-flight request
            if (abortControllerRef.current) {
                abortControllerRef.current.abort()
            }
            abortControllerRef.current = new AbortController()

            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('username')
                    .eq('username', trimmed)
                    .abortSignal(abortControllerRef.current.signal)
                    .maybeSingle()
                
                if (error && error.name !== 'AbortError') throw error
                if (!error) {
                    setUsernameStatus(data ? 'taken' : 'available')
                }
            } catch (err: any) {
                if (err.name !== 'AbortError') {
                    setUsernameStatus('idle')
                }
            }
        }, 300) // Fast, precise debounce
    }

    // ── Password Strength ──
    const passwordChecks = {
        length:    password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number:    /[0-9]/.test(password),
        special:   /[^A-Za-z0-9]/.test(password),
    }
    const passedChecks = Object.values(passwordChecks).filter(Boolean).length
    const passwordStrong = passedChecks === 5
    const strengthLabel = ['', 'WEAK', 'FAIR', 'FAIR', 'STRONG', 'VERY STRONG'][passedChecks]
    const strengthColor = ['', 'var(--blood-reel)', '#c4a000', '#c4a000', 'var(--sepia)', '#4caf50'][passedChecks]

    // ── Verify Mode State ──
    const [resending, setResending] = useState(false)
    const verifyEmail = new URLSearchParams(location.search).get('email') || sessionStorage.getItem('pending_verify_email') || ''
    
    // Auto-poll logic when on /verify
    useEffect(() => {
        if (mode !== 'verify' || !verifyEmail || !password) return
        let cancelled = false
        const poll = setInterval(async () => {
            try {
                const { data, error } = await supabase.auth.signInWithPassword({ email: verifyEmail, password })
                if (!error && data?.session && !cancelled) {
                    clearInterval(poll)
                    const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.session.user.id).single()
                    useAuthStore.setState({ user: { ...data.session.user, ...profile, following: [] } as any, isAuthenticated: true })
                    reelToast.success(`Welcome to The ReelHouse Society! 🎬`)
                    navigate('/')
                }
            } catch { /* Silent retry */ }
        }, 5000)
        return () => { cancelled = true; clearInterval(poll) }
    }, [mode, verifyEmail, password, navigate])

    // ── Forgot Password State ──
    const [forgotSent, setForgotSent] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (mode === 'forgot-password') {
            if (!emailOrUsername.trim()) { reelToast.error('Please enter your email.'); return }
            setSubmitting(true)
            try {
                const { error } = await supabase.auth.resetPasswordForEmail(emailOrUsername.trim(), {
                    redirectTo: `${window.location.origin}/auth/reset-password`,
                })
                if (error) throw error
                setForgotSent(true)
                reelToast.success('Reset link sent!')
            } catch (err: any) {
                reelToast.error(err.message || 'Could not send reset link.')
            } finally {
                setSubmitting(false)
            }
            return
        }

        if (!emailOrUsername || !password || (mode === 'join' && !username)) {
            reelToast.error('Please fill all required fields.')
            return
        }

        if (mode === 'join' && usernameStatus === 'taken') {
            reelToast.error('That username is already taken. Choose another.')
            return
        }

        setSubmitting(true)

        try {
            if (mode === 'login') {
                let loginEmail = emailOrUsername.trim()
                if (!loginEmail.includes('@')) {
                    const lookupUsername = loginEmail.toLowerCase().replace(/\\s+/g, '_')
                    const { data: resolvedEmail, error: rpcError } = await supabase.rpc('get_email_by_username', { lookup_username: lookupUsername })
                    if (rpcError || !resolvedEmail) {
                        reelToast.error('No account found with that username.')
                        setSubmitting(false)
                        return
                    }
                    loginEmail = resolvedEmail
                } else if (!isValidEmailFormat(loginEmail)) {
                    reelToast.error('Please enter a valid email address.')
                    setSubmitting(false)
                    return
                }
                
                await login(loginEmail, password)
                reelToast.success('Welcome back to the House.')
                navigate('/')
            } else {
                const signupEmail = emailOrUsername.trim()
                if (!isValidEmailFormat(signupEmail)) { reelToast.error('Please enter a valid email.'); return }
                if (isDisposableEmail(signupEmail)) { reelToast.error('Disposable emails are not permitted.'); return }
                if (!passwordStrong) { reelToast.error('Password does not meet security requirements.'); return }
                // The handle rules live in validateUsername — the same file the mobile
                // app uses — and signup now actually runs them. What was here before
                // was the only cleaning the web ever did, and it did almost nothing:
                // `/\\s+/g` matches a literal backslash followed by "s", not
                // whitespace, so spaces were never replaced; nothing checked the
                // charset at all. That is how an email address became a username.
                const usernameCheck = validateUsername(username)
                if (!usernameCheck.valid) { reelToast.error(usernameCheck.error || 'Please choose a different username.'); return }
                const formattedUsername = usernameCheck.sanitized

                const result = await signup(signupEmail, password, formattedUsername, 'cinephile', persona)

                if (result?.session) {
                    reelToast.success(`Welcome to The ReelHouse Society, ${formattedUsername}! 🎬`)
                    navigate('/')
                } else {
                    sessionStorage.setItem('pending_verify_email', signupEmail)
                    navigate(`/verify?email=${encodeURIComponent(signupEmail)}`)
                }
            }
        } catch (error: any) {
            let msg = error.message || 'Authentication failed.'
            if (msg.includes('Database error saving new user')) msg = 'Username is already taken. Choose another.'
            reelToast.error(msg)
        } finally {
            setSubmitting(false)
        }
    }

    const handleResend = async () => {
        if (!verifyEmail) return
        setResending(true)
        try {
            const { error } = await supabase.auth.resend({ type: 'signup', email: verifyEmail })
            if (error) throw error
            reelToast.success('New verification link sent!')
        } catch {
            reelToast.error('Could not resend. Please try again.')
        } finally {
            setResending(false)
        }
    }

    const pageTitle = {
        join: 'Admit One',
        login: 'Sign In',
        verify: 'Check Inbox',
        'forgot-password': 'Password Recovery'
    }[mode]

    return (
        <div style={{
            minHeight: '100dvh', background: 'var(--ink)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '2rem 1rem',
            position: 'relative',
        }}>
            <PageSEO title={pageTitle} />
            
            {/* Immersive background aura */}
            <div style={{
                position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
                background: `radial-gradient(ellipse 50% 40% at 50% 45%, rgba(139, 105, 20, 0.04), transparent)`,
            }} />

            <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="scanlines"
                style={{
                    background: 'radial-gradient(ellipse at center top, rgba(139, 105, 20, 0.05), transparent 60%), var(--soot)',
                    border: '1px solid rgba(139, 105, 20, 0.25)',
                    borderRadius: 'var(--radius-card)',
                    width: '100%', maxWidth: 440,
                    boxShadow: '0 0 40px rgba(139,105,20,0.08)',
                    position: 'relative', zIndex: 1,
                    overflow: 'hidden'
                }}
            >
                {/* Mode specific Header */}
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(139, 105, 20, 0.15)' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.2rem' }}>
                        {mode === 'join' && 'ADMIT ONE'}
                        {mode === 'login' && 'RETURNING PATRON'}
                        {mode === 'verify' && 'CLEARANCE PENDING'}
                        {mode === 'forgot-password' && 'CREDENTIAL RECOVERY'}
                    </div>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--parchment)' }}>
                        {mode === 'join' && 'Enter The House'}
                        {mode === 'login' && 'Sign Back In'}
                        {mode === 'verify' && 'Check Your Inbox'}
                        {mode === 'forgot-password' && (forgotSent ? 'Link Sent' : 'Reset Password')}
                    </h3>
                    {mode === 'login' && (
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)', fontStyle: 'italic', marginTop: '0.35rem', opacity: 0.7 }}>
                            The House remembers its own.
                        </p>
                    )}
                </div>

                <div style={{ height: '1px', background: 'linear-gradient(to right, transparent, rgba(139,105,20,0.2), transparent)' }} />

                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <AnimatePresence mode="wait">
                        {mode === 'verify' ? (
                            <motion.div key="verify" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ textAlign: 'center' }}>
                                <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }} style={{ display: 'inline-flex', marginBottom: '1.5rem', background: 'rgba(139,105,20,0.1)', padding: '1.25rem', borderRadius: '50%', border: '1px solid var(--sepia)', animation: 'breatheGlow 3s ease-in-out infinite' }}>
                                    <Mail size={32} color="var(--sepia)" />
                                </motion.div>
                                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--bone)', lineHeight: 1.6, marginBottom: '0.5rem' }}>We sent a classified verification link to:</p>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.75rem', letterSpacing: '0.08em', color: 'var(--flicker)', background: 'var(--ink)', padding: '0.6rem 1rem', borderRadius: '2px', border: '1px solid var(--ash)', marginBottom: '1.5rem', wordBreak: 'break-all' }}>{verifyEmail}</div>
                                <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.08em', color: 'var(--fog)', lineHeight: 1.7, marginBottom: '2rem' }}>
                                    CLICK THE LINK IN YOUR EMAIL TO COMPLETE YOUR ENROLLMENT.<br />
                                    CHECK YOUR SPAM FOLDER IF IT DOESN'T ARRIVE WITHIN 2 MINUTES.
                                </p>
                                <button onClick={handleResend} disabled={resending} style={{ background: 'none', border: '1px solid var(--ash)', color: resending ? 'var(--fog)' : 'var(--bone)', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', cursor: resending ? 'default' : 'pointer', padding: '0.6rem 1.25rem', borderRadius: '2px', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', transition: 'all 0.2s' }}>
                                    <RefreshCw size={12} style={{ animation: resending ? 'spin 1s linear infinite' : 'none' }} />
                                    {resending ? 'SENDING...' : 'RESEND LINK'}
                                </button>
                                <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.08em', color: 'var(--fog)', marginTop: '1.5rem', opacity: 0.6 }}>THIS PAGE WILL AUTOMATICALLY LOG YOU IN ONCE CONFIRMED.</p>
                            </motion.div>
                        ) : mode === 'forgot-password' ? (
                            <motion.div key="forgot" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                {forgotSent ? (
                                    <div style={{ textAlign: 'center' }}>
                                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--bone)', lineHeight: 1.6, marginBottom: '0.5rem' }}>We sent a password reset link to:</p>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.75rem', letterSpacing: '0.08em', color: 'var(--flicker)', background: 'var(--ink)', padding: '0.6rem 1rem', borderRadius: '2px', border: '1px solid var(--ash)', marginBottom: '1.5rem', wordBreak: 'break-all' }}>{emailOrUsername}</div>
                                        <Link to="/login" style={{ background: 'none', border: '1px solid var(--ash)', color: 'var(--bone)', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', padding: '0.6rem 1.25rem', borderRadius: '2px', textDecoration: 'none', display: 'inline-block' }}>BACK TO SIGN IN</Link>
                                    </div>
                                ) : (
                                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--fog)', lineHeight: 1.6, marginBottom: '1rem', textAlign: 'center' }}>Enter your email and we'll send you a classified reset link.</p>
                                        <input className="input" placeholder="Email address" type="email" value={emailOrUsername} onChange={e => setEmailOrUsername(e.target.value)} autoFocus style={{ textAlign: 'center' }} />
                                        <button className="btn btn-primary" type="submit" disabled={submitting} style={{ padding: '0.7em', opacity: submitting ? 0.6 : 1, width: '100%', justifyContent: 'center' }}>
                                            {submitting ? 'SENDING...' : 'SEND RESET LINK'}
                                        </button>
                                        <Link to="/login" style={{ marginTop: '1rem', textAlign: 'center', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>BACK TO SIGN IN</Link>
                                    </form>
                                )}
                            </motion.div>
                        ) : (
                            <motion.form key="main-form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <input className="input" placeholder={mode === 'login' ? 'Email or Username' : 'Email address'} type={mode === 'login' ? 'text' : 'email'} autoComplete={mode === 'login' ? 'username' : 'email'} value={emailOrUsername} onChange={(e) => setEmailOrUsername(e.target.value)} />
                                
                                {mode === 'join' && (
                                    <div style={{ position: 'relative' }}>
                                        <input className="input" placeholder="Username / Handle" autoComplete="username" value={username} onChange={(e) => { setUsername(e.target.value); checkUsernameAvailability(e.target.value); }} style={{ width: '100%', paddingRight: '2.5rem', boxSizing: 'border-box' }} />
                                        {usernameStatus !== 'idle' && (
                                            <span style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
                                                {usernameStatus === 'checking' && <RefreshCw size={14} color="var(--fog)" style={{ animation: 'spin 1s linear infinite' }} />}
                                                {usernameStatus === 'available' && <Check size={14} color="#4caf50" />}
                                                {usernameStatus === 'taken' && <AlertCircle size={14} color="var(--blood-reel)" />}
                                            </span>
                                        )}
                                    </div>
                                )}

                                <div style={{ position: 'relative' }}>
                                    <input className="input" placeholder="Password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', paddingRight: '3rem', boxSizing: 'border-box' }} />
                                    <button type="button" onClick={() => setShowPassword(v => !v)} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer', fontSize: '0.6rem', fontFamily: 'var(--font-ui)', letterSpacing: '0.08em', opacity: 0.7 }}>
                                        {showPassword ? 'HIDE' : 'SHOW'}
                                    </button>
                                </div>

                                {mode === 'join' && password.length > 0 && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', overflow: 'hidden' }}>
                                        <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                                            {[1,2,3,4,5].map(i => (
                                                <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= passedChecks ? strengthColor : 'var(--ash)', transition: 'background 0.3s' }} />
                                            ))}
                                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.12em', color: strengthColor, marginLeft: '0.5rem', minWidth: '6rem', transition: 'color 0.3s' }}>{strengthLabel}</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.2rem 0.75rem' }}>
                                            {[
                                                [passwordChecks.length, '8+ characters'],
                                                [passwordChecks.uppercase, 'Uppercase letter'],
                                                [passwordChecks.lowercase, 'Lowercase letter'],
                                                [passwordChecks.number, 'Number'],
                                                [passwordChecks.special, 'Special character'],
                                            ].map(([ok, label]) => (
                                                <div key={String(label)} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.08em', color: ok ? '#4caf50' : 'var(--fog)', transition: 'color 0.2s' }}>
                                                    <span style={{ fontSize: '0.55rem' }}>{ok ? <Check size={12} /> : <Circle size={10} />}</span>
                                                    {label}
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}

                                {mode === 'join' && (
                                    <div style={{ marginTop: '0.5rem' }}>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>YOUR CINEMA PERSONA</div>
                                        {isTouch ? (
                                            <div>
                                                <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '0.3rem', WebkitOverflowScrolling: 'touch' }}>
                                                    {PERSONAS.map((p) => (
                                                        <button key={p.id} type="button" onClick={() => setPersona(p.id)} style={{ flexShrink: 0, background: persona === p.id ? `rgba(${parseInt(p.color.slice(1,3),16)},${parseInt(p.color.slice(3,5),16)},${parseInt(p.color.slice(5,7),16)},0.15)` : 'transparent', border: `1px solid ${persona === p.id ? p.color : 'var(--ash)'}`, borderLeft: persona === p.id ? `3px solid ${p.color}` : `1px solid ${persona === p.id ? p.color : 'var(--ash)'}`, borderRadius: '2px', padding: '0.45rem 0.7rem', cursor: 'pointer', textAlign: 'left', transition: 'all 0.25s', whiteSpace: 'nowrap' }}>
                                                            <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.72rem', color: persona === p.id ? 'var(--flicker)' : 'var(--bone)' }}>{p.id}</div>
                                                        </button>
                                                    ))}
                                                </div>
                                                {persona && <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--fog)', marginTop: '0.4rem', fontStyle: 'italic', lineHeight: 1.4 }}>{PERSONAS.find(p => p.id === persona)?.desc}</div>}
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                {PERSONAS.map((p) => (
                                                    <button key={p.id} type="button" onClick={() => setPersona(p.id)} style={{ background: persona === p.id ? `rgba(${parseInt(p.color.slice(1,3),16)},${parseInt(p.color.slice(3,5),16)},${parseInt(p.color.slice(5,7),16)},0.08)` : 'transparent', border: `1px solid ${persona === p.id ? p.color : 'var(--ash)'}`, borderLeft: persona === p.id ? `3px solid ${p.color}` : `1px solid ${persona === p.id ? p.color : 'var(--ash)'}`, borderRadius: 'var(--radius-wobbly)', padding: '0.6rem 0.75rem', cursor: 'pointer', textAlign: 'left', transition: 'all 0.25s', boxShadow: persona === p.id ? `inset 0 0 20px rgba(${parseInt(p.color.slice(1,3),16)},${parseInt(p.color.slice(3,5),16)},${parseInt(p.color.slice(5,7),16)},0.06)` : 'none' }}>
                                                        <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.85rem', color: persona === p.id ? 'var(--flicker)' : 'var(--parchment)' }}>{p.id}</div>
                                                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)', marginTop: '0.15rem' }}>{p.desc}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%', justifyContent: 'center', padding: '0.7em', marginTop: '0.5rem', opacity: submitting ? 0.6 : 1 }}>
                                    {submitting ? 'THREADING...' : mode === 'login' ? 'Enter the House' : 'Claim Your Seat'}
                                </button>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                                    {mode === 'login' ? (
                                        <>
                                            <Link to="/join" style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--fog)', textDecoration: 'underline' }}>Don't have an account? Sign up</Link>
                                            <Link to="/forgot-password" style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--sepia)', textDecoration: 'underline', opacity: 0.8 }}>Forgot your password?</Link>
                                        </>
                                    ) : (
                                        <Link to="/login" style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--fog)', textDecoration: 'underline' }}>Already a member? Sign in</Link>
                                    )}
                                </div>
                            </motion.form>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    )
}
