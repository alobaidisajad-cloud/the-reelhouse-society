/**
 * EditProfilePage — Dedicated profile editing page.
 * Profile picture, bio, username, and dynamic custom links.
 * Nitrate Noir themed.
 */
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store'
import { supabase, isSupabaseConfigured } from '../supabaseClient'
import PageSEO from '../components/PageSEO'
import reelToast from '../utils/reelToast'
import { ArrowLeft, Camera, Link2, Plus, X, GripVertical, Film } from 'lucide-react'
import Buster from '../components/Buster'
import AvatarCropModal from '../components/AvatarCropModal'
import '../styles/settings.css'
import { ProfileTriptych } from '../components/profile/ProfileTriptych'

interface SocialLink {
    id: string
    title: string
    url: string
}

function generateId() {
    return Math.random().toString(36).slice(2, 9)
}

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
    const [showCropModal, setShowCropModal] = useState(false)
    const [rawImageSrc, setRawImageSrc] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // ── Links ──
    const [links, setLinks] = useState<SocialLink[]>([])

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

        // Load links from social_links (stored as array of {title, url})
        const stored = (user as any).social_links
        if (Array.isArray(stored)) {
            setLinks(stored.map((l: any) => ({ id: generateId(), title: l.title || '', url: l.url || '' })))
        } else if (stored && typeof stored === 'object') {
            // Legacy format: { platform: url } — convert to new format
            const converted = Object.entries(stored)
                .filter(([, v]: any) => v && (v as string).trim())
                .map(([k, v]: any) => ({ id: generateId(), title: k.charAt(0).toUpperCase() + k.slice(1), url: v }))
            if (converted.length > 0) setLinks(converted)
        }
    }, [user?.id])

    useEffect(() => {
        if (!isAuthenticated) navigate('/')
    }, [isAuthenticated, navigate])

    // ── Avatar Handling ──
    const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (file.size > 5 * 1024 * 1024) { reelToast.error('Image must be under 5MB'); return }
        // Revoke previous raw URL to prevent memory leaks
        if (rawImageSrc) URL.revokeObjectURL(rawImageSrc)
        // Open crop modal with the raw image
        const objectUrl = URL.createObjectURL(file)
        setRawImageSrc(objectUrl)
        setShowCropModal(true)
        // Reset file input so the same file can be re-selected
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const handleCropConfirm = (croppedBlob: Blob) => {
        const croppedFile = new File([croppedBlob], 'avatar.png', { type: 'image/png' })
        setAvatarFile(croppedFile)
        // Revoke previous preview URL before creating new one
        if (avatarPreview && avatarPreview.startsWith('blob:')) URL.revokeObjectURL(avatarPreview)
        setAvatarPreview(URL.createObjectURL(croppedBlob))
        setShowCropModal(false)
        // Revoke raw image URL — no longer needed
        if (rawImageSrc) URL.revokeObjectURL(rawImageSrc)
        setRawImageSrc(null)
    }

    const handleCropCancel = () => {
        setShowCropModal(false)
        // Revoke raw image URL — user cancelled
        if (rawImageSrc) URL.revokeObjectURL(rawImageSrc)
        setRawImageSrc(null)
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
            reelToast.error('Avatar upload failed: ' + (e.message || 'Unknown error'))
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

        const { data } = await supabase
            .from('profiles')
            .select('id')
            .eq('username', newUsername)
            .maybeSingle()

        if (data) { setUsernameError('Username already taken'); return false }
        setUsernameError('')
        return true
    }

    // ── Link Management ──
    const addLink = () => {
        if (links.length >= 10) { reelToast.error('Maximum 10 links allowed'); return }
        setLinks(prev => [...prev, { id: generateId(), title: '', url: '' }])
    }

    const removeLink = (id: string) => {
        setLinks(prev => prev.filter(l => l.id !== id))
    }

    const updateLink = (id: string, field: 'title' | 'url', value: string) => {
        setLinks(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l))
    }

    // ── Save ──
    const handleSave = async () => {
        if (!isSupabaseConfigured || !user) return
        if (displayName.trim().length > 50) { reelToast.error('Display name must be 50 or fewer characters.'); return }
        if (bio.trim().length > 500) { reelToast.error('Bio must be 500 or fewer characters.'); return }

        if (username !== user.username) {
            const isValid = await validateUsername(username)
            if (!isValid) return
        }

        setSaving(true)
        try {
            let avatarUrl = user.avatar_url
            if (avatarFile) {
                const uploaded = await uploadAvatar()
                if (uploaded) avatarUrl = uploaded
            }

            // Clean links — remove entries with no URL
            const cleanedLinks = links
                .filter(l => l.url && l.url.trim())
                .map(l => ({ title: l.title.trim() || 'Link', url: l.url.trim() }))

            const updateData: any = {
                display_name: displayName.trim(),
                bio: bio.trim(),
                avatar_url: avatarUrl,
                social_links: cleanedLinks,
            }

            if (username !== user.username) {
                updateData.username = username.trim()
            }

            const { error } = await supabase
                .from('profiles')
                .update(updateData)
                .eq('id', user.id)
            if (error) throw error

            useAuthStore.getState().updateUser({
                bio: bio.trim(),
                avatar_url: avatarUrl,
                display_name: displayName.trim(),
                username: username.trim(),
                social_links: cleanedLinks,
            } as any)

            setAvatarFile(null)
            reelToast.success('Profile updated ✦')

            if (username !== user.username) {
                navigate(`/user/${username}`, { replace: true })
            }
        } catch (e: any) {
            reelToast.error(e.message || 'Failed to save profile')
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
                            {avatarFile ? '✦ Portrait cropped and ready' : 'Click portrait to change'}
                        </div>
                        <div className="settings-avatar-spec">
                            JPG, PNG, or WEBP · MAX 5MB · ZOOM & POSITION
                        </div>
                    </div>

                    {/* Avatar Crop Modal */}
                    {showCropModal && rawImageSrc && (
                        <AvatarCropModal
                            imageSrc={rawImageSrc}
                            onConfirm={handleCropConfirm}
                            onCancel={handleCropCancel}
                        />
                    )}
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
            {/*   FAVORITE FILMS                    */}
            {/* ════════════════════════════════════ */}
            <div className="settings-section">
                <div className="settings-section-header">
                    <Film size={14} /> FAVORITE FILMS
                </div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--fog)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                    Choose 3 films that define your cinematic identity. Tap a slot to search and select.
                </p>
                <div style={{ maxWidth: 380, margin: '0 auto' }}>
                    <ProfileTriptych user={user} isOwnProfile={true} userRole={user?.role as string} />
                </div>
            </div>

            {/* ════════════════════════════════════ */}
            {/*   LINKS                             */}
            {/* ════════════════════════════════════ */}
            <div className="settings-section">
                <div className="settings-section-header">
                    <Link2 size={14} /> LINKS
                </div>

                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--fog)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                    Add links to your profile. They will be visible to anyone who visits your page.
                </p>

                {/* Existing Links */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {links.map((link, index) => (
                        <div
                            key={link.id}
                            style={{
                                padding: '1rem',
                                background: 'rgba(10,7,3,0.5)',
                                border: '1px solid rgba(139,105,20,0.1)',
                                borderRadius: '4px',
                                position: 'relative',
                                transition: 'border-color 0.2s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(139,105,20,0.25)')}
                            onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(139,105,20,0.1)')}
                        >
                            {/* Link Number + Remove */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <GripVertical size={12} style={{ color: 'var(--ash)', opacity: 0.4 }} />
                                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.4rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>
                                        LINK {index + 1}
                                    </span>
                                </div>
                                <button
                                    onClick={() => removeLink(link.id)}
                                    style={{
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        color: 'var(--ash)', padding: '0.25rem',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        borderRadius: '3px', transition: 'color 0.2s, background 0.2s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.color = '#c0392b'; e.currentTarget.style.background = 'rgba(162,36,36,0.1)' }}
                                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--ash)'; e.currentTarget.style.background = 'none' }}
                                    aria-label="Remove link"
                                >
                                    <X size={14} />
                                </button>
                            </div>

                            {/* Title Field */}
                            <div style={{ marginBottom: '0.5rem' }}>
                                <label className="settings-label">TITLE</label>
                                <input
                                    className="settings-input"
                                    value={link.title}
                                    onChange={e => updateLink(link.id, 'title', e.target.value)}
                                    placeholder="e.g. My Portfolio, Blog, Channel..."
                                    maxLength={40}
                                />
                            </div>

                            {/* URL Field */}
                            <div>
                                <label className="settings-label">URL</label>
                                <input
                                    className="settings-input"
                                    value={link.url}
                                    onChange={e => updateLink(link.id, 'url', e.target.value)}
                                    placeholder="https://..."
                                />
                            </div>
                        </div>
                    ))}
                </div>

                {/* Add Link Button */}
                <button
                    onClick={addLink}
                    style={{
                        width: '100%',
                        marginTop: links.length > 0 ? '1rem' : 0,
                        padding: '0.9rem',
                        background: 'rgba(139,105,20,0.05)',
                        border: '1px dashed rgba(139,105,20,0.2)',
                        borderRadius: '4px',
                        color: 'var(--sepia)',
                        fontFamily: 'var(--font-ui)',
                        fontSize: '0.6rem',
                        letterSpacing: '0.15em',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,105,20,0.1)'; e.currentTarget.style.borderColor = 'rgba(139,105,20,0.35)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(139,105,20,0.05)'; e.currentTarget.style.borderColor = 'rgba(139,105,20,0.2)' }}
                >
                    <Plus size={14} /> ADD LINK
                </button>

                {links.length > 0 && (
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.38rem', letterSpacing: '0.1em', color: 'var(--ash)', marginTop: '0.5rem', textAlign: 'center' }}>
                        {links.length}/10 LINKS
                    </div>
                )}
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
