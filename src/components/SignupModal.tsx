import { useState, useEffect } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Film, Building, Lock, Terminal, Mail, RefreshCw } from 'lucide-react'
import { useUIStore, useAuthStore } from '../store'
import { supabase } from '../supabaseClient'
import toast from 'react-hot-toast'
import VelvetRopeGate from './signup/VelvetRopeGate'
import ForgotPasswordScreen from './signup/ForgotPasswordScreen'
import EmailConfirmationScreen from './signup/EmailConfirmationScreen'

const PERSONAS = [
    { id: 'The Midnight Devotee', desc: 'Haunts 3AM screenings. Darkness is your element.' },
    { id: 'The Archivist', desc: 'Catalogues everything. Every film deserves a record.' },
    { id: 'The Weeper', desc: 'Films hit you where it hurts. You enjoy it.' },
    { id: 'The Contrarian', desc: 'Loved by critics? You\'re suspicious. Hated? Intrigued.' },
    { id: 'The Completionist', desc: 'A director\'s filmography is a mission, not a suggestion.' },
]

const VIBE_TAGS = ['Arthouse', 'Drive-In', 'Historic', 'IMAX', 'Midnight Palace', 'Repertory', 'Horror House', 'Indie']
// Invite codes — MUST be set via VITE_INVITE_CODES in Vercel (comma-separated).
// No fallback codes shipped in the bundle — prevents view-source discovery.
const VALID_CODES = import.meta.env.VITE_INVITE_CODES
    ? import.meta.env.VITE_INVITE_CODES.split(',').map(c => c.trim().toUpperCase())
    : []

export default function SignupModal() {
    const { signupModalOpen, signupRole, closeSignupModal } = useUIStore()
    const { login, isAuthenticated } = useAuthStore()

    const [role, setRole] = useState(signupRole || 'cinephile')
    const [step, setStep] = useState(0)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [username, setUsername] = useState('')
    const [persona, setPersona] = useState('')
    const [venueName, setVenueName] = useState('')
    const [venueDesc, setVenueDesc] = useState('')
    const [vibes, setVibes] = useState([])
    const [isLogin, setIsLogin] = useState(false)

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

    // Close the modal if the user is already logged in (prevents showing gate to auth'd users)
    useEffect(() => {
        if (signupModalOpen && isAuthenticated) {
            closeSignupModal()
        }
    }, [signupModalOpen, isAuthenticated])

    const [showPassword, setShowPassword] = useState(false)
    const toggleVibe = (v) => setVibes((prev) =>
        prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    )

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

    const handleClearanceSubmit = (e) => {
        e.preventDefault()
        if (!clearanceCode.trim()) return

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
        if (!email || !password || (!isLogin && !username)) {
            toast.error('Please fill all fields')
            return
        }
        if (!isLogin && !passwordStrong) {
            toast.error('Password does not meet security requirements.')
            return
        }


        try {
            if (isLogin) {
                await login(email, password)
                toast.success('Welcome back to the House.')
                closeSignupModal()
                resetForm()
            } else {
                const formattedUsername = username.trim().toLowerCase().replace(/\s+/g, '_')
                const result = await useAuthStore.getState().signup(email, password, formattedUsername, role, persona)

                if (result?.session) {
                    // Email confirmation disabled — user is logged in immediately
                    // For venue owners: create their venue row in Supabase
                    if (role === 'venue_owner' && venueName.trim() && result.user?.id) {
                        const slug = venueName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
                        await supabase.from('venues').insert([{
                            owner_id: result.user.id,
                            name: venueName.trim(),
                            slug,
                            location: 'TBD',
                            description: venueDesc.trim() || null,
                            vibes: vibes.length > 0 ? vibes : null,
                        }]).catch(() => {})
                    }
                    toast.success(`Welcome to The ReelHouse Society, ${formattedUsername}! 🎬`)
                    closeSignupModal()
                    resetForm()
                } else {
                    // Email confirmation required — show inbox screen
                    setConfirmedEmail(email)
                    setAwaitingConfirmation(true)
                }
            }
        } catch (error) {
            let msg = error.message || 'Authentication failed.';
            if (msg.includes('Database error saving new user')) {
                msg = 'Username is already taken by another patron. Choose another.';
            }
            toast.error(msg)
        }
    }

    const resetForm = () => {
        setStep(0); setEmail(''); setPassword(''); setUsername('')
        setPersona(''); setVenueName(''); setVenueDesc(''); setVibes([])
        setHasClearance(false); setClearanceCode(''); setClearanceStatus('idle')
        setAwaitingConfirmation(false); setConfirmedEmail('')
        setForgotMode(false)
    }

    const handleResend = async () => {
        setResending(true)
        try {
            await supabase.auth.resend({ type: 'signup', email: confirmedEmail })
            toast.success('New verification link sent!')
        } catch {
            toast.error('Could not resend. Please try again.')
        } finally {
            setResending(false)
        }
    }

    const focusTrapRef = useFocusTrap(signupModalOpen, closeSignupModal)

    if (!signupModalOpen || isAuthenticated) return null

    if (forgotMode) {
        return (
            <ForgotPasswordScreen
                onClose={closeSignupModal}
                onBackToLogin={() => { setForgotMode(false); setIsLogin(true) }}
                focusTrapRef={focusTrapRef}
            />
        )
    }

    if (awaitingConfirmation) {
        return (
            <EmailConfirmationScreen
                confirmedEmail={confirmedEmail}
                resending={resending}
                onResend={handleResend}
                onClose={closeSignupModal}
                focusTrapRef={focusTrapRef}
            />
        )
    }

    if (!isLogin && !hasClearance) {
        return (
            <VelvetRopeGate
                clearanceCode={clearanceCode}
                setClearanceCode={setClearanceCode}
                clearanceStatus={clearanceStatus}
                onSubmit={handleClearanceSubmit}
                onSwitchToLogin={() => setIsLogin(true)}
                onClose={closeSignupModal}
            />
        )
    }

    // NORMAL SIGNUP / LOGIN FORM
    return (
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
                    background: 'rgba(10,7,3,0.95)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '1rem',
                }}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 280 }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        background: 'var(--soot)',
                        border: '1px solid var(--ash)',
                        borderRadius: 'var(--radius-card)',
                        width: 'calc(100% - 2rem)',
                        maxWidth: 480,
                        maxHeight: 'calc(100vh - 2rem)',
                        overflow: 'auto',
                        margin: 'auto auto'
                    }}
                >
                    {/* Header */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--ash)',
                    }}>
                        <div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.2rem' }}>
                                {isLogin ? 'RETURNING PATRON' : 'CHOOSE YOUR ROLE'}
                            </div>
                            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>
                                {isLogin ? 'Sign Back In' : 'Enter The House'}
                            </h3>
                        </div>
                        <button onClick={closeSignupModal} style={{ background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer' }}>
                            <X size={20} />
                        </button>
                    </div>

                    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>


                        {/* Role selection (signup only) */}
                        {!isLogin && (
                            <div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>
                                    I AM A...
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                    {[
                                        { val: 'cinephile', label: 'Cinephile', sub: 'Film lover & critic', icon: <Film size={20} /> },
                                        { val: 'venue_owner', label: 'Cinema Owner', sub: 'I run a venue', icon: <Building size={20} /> },
                                    ].map(({ val, label, sub, icon }) => (
                                        <button
                                            key={val}
                                            onClick={() => {
                                                setRole(val)
                                                // Reset role-specific state to prevent cross-contamination
                                                if (val === 'venue_owner') { setPersona('') }
                                                if (val === 'cinephile') { setVenueName(''); setVenueDesc(''); setVibes([]) }
                                            }}
                                            style={{
                                                background: role === val ? 'rgba(139,105,20,0.15)' : 'var(--ink)',
                                                border: `1px solid ${role === val ? 'var(--sepia)' : 'var(--ash)'}`,
                                                borderRadius: 'var(--radius-card)',
                                                padding: '1rem',
                                                textAlign: 'center', cursor: 'pointer',
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem',
                                                color: role === val ? 'var(--flicker)' : 'var(--fog)',
                                                transition: 'all 0.2s',
                                            }}
                                        >
                                            {icon}
                                            <span style={{ fontFamily: 'var(--font-sub)', fontSize: '0.85rem', color: role === val ? 'var(--parchment)' : 'var(--bone)' }}>{label}</span>
                                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>{sub}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Fields */}
                        <form
                            onSubmit={(e) => { e.preventDefault(); handleSubmit() }}
                            style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
                            autoComplete="on"
                        >
                            <input className="input" placeholder="Email address" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                            {!isLogin && (
                                <input className="input" placeholder="Username / Handle" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
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
                                            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.08em', color: ok ? '#4caf50' : 'var(--fog)', transition: 'color 0.2s' }}>
                                                <span style={{ fontSize: '0.55rem' }}>{ok ? '✓' : '○'}</span>
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
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                        {PERSONAS.map((p) => (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => setPersona(p.id)}
                                                style={{
                                                    background: persona === p.id ? 'rgba(139,105,20,0.12)' : 'transparent',
                                                    border: `1px solid ${persona === p.id ? 'var(--sepia)' : 'var(--ash)'}`,
                                                    borderRadius: 'var(--radius-wobbly)',
                                                    padding: '0.6rem 0.75rem', cursor: 'pointer',
                                                    textAlign: 'left', transition: 'all 0.2s',
                                                }}
                                            >
                                                <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.85rem', color: persona === p.id ? 'var(--flicker)' : 'var(--parchment)' }}>{p.id}</div>
                                                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)', marginTop: '0.15rem' }}>{p.desc}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Venue fields */}
                            {!isLogin && role === 'venue_owner' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <input className="input" placeholder="Venue name" value={venueName} onChange={(e) => setVenueName(e.target.value)} />
                                    <textarea className="input" placeholder="Describe your venue..." value={venueDesc} onChange={(e) => setVenueDesc(e.target.value)} style={{ minHeight: 80 }} />
                                    <div>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>VIBE TAGS</div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                            {VIBE_TAGS.map((v) => (
                                                <button key={v} type="button" className={`tag ${vibes.includes(v) ? 'tag-flicker' : 'tag-vibe'}`} onClick={() => toggleVibe(v)} style={{ cursor: 'pointer' }}>{v}</button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <button className="btn btn-primary" type="submit" style={{ width: '100%', justifyContent: 'center', padding: '0.7em' }}>
                                {isLogin ? 'Enter the House' : 'Claim Your Seat'}
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
                                onClick={() => { setForgotMode(true); setForgotEmail(email) }}
                                style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--sepia)', background: 'none', border: 'none', textDecoration: 'underline', textAlign: 'center', cursor: 'pointer', marginTop: '0.25rem', opacity: 0.8 }}
                            >
                                Forgot your password?
                            </button>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
