/**
 * SettingsPage — "The Dossier Bureau"
 * Account, Privacy, Notifications, Legal, and Account Actions.
 * Profile editing lives at /edit-profile now.
 * Nitrate Noir elevated design.
 */
import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store'
import { supabase, isSupabaseConfigured } from '../supabaseClient'
import PageSEO from '../components/PageSEO'
import toast from 'react-hot-toast'
import { Lock, Eye, Bell, LogOut, Download, Trash2, ChevronDown, ChevronUp, Smartphone, Shield, FileText, User } from 'lucide-react'
import { subscribeToWebPush } from '../utils/push'
import '../styles/settings.css'

export default function SettingsPage() {
    const { user, isAuthenticated, logout } = useAuthStore()
    const navigate = useNavigate()

    // ── Account ──
    const [email] = useState(user?.email || '')
    const [showPasswordChange, setShowPasswordChange] = useState(false)
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [changingPassword, setChangingPassword] = useState(false)

    // ── Privacy ──
    const [socialVisibility, setSocialVisibility] = useState<string>(
        (user?.preferences as any)?.social_visibility || (user?.is_social_private ? 'private' : 'public')
    )
    const [privacyEndorsements, setPrivacyEndorsements] = useState<string>(
        (user?.preferences as any)?.privacy_endorsements || 'everyone'
    )
    const [privacyAnnotations, setPrivacyAnnotations] = useState<string>(
        (user?.preferences as any)?.privacy_annotations || 'everyone'
    )

    // ── Notifications ──
    const prefs = user?.preferences || {}
    const [notifFollows, setNotifFollows] = useState(prefs.notif_follows !== false)
    const [notifEndorsements, setNotifEndorsements] = useState(prefs.notif_endorsements !== false)
    const [notifComments, setNotifComments] = useState(prefs.notif_comments !== false)
    const [notifSystem, setNotifSystem] = useState(prefs.notif_system !== false)
    const [pushEnabled, setPushEnabled] = useState(false)

    // Check if push is already enabled
    useEffect(() => {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            navigator.serviceWorker.ready.then(reg => {
                reg.pushManager.getSubscription().then(sub => {
                    if (sub) setPushEnabled(true)
                })
            })
        }
    }, [])

    const handleEnablePush = async () => {
        const success = await subscribeToWebPush()
        if (success) {
            setPushEnabled(true)
            toast.success('Mobile Push Notifications activated! ✦')
        } else {
            toast.error('Failed to enable push. Check browser permissions.')
        }
    }

    // ── General ──
    const [saving, setSaving] = useState(false)

    // ── Re-sync local state when the user object updates ──
    useEffect(() => {
        if (!user) return
        try {
            const p = (user.preferences || {}) as Record<string, any>
            setSocialVisibility(p.social_visibility || (user.is_social_private ? 'private' : 'public'))
            setPrivacyEndorsements(p.privacy_endorsements || 'everyone')
            setPrivacyAnnotations(p.privacy_annotations || 'everyone')
            setNotifFollows(p.notif_follows !== undefined ? !!p.notif_follows : true)
            setNotifEndorsements(p.notif_endorsements !== undefined ? !!p.notif_endorsements : true)
            setNotifComments(p.notif_comments !== undefined ? !!p.notif_comments : true)
            setNotifSystem(p.notif_system !== undefined ? !!p.notif_system : true)
        } catch { /* gracefully ignore re-sync errors */ }
    }, [user?.id, user?.preferences])

    useEffect(() => {
        if (!isAuthenticated) navigate('/')
    }, [isAuthenticated, navigate])

    // ── Save All ──
    const handleSave = async () => {
        if (!isSupabaseConfigured || !user) return
        setSaving(true)
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    is_social_private: socialVisibility === 'private',
                })
                .eq('id', user.id)
            if (error) throw error

            await useAuthStore.getState().setPreference('notif_follows', notifFollows)
            await useAuthStore.getState().setPreference('notif_endorsements', notifEndorsements)
            await useAuthStore.getState().setPreference('notif_comments', notifComments)
            await useAuthStore.getState().setPreference('notif_system', notifSystem)
            await useAuthStore.getState().setPreference('social_visibility', socialVisibility)
            await useAuthStore.getState().setPreference('privacy_endorsements', privacyEndorsements)
            await useAuthStore.getState().setPreference('privacy_annotations', privacyAnnotations)

            useAuthStore.getState().updateUser({
                is_social_private: socialVisibility === 'private',
            } as any)

            toast.success('Settings archived successfully ✦')
        } catch (e: any) {
            toast.error(e.message || 'Failed to save')
        } finally {
            setSaving(false)
        }
    }

    // ── Password Change ──
    const handlePasswordChange = async () => {
        if (newPassword.length < 8) { toast.error('Password must be at least 8 characters'); return }
        if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return }
        setChangingPassword(true)
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword })
            if (error) throw error
            toast.success('Password updated successfully')
            setNewPassword('')
            setConfirmPassword('')
            setShowPasswordChange(false)
        } catch (e: any) {
            toast.error(e.message || 'Password change failed')
        } finally {
            setChangingPassword(false)
        }
    }

    // ── Sign Out ──
    const handleSignOut = async () => {
        await logout()
        navigate('/')
        toast.success('Signed out of The Society')
    }

    // ── Delete Account ──
    const handleDeleteAccount = () => {
        const confirmed = window.confirm(
            'This will permanently delete your account, all logs, lists, and reviews. This cannot be undone. Are you absolutely certain?'
        )
        if (!confirmed) return
        toast.error('Account deletion requires admin intervention. Contact support@reelhouse.app')
    }

    if (!user) return null

    // ── Toggle Component ──
    const Toggle = ({ active, onToggle, label }: { active: boolean; onToggle: () => void; label: string }) => (
        <button
            className={`settings-toggle ${active ? 'settings-toggle--on' : 'settings-toggle--off'}`}
            onClick={onToggle}
            aria-label={`Toggle ${label}`}
        >
            <div className={`settings-toggle-dot ${active ? 'settings-toggle-dot--on' : 'settings-toggle-dot--off'}`} />
        </button>
    )

    return (
        <div className="settings-page">
            <PageSEO title="Settings" description="Manage your ReelHouse Society account settings." path="/settings" />

            {/* ── HERO HEADER ── */}
            <div className="settings-hero">
                <div className="settings-hero-eyebrow">✦ THE DOSSIER BUREAU ✦</div>
                <h1 className="settings-hero-title">Settings</h1>
                <p className="settings-hero-desc">
                    Configure your presence within The Society.
                </p>
            </div>

            {/* ═══════════════════════════════════════════ */}
            {/*   EDIT PROFILE LINK                        */}
            {/* ═══════════════════════════════════════════ */}
            <div className="settings-section" style={{ cursor: 'pointer' }} onClick={() => navigate('/edit-profile')}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <User size={14} style={{ color: 'var(--sepia)', opacity: 0.7 }} />
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.25em', color: 'var(--sepia)' }}>EDIT PROFILE</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>
                        Avatar, Bio, Username, Social Links →
                    </span>
                </div>
            </div>

            {/* ═══════════════════════════════════════════ */}
            {/*   SECTION 1 — ACCOUNT                      */}
            {/* ═══════════════════════════════════════════ */}
            <div className="settings-section">
                <div className="settings-section-header">
                    <Lock size={14} /> ACCOUNT
                </div>

                {/* Username */}
                <div className="settings-field">
                    <label className="settings-label">USERNAME</label>
                    <div className="settings-input settings-input--readonly">
                        @{user.username}
                    </div>
                </div>

                {/* Email */}
                <div className="settings-field">
                    <label className="settings-label">EMAIL</label>
                    <div className="settings-input settings-input--readonly">
                        {email}
                    </div>
                </div>

                {/* Password Change */}
                <button
                    className="settings-action-btn"
                    onClick={() => setShowPasswordChange(!showPasswordChange)}
                    style={{ marginTop: '0.25rem' }}
                >
                    <Lock size={12} /> CHANGE PASSWORD {showPasswordChange ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>

                {showPasswordChange && (
                    <div className="settings-password-panel">
                        <div className="settings-field">
                            <label className="settings-label">NEW PASSWORD</label>
                            <input
                                type="password"
                                className="settings-input"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                placeholder="Min. 8 characters"
                            />
                        </div>
                        <div className="settings-field">
                            <label className="settings-label">CONFIRM PASSWORD</label>
                            <input
                                type="password"
                                className="settings-input"
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                placeholder="Repeat password"
                            />
                        </div>
                        <button
                            className="settings-save-btn"
                            onClick={handlePasswordChange}
                            disabled={changingPassword || !newPassword || !confirmPassword}
                            style={{ marginTop: '0.5rem' }}
                        >
                            {changingPassword ? 'UPDATING...' : 'UPDATE PASSWORD'}
                        </button>
                    </div>
                )}
            </div>

            {/* ═══════════════════════════════════════════ */}
            {/*   SECTION 2 — PRIVACY                      */}
            {/* ═══════════════════════════════════════════ */}
            <div className="settings-section">
                <div className="settings-section-header">
                    <Eye size={14} /> PRIVACY
                </div>

                <div className="settings-privacy-group">
                    <label className="settings-label" style={{ marginBottom: '0.75rem' }}>SOCIAL VISIBILITY</label>
                    {[
                        { value: 'public', label: 'Public — Visible to everyone' },
                        { value: 'followers', label: 'Followers Only — Only your followers can see' },
                        { value: 'private', label: 'Private — Only you can see your activity' },
                    ].map(opt => (
                        <label key={opt.value} className={`settings-radio-option ${socialVisibility === opt.value ? 'settings-radio-option--active' : 'settings-radio-option--inactive'}`}>
                            <input
                                type="radio" name="visibility"
                                checked={socialVisibility === opt.value}
                                onChange={() => setSocialVisibility(opt.value)}
                            />
                            {opt.label}
                        </label>
                    ))}
                </div>

                <div className="settings-privacy-group">
                    <label className="settings-label" style={{ marginBottom: '0.75rem' }}>WHO CAN CERTIFY</label>
                    {[
                        { value: 'everyone', label: 'Everyone' },
                        { value: 'followers', label: 'Followers Only' },
                        { value: 'nobody', label: 'Nobody' },
                    ].map(opt => (
                        <label key={opt.value} className={`settings-radio-option ${privacyEndorsements === opt.value ? 'settings-radio-option--active' : 'settings-radio-option--inactive'}`}>
                            <input
                                type="radio" name="privacyEndorse"
                                checked={privacyEndorsements === opt.value}
                                onChange={() => setPrivacyEndorsements(opt.value)}
                            />
                            {opt.label}
                        </label>
                    ))}
                </div>

                <div className="settings-privacy-group">
                    <label className="settings-label" style={{ marginBottom: '0.75rem' }}>WHO CAN ANNOTATE</label>
                    {[
                        { value: 'everyone', label: 'Everyone' },
                        { value: 'followers', label: 'Followers Only' },
                        { value: 'nobody', label: 'Nobody' },
                    ].map(opt => (
                        <label key={opt.value} className={`settings-radio-option ${privacyAnnotations === opt.value ? 'settings-radio-option--active' : 'settings-radio-option--inactive'}`}>
                            <input
                                type="radio" name="privacyAnnotate"
                                checked={privacyAnnotations === opt.value}
                                onChange={() => setPrivacyAnnotations(opt.value)}
                            />
                            {opt.label}
                        </label>
                    ))}
                </div>
            </div>

            {/* ═══════════════════════════════════════════ */}
            {/*   SECTION 3 — NOTIFICATIONS                */}
            {/* ═══════════════════════════════════════════ */}
            <div className="settings-section">
                <div className="settings-section-header">
                    <Bell size={14} /> NOTIFICATIONS
                </div>

                {[
                    { label: 'New Followers', desc: 'When someone follows you', value: notifFollows, setter: setNotifFollows },
                    { label: 'Certifications', desc: 'When someone certifies your log', value: notifEndorsements, setter: setNotifEndorsements },
                    { label: 'Annotations', desc: 'When someone comments on your log', value: notifComments, setter: setNotifComments },
                    { label: 'System Alerts', desc: 'Society announcements and updates', value: notifSystem, setter: setNotifSystem },
                ].map(item => (
                    <div key={item.label} className="settings-notif-row">
                        <div>
                            <div className="settings-notif-label">{item.label}</div>
                            <div className="settings-notif-desc">{item.desc}</div>
                        </div>
                        <Toggle active={item.value} onToggle={() => item.setter(!item.value)} label={item.label} />
                    </div>
                ))}

                <div className="settings-push-section">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.65rem' }}>
                        <Smartphone size={10} /> MOBILE INTEGRATION
                    </div>
                    <button
                        className="settings-save-btn"
                        onClick={handleEnablePush}
                        disabled={pushEnabled}
                        style={{ opacity: pushEnabled ? 0.5 : 1 }}
                    >
                        {pushEnabled ? '✦ PUSH NOTIFICATIONS ACTIVE' : 'ENABLE SECURE PUSH NOTIFICATIONS'}
                    </button>
                    <div className="settings-push-desc">
                        Receive immediate cinematic alerts directly to your device when the society interacts with your archive.
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════ */}
            {/*   SECTION 4 — LEGAL                        */}
            {/* ═══════════════════════════════════════════ */}
            <div className="settings-section">
                <div className="settings-section-header">
                    <FileText size={14} /> LEGAL
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <Link to="/privacy" className="settings-action-btn" style={{ textDecoration: 'none' }}>
                        <Shield size={12} /> PRIVACY POLICY
                    </Link>
                    <Link to="/terms" className="settings-action-btn" style={{ textDecoration: 'none' }}>
                        <FileText size={12} /> TERMS OF SERVICE
                    </Link>
                </div>
            </div>

            {/* ═══════════════════════════════════════════ */}
            {/*   SECTION 5 — ACCOUNT ACTIONS              */}
            {/* ═══════════════════════════════════════════ */}
            <div className="settings-section settings-section--danger">
                <div className="settings-section-header" style={{ color: 'rgba(162,36,36,0.7)' }}>
                    <Shield size={14} /> ACCOUNT ACTIONS
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <button className="settings-action-btn" onClick={handleSignOut}>
                        <LogOut size={12} /> SIGN OUT
                    </button>
                    <button className="settings-action-btn" onClick={() => toast.success('CSV export available from your profile page')}>
                        <Download size={12} /> EXPORT DATA (CSV)
                    </button>
                    <div className="settings-divider" />
                    <button className="settings-action-btn settings-action-btn--danger" onClick={handleDeleteAccount}>
                        <Trash2 size={12} /> DELETE ACCOUNT
                    </button>
                </div>
            </div>

            {/* ── SAVE BUTTON ── */}
            <button
                className="settings-save-btn"
                onClick={handleSave}
                disabled={saving}
            >
                {saving ? 'ARCHIVING SETTINGS…' : '✦ SAVE SETTINGS ✦'}
            </button>

            {/* ── Legal Footer Links ── */}
            <div className="settings-legal">
                <Link to="/privacy">PRIVACY POLICY</Link>
                <Link to="/terms">TERMS OF SERVICE</Link>
            </div>

            {/* ── Member Since ── */}
            <div className="settings-member-badge">
                MEMBER SINCE {user.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase() : 'THE BEGINNING'}
            </div>
        </div>
    )
}
