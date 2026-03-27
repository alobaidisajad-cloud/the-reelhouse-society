import { useState, useRef } from 'react'
import { Edit2, Check, X, Upload, Film, MapPin, Globe, Mail, Phone, Instagram, Twitter } from 'lucide-react'
import toast from 'react-hot-toast'

const VIBE_OPTIONS = ['Arthouse', 'Drive-In', 'Historic', 'IMAX', 'Midnight Palace', 'Repertory', 'Horror House', 'Indie', 'Experimental', 'Family']

import { Venue } from '../../types'

interface ProfileTabProps {
    venue: Venue;
    onSave: (updates: Partial<Venue>) => Promise<void> | void;
}

export default function ProfileTab({ venue, onSave }: ProfileTabProps) {
    const [draft, setDraft] = useState<any>({ ...venue })
    const [editing, setEditing] = useState(false)
    const logoRef = useRef<HTMLInputElement>(null)
    const set = (k: keyof Venue, v: string | string[]) => setDraft((p: Partial<Venue>) => ({ ...p, [k]: v }))

    const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (ev) => set('logo', ev.target?.result as string)
        reader.readAsDataURL(file)
    }

    const toggleVibe = (v: string) => {
        const cur = draft.vibes || []
        set('vibes', cur.includes(v) ? cur.filter((x: string) => x !== v) : [...cur, v])
    }

    const fields: Array<{ key: keyof Venue; label: string; placeholder: string; Icon: React.ElementType }> = [
        { key: 'name', label: 'VENUE NAME', placeholder: 'Your Cinema Name', Icon: Film },
        { key: 'location', label: 'CITY / REGION', placeholder: 'Brooklyn, NY', Icon: MapPin },
        { key: 'address', label: 'FULL ADDRESS', placeholder: '42 Clinton Ave, Brooklyn, NY 11238', Icon: MapPin },
        { key: 'mapLink', label: 'GOOGLE MAPS LINK', placeholder: 'https://maps.google.com/...', Icon: Globe },
        { key: 'email', label: 'BOOKING EMAIL', placeholder: 'bookings@yourcinema.com', Icon: Mail },
        { key: 'phone', label: 'PHONE', placeholder: '+1 (555) 000-0000', Icon: Phone },
        { key: 'website', label: 'WEBSITE', placeholder: 'https://yourcinema.com', Icon: Globe },
        { key: 'instagram', label: 'INSTAGRAM HANDLE', placeholder: '@yourcinema', Icon: Instagram },
        { key: 'twitter', label: 'TWITTER / X HANDLE', placeholder: '@yourcinema', Icon: Twitter },
    ]

    return (
        <div style={{ maxWidth: 680 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', color: 'var(--parchment)' }}>Venue Profile</div>
                {!editing ? (
                    <button className="btn btn-ghost" onClick={() => { setDraft({ ...venue }); setEditing(true) }}>
                        <Edit2 size={12} /> Edit Profile
                    </button>
                ) : (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-primary" onClick={() => { onSave(draft); setEditing(false); toast.success('Profile updated') }}><Check size={12} /> Save</button>
                        <button className="btn btn-ghost" onClick={() => setEditing(false)}><X size={12} /> Cancel</button>
                    </div>
                )}
            </div>

            {/* Logo / Avatar */}
            <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <div
                    onClick={() => editing && logoRef.current?.click()}
                    style={{ width: 90, height: 90, borderRadius: '50%', border: '2px solid var(--sepia)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ink)', cursor: editing ? 'pointer' : 'default', flexShrink: 0 }}
                >
                    {(editing ? draft.logo : venue.logo) ? (
                        <img src={editing ? draft.logo : venue.logo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--sepia)', opacity: 0.4 }}>
                            {(venue.name || '?')[0]}
                        </span>
                    )}
                </div>
                {editing && (
                    <div>
                        <button className="btn btn-ghost" onClick={() => logoRef.current?.click()} style={{ fontSize: '0.6rem', marginBottom: '0.4rem' }}>
                            <Upload size={12} /> Upload Logo
                        </button>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.68rem', color: 'var(--fog)', fontStyle: 'italic' }}>JPG, PNG — max 2MB</div>
                        <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogo} />
                    </div>
                )}
            </div>

            {/* Text fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {fields.map(({ key, label, placeholder, Icon }) => (
                    <div key={key}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.18em', color: 'var(--sepia)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Icon size={9} /> {label}
                        </div>
                        {editing ? (
                            <input className="input" placeholder={placeholder} value={(draft[key] as string) || ''} onChange={e => set(key, e.target.value)} />
                        ) : (
                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: venue[key] ? 'var(--bone)' : 'var(--fog)', padding: '0.4rem 0', borderBottom: '1px solid var(--ash)', fontStyle: venue[key] ? 'normal' : 'italic' }}>
                                {(venue[key] as string) || 'Not set'}
                            </div>
                        )}
                    </div>
                ))}

                {/* Bio */}
                <div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.18em', color: 'var(--sepia)', marginBottom: '0.35rem' }}>BIO</div>
                    {editing ? (
                        <textarea className="input" placeholder="A short tagline or mission statement..." value={draft.bio || ''} onChange={e => set('bio', e.target.value)} style={{ minHeight: 70 }} />
                    ) : (
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: venue.bio ? 'var(--bone)' : 'var(--fog)', padding: '0.4rem 0', borderBottom: '1px solid var(--ash)', fontStyle: venue.bio ? 'italic' : 'italic', lineHeight: 1.6 }}>
                            {venue.bio || 'Not set'}
                        </div>
                    )}
                </div>

                {/* Description */}
                <div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.18em', color: 'var(--sepia)', marginBottom: '0.35rem' }}>FULL DESCRIPTION</div>
                    {editing ? (
                        <textarea className="input" placeholder="Tell your full story..." value={draft.description || ''} onChange={e => set('description', e.target.value)} style={{ minHeight: 110 }} />
                    ) : (
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--bone)', padding: '0.4rem 0', borderBottom: '1px solid var(--ash)', lineHeight: 1.7 }}>
                            {venue.description}
                        </div>
                    )}
                </div>

                {/* Vibe tags */}
                <div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.18em', color: 'var(--sepia)', marginBottom: '0.6rem' }}>VIBE TAGS</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {VIBE_OPTIONS.map(v => {
                            const active = (editing ? draft.vibes : venue.vibes).includes(v)
                            return (
                                <button key={v} type="button" onClick={() => editing && toggleVibe(v)}
                                    className={`tag ${active ? 'tag-flicker' : 'tag-vibe'}`}
                                    style={{ cursor: editing ? 'pointer' : 'default' }}>
                                    {v}
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}
