/**
 * EditProfilePage — Dedicated profile editing page.
 * Only profile-specific settings: avatar, bio, username, social links.
 * Nitrate Noir themed.
 */
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store'
import { supabase, isSupabaseConfigured } from '../supabaseClient'
import PageSEO from '../components/PageSEO'
import toast from 'react-hot-toast'
import { ArrowLeft, Camera, Instagram, Youtube, Twitter, Globe, Facebook, Link2 } from 'lucide-react'
import Buster from '../components/Buster'
import '../styles/settings.css'

const SOCIAL_PLATFORMS = [
    { key: 'instagram', label: 'Instagram', icon: Instagram, placeholder: 'instagram.com/yourname' },
    { key: 'twitter', label: 'X (Twitter)', icon: Twitter, placeholder: 'x.com/yourname' },
    { key: 'youtube', label: 'YouTube', icon: Youtube, placeholder: 'youtube.com/@yourchannel' },
    { key: 'facebook', label: 'Facebook', icon: Facebook, placeholder: 'facebook.com/yourname' },
    { key: 'letterboxd', label: 'Letterboxd', icon: Globe, placeholder: 'letterboxd.com/yourname' },
    { key: 'website', label: 'Website', icon: Link2, placeholder: 'yourwebsite.com' },
]

export default function EditProfilePage() {
    const { user, isAuthenticated } = useAuthStore()
    const navigate = useNavigate()

    // ── Profile Fields ──
    const [displayName, setDisplayName] = useState(user?.display_name || user?.displayName || user?.username || '')
    const [username, setUsername] = useState(user?.username || '')
    const [bio, setBio] = useState(user?.bio || '')
    const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatar_url || null)
    const [avatarFile, setAvatarFile] = useState<File | null>(null)
    const [uploadingAvatar, setUploadingAvatar] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // ── Social Links ──
    const [socialLinks, setSocialLinks] = useState<Record<string, string>>({
        instagram: '',
        twitter: '',
        youtube: '',
        facebook: '',
        letterboxd: '',
        website: '',
    })

    // ── State ──
    const [saving, setSaving] = useState(false)
    const [usernameError, setUsernameError] = useState('')

    // ── Re-sync ──
    useEffect(() => {
        if (!user) return
        setDisplayName((user as any).display_name || (user as any).displayName || user.username || '')
        setUsername(user.username || '')
        setBio(user.bio || '')
        setAvatarPreview(user.avatar_url || null)

        // Load social links
        const links = (user as any).social_links || {}
        setSocialLinks(prev => ({ ...prev, ...links }))
    }, [user?.id])

    useEffect(() => {
        if (!isAuthenticated) navigate('/')
    }, [isAuthenticated, navigate])

    // ── Avatar Handling ──
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
            const ext = avatarFile.name.split('.').pop()?.toLowerCase() || 'jpg'
            const path = `${user.id}/avatar.${ext}`
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(path, avatarFile, {
                    upsert: true,
                    contentType: avatarFile.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
                })
            if (uploadError) throw uploadError
            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
            return urlData.publicUrl + `?v=${Date.now()}`
        } catch (e: any) {
            toast.error('Avatar upload failed: ' + (e.message || 'Unknown error'))
            return null
        } finally {
            setUploadingAvatar(false)
        }
    }

    // ── Username Validation ──
    const validateUsername = async (newUsername: string) => {
        if (newUsername === user?.username) { setUsernameError(''); return true }
        if (newUsername.length < 3) { setUsernameError('Must be at least 3 characters'); return false }
        if (newUsername.length > 20) { setUsernameError('Must be 20 characters or fewer'); return false }
        if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) { setUsernameError('Only letters, numbers, and underscores'); return false }

        // Check availability
        const { data } = await supabase
            .from('profiles')
            .select('id')
            .eq('username', newUsername)
            .maybeSingle()

        if (data) { setUsernameError('Username already taken'); return false }
        setUsernameError('')
        return true
    }

    // ── Update Social Link ──
    const updateSocialLink = (platform: string, value: string) => {
        setSocialLinks(prev => ({ ...prev, [platform]: value }))
    }

    // ── Save ──
    const handleSave = async () => {
        if (!isSupabaseConfigured || !user) return
        if (displayName.trim().length > 50) { toast.error('Display name must be 50 or fewer characters.'); return }
        if (bio.trim().length > 500) { toast.error('Bio must be 500 or fewer characters.'); return }

        // Validate username if changed
        if (username !== user.username) {
            const isValid = await validateUsername(username)
            if (!isValid) return
        }

        setSaving(true)
        try {
            // Upload avatar if changed
            let avatarUrl = user.avatar_url
            if (avatarFile) {
                const uploaded = await uploadAvatar()
                if (uploaded) avatarUrl = uploaded
            }

            // Clean social links — remove empty values
            const cleanedLinks: Record<string, string> = {}
            for (const [k, v] of Object.entries(socialLinks)) {
                if (v && v.trim()) cleanedLinks[k] = v.trim()
            }

            // Update profile
            const updateData: any = {
                display_name: displayName.trim(),
                bio: bio.trim(),
                avatar_url: avatarUrl,
                social_links: cleanedLinks,
            }

            // Only update username if changed
            if (username !== user.username) {
                updateData.username = username.trim()
            }

            const { error } = await supabase
                .from('profiles')
                .update(updateData)
                .eq('id', user.id)
            if (error) throw error

            // Update local state
            useAuthStore.getState().updateUser({
                bio: bio.trim(),
                avatar_url: avatarUrl,
                display_name: displayName.trim(),
                username: username.trim(),
                social_links: cleanedLinks,
            } as any)

            setAvatarFile(null)
            toast.success('Profile updated ✦')

            // Navigate to new username profile if changed
            if (username !== user.username) {
                navigate(`/user/${username}`, { replace: true })
            }
        } catch (e: any) {
            toast.error(e.message || 'Failed to save profile')
        } finally {
            setSaving(false)
        }
    }

    if (!user) return null

    return (
        <div className="settings-page">
            <PageSEO title="Edit Profile" description="Edit your ReelHouse Society profile." path="/edit-profile" />

            {/* ── Back Button ── */}
            <button
                onClick={() => navigate(`/user/${user.username}`)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--fog)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '2rem', padding: 0, transition: 'color 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--sepia)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--fog)'}
            >
                <ArrowLeft size={14} /> BACK TO PROFILE
            </button>

            {/* ── HERO ── */}
            <div className="settings-hero">
                <div className="settings-hero-eyebrow">✦ THE DOSSIER BUREAU ✦</div>
                <h1 className="settings-hero-title">Edit Profile</h1>
                <p className="settings-hero-desc">
                    Shape how the society sees you.
                </p>
            </div>

            {/* ════════════════════════════════════ */}
            {/*   PROFILE PICTURE                   */}
            {/* ════════════════════════════════════ */}
            <div className="settings-section">
                <div className="settings-section-header">
                    <Camera size={14} /> PROFILE PICTURE
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
                    <div
                        className="settings-avatar"
                        onClick={() => fileInputRef.current?.click()}
                        style={{ width: 120, height: 120 }}
                    >
                        {avatarPreview ? (
                            <img src={avatarPreview} alt="Avatar" />
                        ) : (
                            <Buster size={72} mood="smiling" />
                        )}
                        <div className="settings-avatar-overlay">
                            <Camera size={24} color="var(--parchment)" />
                        </div>
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarSelect} />
                    <div style={{ textAlign: 'center' }}>
                        <div className="settings-avatar-filename">
                            {avatarFile ? avatarFile.name : 'Click portrait to change'}
                        </div>
                        <div className="settings-avatar-spec">
                            JPG, PNG, or WEBP · MAX 2MB
                        </div>
                    </div>
                </div>
            </div>

            {/* ════════════════════════════════════ */}
            {/*   IDENTITY                          */}
            {/* ════════════════════════════════════ */}
            <div className="settings-section">
                <div className="settings-section-header">
                    <span style={{ fontSize: '14px' }}>✦</span> IDENTITY
                </div>

                {/* Username */}
                <div className="settings-field">
                    <label className="settings-label">USERNAME</label>
                    <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--fog)', pointerEvents: 'none' }}>@</span>
                        <input
                            className="settings-input"
                            value={username}
                            onChange={e => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')); setUsernameError('') }}
                            maxLength={20}
                            style={{ paddingLeft: '2rem' }}
                        />
                    </div>
                    {usernameError && (
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.42rem', letterSpacing: '0.1em', color: '#c0392b', marginTop: '0.4rem' }}>
                            {usernameError}
                        </div>
                    )}
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.38rem', letterSpacing: '0.1em', color: 'var(--ash)', marginTop: '0.3rem' }}>
                        Letters, numbers, and underscores only · 3-20 characters
                    </div>
                </div>

                {/* Display Name */}
                <div className="settings-field">
                    <label className="settings-label">DISPLAY NAME</label>
                    <input
                        className="settings-input"
                        value={displayName}
                        onChange={e => setDisplayName(e.target.value)}
                        maxLength={30}
                        placeholder="Your name in the credits..."
                    />
                </div>

                {/* Bio */}
                <div className="settings-field">
                    <label className="settings-label">BIO</label>
                    <textarea
                        className="settings-input settings-textarea"
                        value={bio}
                        onChange={e => setBio(e.target.value)}
                        maxLength={160}
                        placeholder="A brief dispatch about your cinematic journey..."
                    />
                    <div className="settings-char-count">
                        {bio.length}/160
                    </div>
                </div>
            </div>

            {/* ════════════════════════════════════ */}
            {/*   SOCIAL LINKS                      */}
            {/* ════════════════════════════════════ */}
            <div className="settings-section">
                <div className="settings-section-header">
                    <Globe size={14} /> SOCIAL LINKS
                </div>

                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--fog)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                    Connect your other profiles. These will appear on your public profile page.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {SOCIAL_PLATFORMS.map(platform => {
                        const Icon = platform.icon
                        return (
                            <div key={platform.key} className="settings-field" style={{ marginBottom: 0 }}>
                                <label className="settings-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Icon size={10} /> {platform.label.toUpperCase()}
                                </label>
                                <input
                                    className="settings-input"
                                    value={socialLinks[platform.key] || ''}
                                    onChange={e => updateSocialLink(platform.key, e.target.value)}
                                    placeholder={platform.placeholder}
                                />
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* ── SAVE BUTTON ── */}
            <button
                className="settings-save-btn"
                onClick={handleSave}
                disabled={saving || uploadingAvatar}
            >
                {uploadingAvatar ? 'UPLOADING PORTRAIT...' : saving ? 'ARCHIVING PROFILE…' : '✦ SAVE PROFILE ✦'}
            </button>

            <div className="settings-member-badge">
                MEMBER SINCE {user.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase() : 'THE BEGINNING'}
            </div>
        </div>
    )
}
