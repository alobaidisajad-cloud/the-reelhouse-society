import { useState, useEffect, useRef } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useAndroidHardwareBack } from '../hooks/useAndroidHardwareBack'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Film, Building, Lock, Terminal, Mail, RefreshCw, Check, AlertCircle, Circle } from 'lucide-react'
import { useUIStore, useAuthStore } from '../store'
import { supabase } from '../supabaseClient'
import reelToast from '../utils/reelToast'
import { isDisposableEmail, isValidEmailFormat } from '../utils/disposableEmails'
import VelvetRopeGate from './signup/VelvetRopeGate'
import ForgotPasswordScreen from './signup/ForgotPasswordScreen'
import EmailConfirmationScreen from './signup/EmailConfirmationScreen'
import { Portal } from './UI'
import { useViewport } from '../hooks/useViewport'

const PERSONAS = [
    { id: 'The Midnight Devotee', desc: 'Haunts 3AM screenings. Darkness is your element.', color: '#5C1A0B' },
    { id: 'The Archivist', desc: 'Catalogues everything. Every film deserves a record.', color: '#8B6914' },
    { id: 'The Weeper', desc: 'Films hit you where it hurts. You enjoy it.', color: '#4A6B8A' },
    { id: 'The Contrarian', desc: 'Loved by critics? You\'re suspicious. Hated? Intrigued.', color: '#6B4A8A' },
    { id: 'The Completionist', desc: 'A director\'s filmography is a mission, not a suggestion.', color: '#1C5C1A' },
]


// Invite codes — MUST be set via VITE_INVITE_CODES in Vercel (comma-separated).
// No fallback codes shipped in the bundle — prevents view-source discovery.
const VALID_CODES = import.meta.env.VITE_INVITE_CODES
    ? import.meta.env.VITE_INVITE_CODES.split(',').map((c: string) => c.trim().toUpperCase())
    : []  // No fallback — signup blocked if env var is missing

export default function SignupModal() {
    const { signupModalOpen, signupRole, closeSignupModal } = useUIStore()
    const { login, isAuthenticated } = useAuthStore()
    const { isTouch } = useViewport()

    const [role, setRole] = useState(signupRole || 'cinephile')
    const [step, setStep] = useState(0)
    const [emailOrUsername, setEmailOrUsername] = useState('')
    const [password, setPassword] = useState('')
    const [username, setUsername] = useState('')
    const [persona, setPersona] = useState('')


    const [isLogin, setIsLogin] = useState(false)

    // Username availability state
    const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
    const usernameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Login rate limiting
    const [loginAttempts, setLoginAttempts] = useState(0)
    const [lockoutUntil, setLockoutUntil] = useState(0)
    const [submitting, setSubmitting] = useState(false)
    const MAX_LOGIN_ATTEMPTS = 5
    const LOCKOUT_DURATION_MS = 30_000

    // Velvet Rope State
    const [hasClearance, setHasClearance] = useState(false)
    const [clearanceCode, setClearanceCode] = useState('')
    const [clearanceStatus, setClearanceStatus] = useState('idle') // idle, checking, granted, denied

    // Email confirmation state
    const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
    const [confirmedEmail, setConfirmedEmail] = useState('')
    const [resending, setResending] = useState(false)

    // Forgot password state
    const [forgotMode, setForgotMode] = useState(false)

    useEffect(() => {
        // Reset state when modal opens
        if (signupModalOpen) {
            setHasClearance(false)
            setClearanceCode('')
            setClearanceStatus('idle')
        }
    }, [signupModalOpen])

    // Close the modal if the user is already logged in
    useEffect(() => {
        if (signupModalOpen && isAuthenticated) {
            closeSignupModal()
        }
    }, [signupModalOpen, isAuthenticated])

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current)
        }
    }, [])

    // ── DEBOUNCED USERNAME AVAILABILITY CHECK ──
    const checkUsernameAvailability = (value: string) => {
        if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current)
        const trimmed = value.trim().toLowerCase().replace(/\s+/g, '_')
        if (trimmed.length < 3) { setUsernameStatus('idle'); return }
        setUsernameStatus('checking')
        usernameCheckTimer.current = setTimeout(async () => {
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('username')
                    .eq('username', trimmed)
                    .maybeSingle()
                if (error) throw error
                setUsernameStatus(data ? 'taken' : 'available')
            } catch {
                setUsernameStatus('idle')
            }
        }, 500)
    }

    // ── AUTO-DETECT EMAIL CONFIRMATION ──
    // Polls every 5s to check if the user confirmed their email.
    // When they click the link (even in a new tab), the next poll succeeds
    // and logs them in automatically on the original page.
    useEffect(() => {
        if (!awaitingConfirmation || !emailOrUsername || !password) return
        let cancelled = false
        let attempts = 0
        const maxAttempts = 120 // 10 minutes of polling

        const poll = setInterval(async () => {
            if (cancelled || attempts >= maxAttempts) {
                clearInterval(poll)
                return
            }
            attempts++
            try {
                const { data, error } = await supabase.auth.signInWithPassword({ email: emailOrUsername, password })
                if (!error && data?.session) {
                    clearInterval(poll)
                    if (cancelled) return
                    // Fetch profile and set auth state
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', data.session.user.id)
                        .single()
                    useAuthStore.setState({
                        user: { ...data.session.user, ...profile, following: [] } as any,
                        isAuthenticated: true,
                    })
                    reelToast.success(`Welcome to The ReelHouse Society! 🎬`)
                    setAwaitingConfirmation(false)
                    closeSignupModal()
                    resetForm()
                }
            } catch {
                // Silently retry — email not yet confirmed
            }
        }, 5000)

        return () => { cancelled = true; clearInterval(poll) }
    }, [awaitingConfirmation, emailOrUsername, password])

    const [showPassword, setShowPassword] = useState(false)

    // ── PASSWORD STRENGTH ──
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

    const handleClearanceSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!clearanceCode.trim() || clearanceStatus === 'checking') return

        setClearanceStatus('checking')
        setTimeout(() => {
            if (VALID_CODES.includes(clearanceCode.toUpperCase().trim())) {
                setClearanceStatus('granted')
                setTimeout(() => setHasClearance(true), 1500)
            } else {
                setClearanceStatus('denied')
                setTimeout(() => setClearanceStatus('idle'), 2000)
            }
        }, 1200)
    }

    const handleSubmit = async () => {
        if (!emailOrUsername || !password || (!isLogin && !username)) {
            reelToast.error('Please fill all fields')
            return
        }
        if (submitting) return

        // Rate limiting check
        const now = Date.now()
        if (isLogin && now < lockoutUntil) {
            const remaining = Math.ceil((lockoutUntil - now) / 1000)
            reelToast.error(`Too many attempts. Try again in ${remaining}s.`)
            return
        }

        // Username availability guard for signup
        if (!isLogin && usernameStatus === 'taken') {
            reelToast.error('That username is already taken. Choose another.')
            return
        }

        setSubmitting(true)

        try {
            if (isLogin) {
                // ── LOGIN: email or username ──
                let loginEmail = emailOrUsername.trim()
                if (!loginEmail.includes('@')) {
                    // Input is a username — resolve via secure RPC (no client email exposure)
                    const lookupUsername = loginEmail.toLowerCase().replace(/\s+/g, '_')
                    const { data: resolvedEmail, error: rpcError } = await supabase
                        .rpc('get_email_by_username', { lookup_username: lookupUsername })
                    if (rpcError || !resolvedEmail) {
                        reelToast.error('No account found with that username.')
                        setLoginAttempts(prev => prev + 1)
                        if (loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS) {
                            setLockoutUntil(Date.now() + LOCKOUT_DURATION_MS)
                            setLoginAttempts(0)
                            reelToast.error('Account locked for 30 seconds due to too many failed attempts.')
                        }
                        return
                    }
                    loginEmail = resolvedEmail
                } else {
                    if (!isValidEmailFormat(loginEmail)) {
                        reelToast.error('Please enter a valid email address.')
                        return
                    }
                }
                await login(loginEmail, password)
                setLoginAttempts(0) // Reset on success
                reelToast.success('Welcome back to the House.')
                closeSignupModal()
                resetForm()
            } else {
                // ── SIGNUP: validate email, password, and username ──
                const signupEmail = emailOrUsername.trim()
                if (!isValidEmailFormat(signupEmail)) {
                    reelToast.error('Please enter a valid email address.')
                    return
                }
                if (isDisposableEmail(signupEmail)) {
                    reelToast.error('Disposable emails are not permitted. Use a permanent address to join the Society.')
                    return
                }
                if (!passwordStrong) {
                    reelToast.error('Password does not meet security requirements.')
                    return
                }
                const formattedUsername = username.trim().toLowerCase().replace(/\s+/g, '_')
                if (formattedUsername.length < 3) {
                    reelToast.error('Username must be at least 3 characters.')
                    return
                }
                const result = await useAuthStore.getState().signup(signupEmail, password, formattedUsername, role, persona)

                if (result?.session) {
                    // Email confirmation disabled — user is logged in immediately

                    reelToast.success(`Welcome to The ReelHouse Society, ${formattedUsername}! 🎬`)
                    closeSignupModal()
                    resetForm()
                } else {
                    // Email confirmation required — show inbox screen
                    setConfirmedEmail(signupEmail)
                    setAwaitingConfirmation(true)
                }
            }
        } catch (error) {
            let msg = (error as any).message || 'Authentication failed.';
            if (msg.includes('Database error saving new user')) {
                msg = 'Username is already taken by another patron. Choose another.';
            }
            if (msg.includes('Invalid login credentials')) {
                setLoginAttempts(prev => prev + 1)
                if (loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS) {
                    setLockoutUntil(Date.now() + LOCKOUT_DURATION_MS)
                    setLoginAttempts(0)
                    msg = 'Account locked for 30 seconds due to too many failed attempts.'
                }
            }
            reelToast.error(msg)
        } finally {
            setSubmitting(false)
        }
    }

    const resetForm = () => {
        setStep(0); setEmailOrUsername(''); setPassword(''); setUsername('')
        setPersona('')
        setHasClearance(false); setClearanceCode(''); setClearanceStatus('idle')
        setAwaitingConfirmation(false); setConfirmedEmail('')
        setForgotMode(false); setUsernameStatus('idle')
    }

    const handleResend = async () => {
        setResending(true)
        try {
            await supabase.auth.resend({ type: 'signup', email: confirmedEmail })
            reelToast.success('New verification link sent!')
        } catch {
            reelToast.error('Could not resend. Please try again.')
        } finally {
            setResending(false)
        }
    }

    const focusTrapRef = useFocusTrap(signupModalOpen, closeSignupModal)
    useAndroidHardwareBack(signupModalOpen, closeSignupModal)

    if (!signupModalOpen || isAuthenticated) return null

    if (forgotMode) {
        return (
            <Portal>
            <ForgotPasswordScreen
                onClose={closeSignupModal}
                onBackToLogin={() => { setForgotMode(false); setIsLogin(true) }}
                focusTrapRef={focusTrapRef as any}
            />
            </Portal>
        )
    }

    if (awaitingConfirmation) {
        return (
            <Portal>
            <EmailConfirmationScreen
                confirmedEmail={confirmedEmail}
                resending={resending}
                onResend={handleResend}
                onClose={closeSignupModal}
                focusTrapRef={focusTrapRef as any}
            />
            </Portal>
        )
    }

    if (!isLogin && !hasClearance) {
        return (
            <Portal>
            <VelvetRopeGate
                clearanceCode={clearanceCode}
                setClearanceCode={setClearanceCode}
                clearanceStatus={clearanceStatus}
                onSubmit={handleClearanceSubmit}
                onSwitchToLogin={() => setIsLogin(true)}
                onClose={closeSignupModal}
            />
            </Portal>
        )
    }

    // NORMAL SIGNUP / LOGIN FORM
    return (
        <Portal>
        <AnimatePresence>
            <motion.div
                ref={focusTrapRef}
                role="dialog"
                aria-modal="true"
                aria-label={isLogin ? 'Sign in' : 'Create account'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeSignupModal}
                style={{
                    position: 'fixed', inset: 0, zIndex: 10000,
                    /* ── Same immersive space as the Velvet Rope Gate ── */
                    background: `
                        radial-gradient(ellipse 50% 40% at 50% 45%, rgba(139, 105, 20, 0.03), transparent),
                        rgba(5, 3, 1, 0.98)
                    `,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '1rem',
                }}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, filter: isLogin ? 'none' : 'sepia(0.35)' }}
                    animate={{ scale: 1, opacity: 1, filter: 'sepia(0)' }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    onClick={(e) => e.stopPropagation()}
                    className="scanlines"
                    style={{
                        /* ── The Warm Room: faint projector glow from above ── */
                        background: 'radial-gradient(ellipse at center top, rgba(139, 105, 20, 0.05), transparent 60%), var(--soot)',
                        border: '1px solid rgba(139, 105, 20, 0.25)',
                        borderRadius: 'var(--radius-card)',
                        width: 'calc(100% - 2rem)',
                        maxWidth: 420,
                        maxHeight: 'calc(100dvh - 2rem)',
                        overflow: 'auto',
                        margin: 'auto auto',
                        boxShadow: '0 0 40px rgba(139,105,20,0.08)',
                        position: 'relative',
                    }}
                >
                    {/* Header */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(139, 105, 20, 0.15)',
                    }}>
                        <div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.2rem' }}>
                                {isLogin ? 'RETURNING PATRON' : 'CHOOSE YOUR ROLE'}
                            </div>
                            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>
                                {isLogin ? 'Sign Back In' : 'Enter The House'}
                            </h3>
                            {/* ── The House Remembers — Login welcome line ── */}
                            {isLogin && (
                                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)', fontStyle: 'italic', marginTop: '0.35rem', opacity: 0.7 }}>
                                    The House remembers its own.
                                </p>
                            )}
                        </div>
                        <button onClick={closeSignupModal} style={{ background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer' }}>
                            <X size={20} />
                        </button>
                    </div>
                    {/* ── Decorative sepia rule — chapter break ── */}
                    <div style={{ height: '1px', background: 'linear-gradient(to right, transparent, rgba(139,105,20,0.2), transparent)', margin: '0' }} />

                    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>


                        {/* Role selection (signup only) */}


                        {/* Fields */}
                        <form
                            onSubmit={(e) => { e.preventDefault(); handleSubmit() }}
                            style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
                            autoComplete="on"
                        >
                            <input className="input" placeholder={isLogin ? 'Email or Username' : 'Email address'} type={isLogin ? 'text' : 'email'} autoComplete={isLogin ? 'username' : 'email'} value={emailOrUsername} onChange={(e) => setEmailOrUsername(e.target.value)} />
                            {!isLogin && (
                                <div style={{ position: 'relative' }}>
                                    <input
                                        className="input"
                                        placeholder="Username / Handle"
                                        autoComplete="username"
                                        value={username}
                                        onChange={(e) => {
                                            setUsername(e.target.value)
                                            checkUsernameAvailability(e.target.value)
                                        }}
                                        style={{ width: '100%', paddingRight: '2.5rem', boxSizing: 'border-box' }}
                                    />
                                    {usernameStatus !== 'idle' && (
                                        <span style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
                                            {usernameStatus === 'checking' && <RefreshCw size={14} color="var(--fog)" style={{ animation: 'spin 1s linear infinite' }} />}
                                            {usernameStatus === 'available' && <Check size={14} color="#4caf50" />}
                                            {usernameStatus === 'taken' && <AlertCircle size={14} color="var(--blood-reel)" />}
                                        </span>
                                    )}
                                    {usernameStatus === 'taken' && (
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.08em', color: 'var(--blood-reel)', marginTop: '0.25rem' }}>
                                            USERNAME ALREADY TAKEN
                                        </div>
                                    )}
                                </div>
                            )}
                            {/* Password field with show/hide toggle */}
                            <div style={{ position: 'relative' }}>
                                <input
                                    className="input"
                                    placeholder="Password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    style={{ width: '100%', paddingRight: '3rem', boxSizing: 'border-box' }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer', fontSize: '0.6rem', fontFamily: 'var(--font-ui)', letterSpacing: '0.08em', opacity: 0.7 }}
                                >
                                    {showPassword ? 'HIDE' : 'SHOW'}
                                </button>
                            </div>

                            {/* Password strength — signup only */}
                            {!isLogin && password.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {/* Strength bars */}
                                    <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                                        {[1,2,3,4,5].map(i => (
                                            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= passedChecks ? strengthColor : 'var(--ash)', transition: 'background 0.3s' }} />
                                        ))}
                                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.12em', color: strengthColor, marginLeft: '0.5rem', minWidth: '6rem', transition: 'color 0.3s' }}>{strengthLabel}</span>
                                    </div>
                                    {/* Requirement checklist */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.2rem 0.75rem' }}>
                                        {[
                                            [passwordChecks.length,    '8+ characters'],
                                            [passwordChecks.uppercase, 'Uppercase letter'],
                                            [passwordChecks.lowercase, 'Lowercase letter'],
                                            [passwordChecks.number,    'Number'],
                                            [passwordChecks.special,   'Special character'],
                                        ].map(([ok, label]) => (
                                            <div key={String(label)} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.08em', color: ok ? '#4caf50' : 'var(--fog)', transition: 'color 0.2s' }}>
                                                <span style={{ fontSize: '0.55rem' }}>{ok ? <><Check size={12} style={{ display: "inline-block", verticalAlign: "middle" }} /></> : <><Circle size={10} style={{ display: "inline-block", verticalAlign: "middle" }} /></>}</span>
                                                {label}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Persona pick (cinephile signup) */}
                            {!isLogin && role === 'cinephile' && (
                                <div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>
                                        YOUR CINEMA PERSONA
                                    </div>
                                    {isTouch ? (
                                        /* ── Mobile: compact horizontal persona pills ── */
                                        <div>
                                            <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '0.3rem', WebkitOverflowScrolling: 'touch' }}>
                                                {PERSONAS.map((p) => (
                                                    <button
                                                        key={p.id}
                                                        type="button"
                                                        onClick={() => setPersona(p.id)}
                                                        style={{
                                                            flexShrink: 0,
                                                            background: persona === p.id ? `rgba(${parseInt(p.color.slice(1,3),16)},${parseInt(p.color.slice(3,5),16)},${parseInt(p.color.slice(5,7),16)},0.15)` : 'transparent',
                                                            border: `1px solid ${persona === p.id ? p.color : 'var(--ash)'}`,
                                                            borderLeft: persona === p.id ? `3px solid ${p.color}` : `1px solid ${persona === p.id ? p.color : 'var(--ash)'}`,
                                                            borderRadius: '2px',
                                                            padding: '0.45rem 0.7rem', cursor: 'pointer',
                                                            textAlign: 'left', transition: 'all 0.25s',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.72rem', color: persona === p.id ? 'var(--flicker)' : 'var(--bone)' }}>{p.id}</div>
                                                    </button>
                                                ))}
                                            </div>
                                            {/* Show selected persona description below */}
                                            {persona && (
                                                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--fog)', marginTop: '0.4rem', fontStyle: 'italic', lineHeight: 1.4 }}>
                                                    {PERSONAS.find(p => p.id === persona)?.desc}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        /* ── Desktop: full persona cards with identity marks ── */
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                            {PERSONAS.map((p) => (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    onClick={() => setPersona(p.id)}
                                                    style={{
                                                        background: persona === p.id ? `rgba(${parseInt(p.color.slice(1,3),16)},${parseInt(p.color.slice(3,5),16)},${parseInt(p.color.slice(5,7),16)},0.08)` : 'transparent',
                                                        border: `1px solid ${persona === p.id ? p.color : 'var(--ash)'}`,
                                                        /* ── Identity mark: colored left stripe like a wax seal on a dossier ── */
                                                        borderLeft: persona === p.id ? `3px solid ${p.color}` : `1px solid ${persona === p.id ? p.color : 'var(--ash)'}`,
                                                        borderRadius: 'var(--radius-wobbly)',
                                                        padding: '0.6rem 0.75rem', cursor: 'pointer',
                                                        textAlign: 'left', transition: 'all 0.25s',
                                                        boxShadow: persona === p.id ? `inset 0 0 20px rgba(${parseInt(p.color.slice(1,3),16)},${parseInt(p.color.slice(3,5),16)},${parseInt(p.color.slice(5,7),16)},0.06)` : 'none',
                                                    }}
                                                >
                                                    <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.85rem', color: persona === p.id ? 'var(--flicker)' : 'var(--parchment)' }}>{p.id}</div>
                                                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)', marginTop: '0.15rem' }}>{p.desc}</div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}



                            <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%', justifyContent: 'center', padding: '0.7em', opacity: submitting ? 0.6 : 1 }}>
                                {submitting ? 'THREADING...' : isLogin ? 'Enter the House' : 'Claim Your Seat'}
                            </button>
                        </form>

                        <button
                            onClick={() => setIsLogin((v) => !v)}
                            style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--fog)', background: 'none', border: 'none', textDecoration: 'underline', textAlign: 'center', cursor: 'pointer' }}
                        >
                            {isLogin ? "Don't have an account? Enter Clearance Code" : 'Already a member? Sign in'}
                        </button>
                        {isLogin && (
                            <button
                                onClick={() => { setForgotMode(true) }}
                                style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--sepia)', background: 'none', border: 'none', textDecoration: 'underline', textAlign: 'center', cursor: 'pointer', marginTop: '0.25rem', opacity: 0.8 }}
                            >
                                Forgot your password?
                            </button>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
        </Portal>
    )
}
