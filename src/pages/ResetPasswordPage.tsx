import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useNavigate } from 'react-router-dom'
import { Lock, Eye, EyeOff, Check, Circle, ArrowLeft } from 'lucide-react'
import reelToast from '../utils/reelToast'
import PageSEO from '../components/PageSEO'

export default function ResetPasswordPage() {
    const navigate = useNavigate()
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)

    // Password strength checks (same as SignupModal)
    const checks = {
        length:    password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number:    /[0-9]/.test(password),
        special:   /[^A-Za-z0-9]/.test(password),
    }
    const passed = Object.values(checks).filter(Boolean).length
    const strong = passed === 5
    const strengthLabel = ['', 'WEAK', 'FAIR', 'FAIR', 'STRONG', 'VERY STRONG'][passed]
    const strengthColor = ['', 'var(--blood-reel)', '#c4a000', '#c4a000', 'var(--sepia)', '#4caf50'][passed]

    const handleReset = async (e: any) => {
        e.preventDefault()
        if (!strong) { reelToast.error('Password does not meet security requirements.'); return }
        if (password !== confirm) { reelToast.error('Passwords do not match.'); return }

        setLoading(true)
        try {
            const { error } = await supabase.auth.updateUser({ password })
            if (error) throw error
            setSuccess(true)
            // Clear recovery mode so the auth listener can properly sign the user in
            sessionStorage.removeItem('reelhouse_recovery')
            reelToast.success('Password updated successfully!')
            // Re-trigger auth so the user gets properly logged in with their new password
            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
                // Force a re-auth by refreshing the session
                await supabase.auth.refreshSession()
            }
            setTimeout(() => navigate('/'), 2500)
        } catch (err: any) {
            reelToast.error(err.message || 'Failed to reset password.')
        } finally {
            setLoading(false)
        }
    }

    if (success) {
        return (
            <div style={{ minHeight: '100dvh', background: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                <div style={{ width: '100%', maxWidth: 440, textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', padding: '1.25rem', borderRadius: '50%', background: 'rgba(76,175,80,0.1)', border: '1px solid #4caf50', marginBottom: '1.5rem' }}>
                        <Check size={32} color="#4caf50" />
                    </div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--parchment)', marginBottom: '0.75rem' }}>
                        Password Reset Complete.
                    </h2>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--bone)', lineHeight: 1.6, marginBottom: '1rem' }}>
                        Your new credentials have been secured. Redirecting you to the House...
                    </p>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--fog)' }}>
                        REDIRECTING IN 3 SECONDS...
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div style={{ minHeight: '100dvh', background: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
            <div style={{
                width: '100%', maxWidth: 440,
                background: 'var(--soot)', border: '1px solid var(--ash)',
                borderRadius: '4px', padding: '2.5rem 2rem',
                boxShadow: '0 0 60px rgba(139,105,20,0.08)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <div style={{ padding: '0.6rem', borderRadius: '50%', background: 'rgba(139,105,20,0.1)', border: '1px solid var(--sepia)' }}>
                        <Lock size={20} color="var(--sepia)" />
                    </div>
                    <div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--sepia)' }}>
                            CREDENTIAL RESET
                        </div>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)', lineHeight: 1.1 }}>
                            Set New Password
                        </h2>
                    </div>
                </div>

                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--fog)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                    Enter your new password below. Make it strong — the archives demand it.
                </p>

                <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* New Password */}
                    <div style={{ position: 'relative' }}>
                        <input
                            className="input"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="New password"
                            value={password}
                            onChange={(e: any) => setPassword(e.target.value)}
                            autoComplete="new-password"
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

                    {/* Strength indicator */}
                    {password.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                                {[1,2,3,4,5].map(i => (
                                    <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= passed ? strengthColor : 'var(--ash)', transition: 'background 0.3s' }} />
                                ))}
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.12em', color: strengthColor, marginLeft: '0.5rem', minWidth: '6rem', transition: 'color 0.3s' }}>{strengthLabel}</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.2rem 0.75rem' }}>
                                {([
                                    [checks.length, '8+ characters'],
                                    [checks.uppercase, 'Uppercase letter'],
                                    [checks.lowercase, 'Lowercase letter'],
                                    [checks.number, 'Number'],
                                    [checks.special, 'Special character'],
                                ] as Array<[boolean, string]>).map(([ok, label]) => (
                                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.08em', color: ok ? '#4caf50' : 'var(--fog)', transition: 'color 0.2s' }}>
                                        <span style={{ fontSize: '0.55rem' }}>{ok ? <><Check size={12} style={{ display: "inline-block", verticalAlign: "middle" }} /></> : <><Circle size={10} style={{ display: "inline-block", verticalAlign: "middle" }} /></>}</span>
                                        {label}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Confirm Password */}
                    <input
                        className="input"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Confirm new password"
                        value={confirm}
                        onChange={(e: any) => setConfirm(e.target.value)}
                        autoComplete="new-password"
                        style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                    {confirm && password !== confirm && (
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--blood-reel)' }}>
                            PASSWORDS DO NOT MATCH
                        </div>
                    )}

                    <button
                        className="btn btn-primary"
                        type="submit"
                        disabled={loading || !strong || password !== confirm}
                        style={{ width: '100%', justifyContent: 'center', padding: '0.7em', marginTop: '0.5rem', opacity: (loading || !strong || password !== confirm) ? 0.5 : 1 }}
                    >
                        {loading ? 'RESETTING...' : 'RESET PASSWORD'}
                    </button>
                </form>

                <button
                    onClick={() => navigate('/')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.12em', color: 'var(--fog)', background: 'none', border: 'none', cursor: 'pointer', marginTop: '1.5rem', padding: 0, transition: 'color 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--sepia)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--fog)'}
                >
                    <ArrowLeft size={12} /> BACK TO THE LOBBY
                </button>
            </div>
        </div>
    )
}
