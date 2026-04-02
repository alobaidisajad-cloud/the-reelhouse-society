/**
 * SettingsPage — "The Dossier Bureau"
 * Account, Privacy, Notifications, Legal, and Account Actions.
 * Profile editing lives at /edit-profile now.
 * Nitrate Noir elevated design.
 */
import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store'
import { supabase, isSupabaseConfigured } from '../supabaseClient'
import PageSEO from '../components/PageSEO'
import toast from 'react-hot-toast'
import { Lock, Eye, Bell, LogOut, Download, Trash2, ChevronDown, ChevronUp, Smartphone, Shield, FileText, User, ArrowLeft, Upload, CheckCircle, AlertCircle } from 'lucide-react'
import { subscribeToWebPush } from '../utils/push'
import { importLetterboxdZip } from '../utils/letterboxdImport'
import { useFilmStore } from '../store'
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

    // ── Import ──
    const [importing, setImporting] = useState(false)
    const [importProgress, setImportProgress] = useState<{ phase: string; current: number; total: number; detail?: string } | null>(null)
    const [importResult, setImportResult] = useState<{ logs: number; reviews: number; watchlist: number; lists: number; skipped: number; errors: string[] } | null>(null)
    const [dragOver, setDragOver] = useState(false)
    const importFileRef = useRef<HTMLInputElement>(null)

    const handleImportFile = async (file: File) => {
        if (!file.name.endsWith('.zip')) {
            toast.error('Please upload a .zip file from Letterboxd.')
            return
        }
        setImporting(true)
        setImportResult(null)
        try {
            const result = await importLetterboxdZip(file, (progress) => {
                setImportProgress(progress)
            })
            setImportResult(result)
            // Refresh all stores
            await useFilmStore.getState().fetchLogs()
            await useFilmStore.getState().fetchWatchlist()
            await useFilmStore.getState().fetchLists()
            toast.success(`✦ Import complete — ${result.logs} logs, ${result.watchlist} watchlist, ${result.lists} stacks`)
        } catch (e: any) {
            toast.error(e.message || 'Import failed')
        } finally {
            setImporting(false)
            setImportProgress(null)
        }
    }

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

            {/* ── Back Button ── */}
            <button
                onClick={() => navigate(`/user/${user.username}`)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--fog)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '2rem', padding: 0, transition: 'color 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--sepia)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--fog)'}
            >
                <ArrowLeft size={14} /> BACK TO PROFILE
            </button>

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
            {/*   SECTION 4 — IMPORT & EXPORT               */}
            {/* ═══════════════════════════════════════════ */}
            <div className="settings-section">
                <div className="settings-section-header">
                    <Download size={14} /> IMPORT & EXPORT
                </div>

                {/* ── Letterboxd Import ── */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.75rem' }}>
                        IMPORT FROM LETTERBOXD
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)', marginBottom: '1rem', lineHeight: 1.6, fontStyle: 'italic' }}>
                        Export your data from Letterboxd (Settings → Import & Export → Export Your Data), then upload the ZIP file here. Your diary, reviews, ratings, watchlist, and lists will be imported.
                    </div>

                    {/* Upload Zone */}
                    {!importing && !importResult && (
                        <div
                            onClick={() => importFileRef.current?.click()}
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={(e) => {
                                e.preventDefault()
                                setDragOver(false)
                                const file = e.dataTransfer.files[0]
                                if (file) handleImportFile(file)
                            }}
                            style={{
                                border: `2px dashed ${dragOver ? 'var(--sepia)' : 'rgba(139,105,20,0.25)'}`,
                                borderRadius: '6px',
                                padding: '2rem 1.5rem',
                                textAlign: 'center',
                                cursor: 'pointer',
                                background: dragOver ? 'rgba(139,105,20,0.06)' : 'rgba(10,7,3,0.4)',
                                transition: 'all 0.3s',
                            }}
                        >
                            <Upload size={24} style={{ color: 'var(--sepia)', marginBottom: '0.75rem', opacity: 0.7 }} />
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', color: 'var(--parchment)', marginBottom: '0.4rem' }}>
                                Drop your Letterboxd ZIP here
                            </div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.12em', color: 'var(--fog)' }}>
                                or click to browse
                            </div>
                            <input
                                ref={importFileRef}
                                type="file"
                                accept=".zip"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) handleImportFile(file)
                                    e.target.value = '' // allow re-upload
                                }}
                            />
                        </div>
                    )}

                    {/* Progress Bar */}
                    {importing && importProgress && (
                        <div style={{
                            border: '1px solid rgba(139,105,20,0.2)',
                            borderRadius: '6px',
                            padding: '1.25rem',
                            background: 'rgba(10,7,3,0.6)',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--sepia)' }}>
                                    {importProgress.phase}
                                </span>
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>
                                    {importProgress.current} / {importProgress.total}
                                </span>
                            </div>
                            {/* Progress bar track */}
                            <div style={{
                                width: '100%', height: '4px', borderRadius: '2px',
                                background: 'rgba(139,105,20,0.1)',
                                overflow: 'hidden',
                            }}>
                                <div style={{
                                    width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%`,
                                    height: '100%',
                                    background: 'linear-gradient(90deg, var(--sepia), rgba(218,165,32,0.8))',
                                    borderRadius: '2px',
                                    transition: 'width 0.3s ease-out',
                                }} />
                            </div>
                            {importProgress.detail && (
                                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--fog)', marginTop: '0.5rem', fontStyle: 'italic', opacity: 0.7 }}>
                                    {importProgress.detail}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Import Result */}
                    {importResult && (
                        <div style={{
                            border: '1px solid rgba(139,105,20,0.3)',
                            borderRadius: '6px',
                            padding: '1.25rem',
                            background: 'rgba(10,7,3,0.6)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                                <CheckCircle size={16} style={{ color: 'var(--sepia)' }} />
                                <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', color: 'var(--parchment)' }}>
                                    TRANSFER COMPLETE (v5)
                                </span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                                {[
                                    { label: 'FILM LOGS', value: importResult.logs },
                                    { label: 'REVIEWS', value: importResult.reviews },
                                    { label: 'WATCHLIST', value: importResult.watchlist },
                                    { label: 'STACKS', value: importResult.lists },
                                ].map(stat => (
                                    <div key={stat.label} style={{ textAlign: 'center', padding: '0.5rem', background: 'rgba(139,105,20,0.05)', borderRadius: '4px' }}>
                                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--parchment)' }}>{stat.value}</div>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.4rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>{stat.label}</div>
                                    </div>
                                ))}
                            </div>
                            {importResult.skipped > 0 && (
                                <div style={{ marginTop: '0.75rem', fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', color: 'var(--fog)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <AlertCircle size={10} /> {importResult.skipped} films could not be matched
                                </div>
                            )}
                            {importResult.errors.length > 0 && (
                                <div style={{ marginTop: '0.5rem', fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'rgba(162,36,36,0.8)', fontStyle: 'italic', maxHeight: '120px', overflowY: 'auto' }}>
                                    {importResult.errors.map((err, i) => (
                                        <div key={i} style={{ marginBottom: '0.25rem' }}>• {err}</div>
                                    ))}
                                </div>
                            )}
                            <button
                                className="settings-action-btn"
                                onClick={() => setImportResult(null)}
                                style={{ marginTop: '1rem' }}
                            >
                                <Upload size={12} /> IMPORT ANOTHER FILE
                            </button>
                        </div>
                    )}
                </div>

                {/* ── Export ── */}
                <div className="settings-divider" />
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>
                    EXPORT YOUR DATA
                </div>
                <button className="settings-action-btn" onClick={() => toast.success('CSV export available from your profile page')}>
                    <Download size={12} /> EXPORT DATA (CSV)
                </button>
            </div>

            {/* ═══════════════════════════════════════════ */}
            {/*   SECTION 5 — LEGAL                        */}
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
            {/*   SECTION 6 — ACCOUNT ACTIONS              */}
            {/* ═══════════════════════════════════════════ */}
            <div className="settings-section settings-section--danger">
                <div className="settings-section-header" style={{ color: 'rgba(162,36,36,0.7)' }}>
                    <Shield size={14} /> ACCOUNT ACTIONS
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <button className="settings-action-btn" onClick={handleSignOut}>
                        <LogOut size={12} /> SIGN OUT
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
