/**
 * SettingsPage — User account settings.
 * Handles display name, privacy, data export, and notification preferences.
 * Nitrate Noir themed — matches the cinema society aesthetic.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore, useUIStore } from '../store'
import { supabase, isSupabaseConfigured } from '../supabaseClient'
import PageSEO from '../components/PageSEO'
import toast from 'react-hot-toast'

export default function SettingsPage() {
    const { user, isAuthenticated } = useAuthStore()
    const navigate = useNavigate()
    const [displayName, setDisplayName] = useState(user?.displayName || user?.username || '')
    const [bio, setBio] = useState(user?.bio || '')
    const [socialVisibility, setSocialVisibility] = useState<string>(user?.socialVisibility || 'public')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!isAuthenticated) navigate('/')
    }, [isAuthenticated, navigate])

    const handleSave = async () => {
        if (!isSupabaseConfigured || !user) return
        setSaving(true)
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    display_name: displayName,
                    bio,
                    social_visibility: socialVisibility,
                })
                .eq('username', user.username)
            if (error) throw error
            toast.success('Settings saved to the archive')
        } catch (e: any) {
            toast.error(e.message || 'Failed to save')
        } finally {
            setSaving(false)
        }
    }

    const handleExportCSV = () => {
        toast.success('CSV export available from your profile page')
    }

    const handleDeleteAccount = async () => {
        const confirmed = window.confirm(
            'This will permanently delete your account, all logs, lists, and reviews. This cannot be undone. Are you absolutely certain?'
        )
        if (!confirmed) return
        const doubleConfirm = window.confirm('FINAL WARNING: Type "delete" in the next prompt to confirm.')
        if (!doubleConfirm) return
        toast.error('Account deletion requires admin intervention. Contact support@reelhouse.app')
    }

    if (!user) return null

    const sectionStyle: React.CSSProperties = {
        padding: '1.5rem', marginBottom: '1.5rem',
        background: 'rgba(22,18,12,0.6)',
        border: '1px solid rgba(139,105,20,0.08)',
        borderRadius: '3px',
    }

    const labelStyle: React.CSSProperties = {
        fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em',
        color: 'var(--sepia)', marginBottom: '0.5rem', display: 'block',
    }

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '0.75rem', background: 'var(--soot)',
        border: '1px solid rgba(139,105,20,0.1)', borderRadius: '2px',
        color: 'var(--parchment)', fontFamily: 'var(--font-body)', fontSize: '0.9rem',
        outline: 'none',
    }

    return (
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '6rem 1.5rem 4rem' }}>
            <PageSEO title="Settings" description="Manage your ReelHouse Society account settings." path="/settings" />

            <div style={{
                fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--parchment)',
                marginBottom: '0.5rem',
            }}>
                SETTINGS
            </div>
            <div style={{
                fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em',
                color: 'var(--sepia)', marginBottom: '2rem',
            }}>
                MANAGE YOUR DOSSIER
            </div>

            {/* Account */}
            <div style={sectionStyle}>
                <div style={{ ...labelStyle, fontSize: '0.55rem', marginBottom: '1rem' }}>ACCOUNT</div>

                <div style={{ marginBottom: '1rem' }}>
                    <label style={labelStyle}>DISPLAY NAME</label>
                    <input
                        value={displayName}
                        onChange={e => setDisplayName(e.target.value)}
                        style={inputStyle}
                        maxLength={30}
                    />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                    <label style={labelStyle}>BIO</label>
                    <textarea
                        value={bio}
                        onChange={e => setBio(e.target.value)}
                        style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                        maxLength={160}
                        placeholder="A brief dispatch about your cinematic journey..."
                    />
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.4rem', color: 'var(--ash)', textAlign: 'right', marginTop: '0.25rem' }}>
                        {bio.length}/160
                    </div>
                </div>
            </div>

            {/* Privacy */}
            <div style={sectionStyle}>
                <div style={{ ...labelStyle, fontSize: '0.55rem', marginBottom: '1rem' }}>PRIVACY</div>

                <label style={{ ...labelStyle, marginBottom: '0.75rem' }}>SOCIAL VISIBILITY</label>
                {['public', 'members', 'private'].map(opt => (
                    <label key={opt} style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '0.5rem 0', cursor: 'pointer',
                        color: socialVisibility === opt ? 'var(--parchment)' : 'var(--fog)',
                        fontFamily: 'var(--font-body)', fontSize: '0.85rem',
                    }}>
                        <input
                            type="radio"
                            name="visibility"
                            checked={socialVisibility === opt}
                            onChange={() => setSocialVisibility(opt)}
                            style={{ accentColor: 'var(--sepia)' }}
                        />
                        {opt === 'public' ? 'Public — Visible to everyone' :
                         opt === 'members' ? 'Members Only — Society members can see your profile' :
                         'Private — Only you can see your activity'}
                    </label>
                ))}
            </div>

            {/* Data */}
            <div style={sectionStyle}>
                <div style={{ ...labelStyle, fontSize: '0.55rem', marginBottom: '1rem' }}>DATA</div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button className="btn btn-ghost" onClick={handleExportCSV} style={{ fontSize: '0.7rem', padding: '0.5rem 1rem' }}>
                        EXPORT CSV
                    </button>
                    <button
                        className="btn btn-ghost"
                        onClick={handleDeleteAccount}
                        style={{
                            fontSize: '0.7rem', padding: '0.5rem 1rem',
                            borderColor: 'rgba(162,36,36,0.3)', color: '#a82424',
                        }}
                    >
                        DELETE ACCOUNT
                    </button>
                </div>
            </div>

            {/* Save */}
            <button
                className="btn"
                onClick={handleSave}
                disabled={saving}
                style={{
                    width: '100%', padding: '1rem', fontSize: '0.7rem',
                    letterSpacing: '0.15em', justifyContent: 'center',
                }}
            >
                {saving ? 'SAVING TO THE ARCHIVE…' : 'SAVE SETTINGS'}
            </button>
        </div>
    )
}
