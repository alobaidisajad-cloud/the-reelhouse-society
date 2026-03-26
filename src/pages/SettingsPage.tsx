/**
 * SettingsPage — Full account settings.
 * Profile (avatar, display name, bio), Account (email, password),
 * Privacy, Notifications, and Danger Zone.
 * Nitrate Noir themed.
 */
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store'
import { supabase, isSupabaseConfigured } from '../supabaseClient'
import PageSEO from '../components/PageSEO'
import toast from 'react-hot-toast'
import { Camera, User, Lock, Eye, Bell, AlertTriangle, LogOut, Download, Trash2, ChevronDown, ChevronUp, Smartphone } from 'lucide-react'
import Buster from '../components/Buster'
import { subscribeToWebPush } from '../utils/push'

export default function SettingsPage() {
    const { user, isAuthenticated, logout } = useAuthStore()
    const navigate = useNavigate()

    // ── Profile ──
    const [displayName, setDisplayName] = useState(user?.display_name || user?.displayName || user?.username || '')
    const [bio, setBio] = useState(user?.bio || '')
    const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatar_url || null)
    const [avatarFile, setAvatarFile] = useState<File | null>(null)
    const [uploadingAvatar, setUploadingAvatar] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

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

    // Check if push is already enabled in the browser locally
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


    // ── Re-sync local state when the user object updates (e.g. after initAuthSync re-fetches from Supabase) ──
    useEffect(() => {
        if (!user) return
        try {
            setDisplayName((user as any).display_name || (user as any).displayName || user.username || '')
            setBio(user.bio || '')
            setAvatarPreview(user.avatar_url || null)
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

    // ── Avatar Upload ──
    const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (file.size > 2 * 1024 * 1024) { toast.error('Image must be under 2MB'); return }
        setAvatarFile(file)
        setAvatarPreview(URL.createObjectURL(file))
    }

    const uploadAvatar = async () => {
        if (!avatarFile || !user) return null
        setUploadingAvatar(true)
        try {
            const ext = avatarFile.name.split('.').pop()
            const path = `${user.id}/avatar.${ext}`
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(path, avatarFile, { upsert: true })
            if (uploadError) throw uploadError
            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
            return urlData.publicUrl + `?t=${Date.now()}`
        } catch (e: any) {
            toast.error('Avatar upload failed: ' + (e.message || 'Unknown error'))
            return null
        } finally {
            setUploadingAvatar(false)
        }
    }

    // ── Save All ──
    const handleSave = async () => {
        if (!isSupabaseConfigured || !user) return
        // Guard against extreme-length strings that would blow the DB column
        if (displayName.trim().length > 50) { toast.error('Display name must be 50 characters or fewer.'); return }
        if (bio.trim().length > 500) { toast.error('Bio must be 500 characters or fewer.'); return }
        setSaving(true)
        try {
            // Upload avatar if changed
            let avatarUrl = user.avatar_url
            if (avatarFile) {
                const uploaded = await uploadAvatar()
                if (uploaded) avatarUrl = uploaded
            }

            // Save profile fields
            const { error } = await supabase
                .from('profiles')
                .update({
                    display_name: displayName,
                    bio,
                    avatar_url: avatarUrl,
                    is_social_private: socialVisibility === 'private',
                })
                .eq('id', user.id)
            if (error) throw error

            // Save notification preferences via auth store
            await useAuthStore.getState().setPreference('notif_follows', notifFollows)
            await useAuthStore.getState().setPreference('notif_endorsements', notifEndorsements)
            await useAuthStore.getState().setPreference('notif_comments', notifComments)
            await useAuthStore.getState().setPreference('notif_system', notifSystem)
            await useAuthStore.getState().setPreference('social_visibility', socialVisibility)
            await useAuthStore.getState().setPreference('privacy_endorsements', privacyEndorsements)
            await useAuthStore.getState().setPreference('privacy_annotations', privacyAnnotations)

            // Update local state
            useAuthStore.getState().updateUser({
                bio, avatar_url: avatarUrl,
                display_name: displayName,
                is_social_private: socialVisibility === 'private',
            } as any)

            setAvatarFile(null)
            toast.success('Settings saved to the archive ✦')
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

    // ── Styles ──
    const sectionStyle: React.CSSProperties = {
        padding: '1.75rem', marginBottom: '1.25rem',
        background: 'rgba(22,18,12,0.5)',
        border: '1px solid rgba(139,105,20,0.08)',
        borderRadius: '4px',
    }
    const sectionHeaderStyle: React.CSSProperties = {
        display: 'flex', alignItems: 'center', gap: '0.65rem',
        fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.25em',
        color: 'var(--sepia)', marginBottom: '1.25rem', paddingBottom: '0.75rem',
        borderBottom: '1px solid rgba(139,105,20,0.1)',
    }
    const labelStyle: React.CSSProperties = {
        fontFamily: 'var(--font-ui)', fontSize: '0.48rem', letterSpacing: '0.2em',
        color: 'var(--sepia)', marginBottom: '0.5rem', display: 'block',
    }
    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '0.75rem', background: 'var(--soot)',
        border: '1px solid rgba(139,105,20,0.1)', borderRadius: '3px',
        color: 'var(--parchment)', fontFamily: 'var(--font-body)', fontSize: '0.9rem',
        outline: 'none', transition: 'border-color 0.2s',
    }
    const toggleStyle = (active: boolean): React.CSSProperties => ({
        width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
        background: active ? 'var(--sepia)' : 'rgba(139,105,20,0.15)',
        border: 'none', position: 'relative', transition: 'background 0.2s',
        flexShrink: 0,
    })
    const toggleDotStyle = (active: boolean): React.CSSProperties => ({
        width: 14, height: 14, borderRadius: '50%',
        background: active ? 'var(--parchment)' : 'var(--fog)',
        position: 'absolute', top: 3,
        left: active ? 19 : 3, transition: 'left 0.2s',
    })

    return (
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '5.5rem 1.5rem 4rem' }}>
            <PageSEO title="Settings" description="Manage your ReelHouse Society account settings." path="/settings" />

            {/* ── Page Header ── */}
            <div style={{ marginBottom: '2rem' }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.4em', color: 'var(--sepia)', marginBottom: '0.5rem', opacity: 0.8 }}>
                    ✦ MANAGE YOUR DOSSIER ✦
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 4vw, 2rem)', color: 'var(--parchment)', lineHeight: 1 }}>
                    Settings
                </div>
            </div>

            {/* ════════════════════════════════════════ */}
            {/*   SECTION 1 — PROFILE                   */}
            {/* ════════════════════════════════════════ */}
            <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                    <User size={14} /> PROFILE
                </div>

                {/* Avatar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.5rem' }}>
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            width: 72, height: 72, borderRadius: '50%', overflow: 'hidden',
                            background: 'var(--ink)', border: '2px solid rgba(139,105,20,0.3)',
                            cursor: 'pointer', position: 'relative', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        {avatarPreview ? (
                            <img src={avatarPreview} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <Buster size={48} mood="smiling" />
                        )}
                        <div style={{
                            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            opacity: 0, transition: 'opacity 0.2s',
                        }}
                            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                            onMouseLeave={e => e.currentTarget.style.opacity = '0'}
                        >
                            <Camera size={18} color="var(--parchment)" />
                        </div>
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarSelect} />
                    <div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--bone)', marginBottom: '0.25rem' }}>
                            {avatarFile ? avatarFile.name : 'Click to upload a photo'}
                        </div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.4rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>
                            JPG, PNG, or WEBP · MAX 2MB
                        </div>
                    </div>
                </div>

                {/* Display Name */}
                <div style={{ marginBottom: '1rem' }}>
                    <label style={labelStyle}>DISPLAY NAME</label>
                    <input value={displayName} onChange={e => setDisplayName(e.target.value)} style={inputStyle} maxLength={30} />
                </div>

                {/* Bio */}
                <div>
                    <label style={labelStyle}>BIO</label>
                    <textarea
                        value={bio} onChange={e => setBio(e.target.value)}
                        style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                        maxLength={160}
                        placeholder="A brief dispatch about your cinematic journey..."
                    />
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.4rem', color: 'var(--ash)', textAlign: 'right', marginTop: '0.25rem' }}>
                        {bio.length}/160
                    </div>
                </div>
            </div>

            {/* ════════════════════════════════════════ */}
            {/*   SECTION 2 — ACCOUNT                   */}
            {/* ════════════════════════════════════════ */}
            <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                    <Lock size={14} /> ACCOUNT
                </div>

                {/* Username (read-only) */}
                <div style={{ marginBottom: '1rem' }}>
                    <label style={labelStyle}>USERNAME</label>
                    <div style={{ ...inputStyle, opacity: 0.5, cursor: 'not-allowed' }}>
                        @{user.username}
                    </div>
                </div>

                {/* Email (read-only) */}
                <div style={{ marginBottom: '1.25rem' }}>
                    <label style={labelStyle}>EMAIL</label>
                    <div style={{ ...inputStyle, opacity: 0.5, cursor: 'not-allowed' }}>
                        {email}
                    </div>
                </div>

                {/* Password Change */}
                <button
                    className="btn btn-ghost"
                    onClick={() => setShowPasswordChange(!showPasswordChange)}
                    style={{ fontSize: '0.6rem', padding: '0.5rem 1rem', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                    <Lock size={11} /> CHANGE PASSWORD {showPasswordChange ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>

                {showPasswordChange && (
                    <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', border: '1px solid rgba(139,105,20,0.08)' }}>
                        <div style={{ marginBottom: '0.75rem' }}>
                            <label style={labelStyle}>NEW PASSWORD</label>
                            <input
                                type="password" value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                style={inputStyle} placeholder="Min. 8 characters"
                            />
                        </div>
                        <div style={{ marginBottom: '0.75rem' }}>
                            <label style={labelStyle}>CONFIRM PASSWORD</label>
                            <input
                                type="password" value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                style={inputStyle} placeholder="Repeat password"
                            />
                        </div>
                        <button
                            className="btn btn-primary"
                            onClick={handlePasswordChange}
                            disabled={changingPassword || !newPassword || !confirmPassword}
                            style={{ fontSize: '0.6rem', padding: '0.5rem 1.25rem', letterSpacing: '0.15em', opacity: changingPassword ? 0.5 : 1 }}
                        >
                            {changingPassword ? 'UPDATING...' : 'UPDATE PASSWORD'}
                        </button>
                    </div>
                )}
            </div>

            {/* ════════════════════════════════════════ */}
            {/*   SECTION 3 — PRIVACY                   */}
            {/* ════════════════════════════════════════ */}
            <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                    <Eye size={14} /> PRIVACY
                </div>

                <label style={{ ...labelStyle, marginBottom: '0.75rem' }}>SOCIAL VISIBILITY</label>
                {[
                    { value: 'public', label: 'Public — Visible to everyone' },
                    { value: 'followers', label: 'Followers Only — Only your followers can see your profile' },
                    { value: 'private', label: 'Private — Only you can see your activity' },
                ].map(opt => (
                    <label key={opt.value} style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '0.55rem 0', cursor: 'pointer',
                        color: socialVisibility === opt.value ? 'var(--parchment)' : 'var(--fog)',
                        fontFamily: 'var(--font-body)', fontSize: '0.85rem',
                        transition: 'color 0.2s',
                    }}>
                        <input
                            type="radio" name="visibility"
                            checked={socialVisibility === opt.value}
                            onChange={() => setSocialVisibility(opt.value)}
                            style={{ accentColor: 'var(--sepia)' }}
                        />
                        {opt.label}
                    </label>
                ))}

                <label style={{ ...labelStyle, marginTop: '1.5rem', marginBottom: '0.75rem' }}>WHO CAN ENDORSE</label>
                {[
                    { value: 'everyone', label: 'Everyone' },
                    { value: 'followers', label: 'Followers Only' },
                    { value: 'nobody', label: 'Nobody' },
                ].map(opt => (
                    <label key={opt.value} style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '0.4rem 0', cursor: 'pointer',
                        color: privacyEndorsements === opt.value ? 'var(--parchment)' : 'var(--fog)',
                        fontFamily: 'var(--font-body)', fontSize: '0.85rem',
                        transition: 'color 0.2s',
                    }}>
                        <input
                            type="radio" name="privacyEndorse"
                            checked={privacyEndorsements === opt.value}
                            onChange={() => setPrivacyEndorsements(opt.value)}
                            style={{ accentColor: 'var(--sepia)' }}
                        />
                        {opt.label}
                    </label>
                ))}

                <label style={{ ...labelStyle, marginTop: '1.5rem', marginBottom: '0.75rem' }}>WHO CAN ANNOTATE</label>
                {[
                    { value: 'everyone', label: 'Everyone' },
                    { value: 'followers', label: 'Followers Only' },
                    { value: 'nobody', label: 'Nobody' },
                ].map(opt => (
                    <label key={opt.value} style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '0.4rem 0', cursor: 'pointer',
                        color: privacyAnnotations === opt.value ? 'var(--parchment)' : 'var(--fog)',
                        fontFamily: 'var(--font-body)', fontSize: '0.85rem',
                        transition: 'color 0.2s',
                    }}>
                        <input
                            type="radio" name="privacyAnnotate"
                            checked={privacyAnnotations === opt.value}
                            onChange={() => setPrivacyAnnotations(opt.value)}
                            style={{ accentColor: 'var(--sepia)' }}
                        />
                        {opt.label}
                    </label>
                ))}
            </div>

            {/* ════════════════════════════════════════ */}
            {/*   SECTION 4 — NOTIFICATIONS             */}
            {/* ════════════════════════════════════════ */}
            <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                    <Bell size={14} /> NOTIFICATIONS
                </div>

                {[
                    { label: 'New Followers', desc: 'When someone follows you', value: notifFollows, setter: setNotifFollows },
                    { label: 'Endorsements', desc: 'When someone endorses your log', value: notifEndorsements, setter: setNotifEndorsements },
                    { label: 'Annotations', desc: 'When someone comments on your log', value: notifComments, setter: setNotifComments },
                    { label: 'System Alerts', desc: 'Society announcements and updates', value: notifSystem, setter: setNotifSystem },
                ].map(item => (
                    <div key={item.label} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '0.75rem 0',
                        borderBottom: '1px solid rgba(139,105,20,0.05)',
                    }}>
                        <div>
                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--parchment)' }}>{item.label}</div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.42rem', letterSpacing: '0.1em', color: 'var(--fog)', marginTop: '0.15rem' }}>{item.desc}</div>
                        </div>
                        <button
                            style={toggleStyle(item.value)}
                            onClick={() => item.setter(!item.value)}
                            aria-label={`Toggle ${item.label}`}
                        >
                            <div style={toggleDotStyle(item.value)} />
                        </button>
                    </div>
                ))}

                <div style={{ padding: '1.25rem 0 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem', borderTop: '1px solid rgba(139,105,20,0.1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em', color: 'var(--sepia)' }}>
                        <Smartphone size={10} /> MOBILE INTEGRATION
                    </div>
                    <button 
                        className="btn btn-primary"
                        onClick={handleEnablePush}
                        disabled={pushEnabled}
                        style={{ fontSize: '0.55rem', padding: '0.6rem', letterSpacing: '0.1em', opacity: pushEnabled ? 0.5 : 1, width: '100%', justifyContent: 'center' }}
                    >
                        {pushEnabled ? 'PUSH NOTIFICATIONS ACTIVE' : 'ENABLE SECURE PUSH NOTIFICATIONS'}
                    </button>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.4rem', color: 'var(--ash)', lineHeight: 1.4 }}>
                        Receive immediate cinematic alerts directly to your device lock screen when the society interacts with your archive.
                    </div>
                </div>
            </div>

            {/* ════════════════════════════════════════ */}
            {/*   SECTION 5 — ACCOUNT ACTIONS            */}
            {/* ════════════════════════════════════════ */}
            <div style={sectionStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    <button
                        className="btn btn-ghost"
                        onClick={handleSignOut}
                        style={{ fontSize: '0.6rem', padding: '0.65rem 1rem', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'flex-start', width: '100%' }}
                    >
                        <LogOut size={12} /> SIGN OUT
                    </button>
                    <button
                        className="btn btn-ghost"
                        onClick={() => { toast.success('CSV export available from your profile page') }}
                        style={{ fontSize: '0.6rem', padding: '0.65rem 1rem', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'flex-start', width: '100%' }}
                    >
                        <Download size={12} /> EXPORT DATA (CSV)
                    </button>
                    <div style={{ height: 1, background: 'rgba(139,105,20,0.08)', margin: '0.25rem 0' }} />
                    <button
                        className="btn btn-ghost"
                        onClick={handleDeleteAccount}
                        style={{
                            fontSize: '0.6rem', padding: '0.65rem 1rem', letterSpacing: '0.1em',
                            borderColor: 'rgba(162,36,36,0.25)', color: '#a82424',
                            display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'flex-start', width: '100%',
                        }}
                    >
                        <Trash2 size={12} /> DELETE ACCOUNT
                    </button>
                </div>
            </div>

            {/* ── GOLD DIVIDER ── */}
            <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(139,105,20,0.2), transparent)', margin: '0.5rem 0 1.25rem' }} />

            {/* ── SAVE BUTTON ── */}
            <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || uploadingAvatar}
                style={{
                    width: '100%', padding: '1rem', fontSize: '0.7rem',
                    letterSpacing: '0.15em', justifyContent: 'center',
                    opacity: saving || uploadingAvatar ? 0.6 : 1,
                }}
            >
                {uploadingAvatar ? 'UPLOADING AVATAR...' : saving ? 'SAVING TO THE ARCHIVE…' : 'SAVE SETTINGS'}
            </button>

            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.4rem', letterSpacing: '0.1em', color: 'var(--fog)', textAlign: 'center', marginTop: '1rem', opacity: 0.5 }}>
                MEMBER SINCE {user.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase() : 'THE BEGINNING'}
            </div>
        </div>
    )
}
